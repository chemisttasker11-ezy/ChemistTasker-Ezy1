"""Invoice email interleavings against migrated PostgreSQL and real finance actions."""
from copy import deepcopy
from decimal import Decimal
from queue import Empty, Queue
from threading import Event, Thread
from time import monotonic
from types import SimpleNamespace
from unittest import skipUnless
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.db import DatabaseError, close_old_connections, connection, transaction
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core import task_queue
from invoicing.models import Invoice, InvoiceLineItem
from worker_finance.models import Customer, Delivery


POSTGRES_ONLY = skipUnless(connection.vendor == "postgresql", "Requires migrated PostgreSQL and independent row locks.")


@POSTGRES_ONLY
class InvoiceDeliveryConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.worker = get_user_model().objects.create_user(
            email="delivery-worker@example.test", role="PHARMACIST", is_active=True,
        )
        self.customer = Customer.objects.create(
            owner=self.worker, name="Delivery customer", email="accounts@example.test",
        )
        self.today = timezone.localdate()
        self.client = APIClient()
        self.client.force_authenticate(self.worker)
        response = self.client.post("/api/v1/finance/invoices/", {
            "request_key": str(uuid4()),
            "customer_id": self.customer.pk,
            "invoice_date": self.today.isoformat(),
            "due_date": self.today.isoformat(),
            "issuer_name": "Delivery worker",
            "issuer_abn": "51824753556",
            "gst_registered": True,
            "price_mode": "exclusive",
            "super_mode": "none",
            "lines": [{
                "description": "Professional services", "category_code": "ProfessionalServices",
                "unit": "Hours", "quantity": "10.00", "unit_price": "100.00",
                "discount": "0.00", "tax_code": "GST", "super_eligible": False,
            }],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.invoice = Invoice.objects.get(pk=response.data["id"])
        self.path = f"/api/v1/finance/invoices/{self.invoice.pk}/"
        self.assertEqual(self.invoice.calculation["payable"], "1100.00")

    def test_finance_send_completion_preserves_payment_recorded_during_smtp(self):
        self.assert_paid_completion("mark-paid")

    def test_finance_send_completion_preserves_receipt_payment_recorded_during_smtp(self):
        self.assert_paid_completion("payments")

    def assert_paid_completion(self, payment_action):
        first = self.client.post(self.path + "payments/", {
            "request_key": str(uuid4()), "date": self.today.isoformat(),
            "amount": "440.00", "reference": "First payment",
        }, format="json")
        self.assertEqual(first.status_code, 200, first.data)
        original_receipt = self.invoice.payments.get()
        original_values = (
            original_receipt.pk, original_receipt.request_key, original_receipt.date,
            original_receipt.amount, original_receipt.gst, original_receipt.sales,
            original_receipt.reference,
        )
        smtp_entered, payment_finished = Event(), Event()
        outcomes = Queue()
        user_model, worker_pk = type(self.worker), self.worker.pk

        def mark_paid_while_smtp_waits():
            close_old_connections()
            try:
                if not smtp_entered.wait(5):
                    raise AssertionError("The finance send never reached SMTP")
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '6s'")
                    cursor.execute("SET statement_timeout = '12s'")
                client = APIClient()
                client.force_authenticate(user_model.objects.get(pk=worker_pk))
                payload = {"version": 1} if payment_action == "mark-paid" else {
                    "request_key": str(uuid4()), "date": self.today.isoformat(),
                    "amount": "660.00", "reference": "Remaining payment",
                }
                response = client.post(self.path + payment_action + "/", payload, format="json")
                outcomes.put(("response", response.status_code, response.data))
            except Exception as exc:
                outcomes.put(("error", repr(exc)))
            finally:
                payment_finished.set()
                connection.close()

        def accept_after_payment(message, fail_silently=False):
            smtp_entered.set()
            if not payment_finished.wait(10):
                raise AssertionError("Mark paid did not finish while SMTP was in flight")
            return 1

        payer = Thread(target=mark_paid_while_smtp_waits, daemon=True)
        payer.start()
        try:
            with patch("worker_finance.documents.render_pdf", return_value=b"%PDF-frozen-v1"), patch(
                "django.core.mail.EmailMessage.send", autospec=True, side_effect=accept_after_payment,
            ) as smtp:
                response = self.client.post(self.path + "send/", {"version": 1, "confirmed": True}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            smtp.assert_called_once()
        finally:
            payer.join(15)
        self.assertFalse(payer.is_alive(), "Mark-paid request exceeded bounded PostgreSQL timeouts")
        payment_result = outcomes.get(timeout=2)
        self.assertEqual(payment_result[:2], ("response", 200), payment_result)

        self.invoice.refresh_from_db()
        receipts = list(self.invoice.payments.order_by("id"))
        self.assertEqual(len(receipts), 2)
        self.assertEqual((
            receipts[0].pk, receipts[0].request_key, receipts[0].date,
            receipts[0].amount, receipts[0].gst, receipts[0].sales, receipts[0].reference,
        ), original_values)
        self.assertEqual(
            [(receipt.amount, receipt.gst, receipt.sales) for receipt in receipts],
            [(Decimal("440.00"), Decimal("40.00"), Decimal("440.00")),
             (Decimal("660.00"), Decimal("60.00"), Decimal("660.00"))],
        )
        delivery = Delivery.objects.get(invoice=self.invoice, version=1)
        self.assertEqual(delivery.status, "sent")
        self.assertIsNotNone(delivery.sent_at)
        self.assertEqual(self.invoice.status, "paid")
        self.assertEqual(self.invoice.revisions.get(version=1).invoice_status, "paid")
        self.assertEqual(response.data["document"]["status"], "paid")
        self.assertEqual(Decimal(response.data["document"]["balance"]), Decimal("0.00"))

    def test_finance_completion_does_not_lock_delivery_before_waiting_for_invoice(self):
        smtp_entered, release_smtp, finished = Event(), Event(), Event()
        pids, outcomes = Queue(), Queue()
        user_model, worker_pk = type(self.worker), self.worker.pk

        def accept_after_invoice_is_locked(message, fail_silently=False):
            smtp_entered.set()
            if not release_smtp.wait(10):
                raise AssertionError("The competing invoice transaction never released SMTP")
            return 1

        def send_invoice():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '6s'")
                    cursor.execute("SET statement_timeout = '12s'")
                    cursor.execute("SELECT pg_backend_pid()")
                    pids.put(cursor.fetchone()[0])
                client = APIClient()
                client.force_authenticate(user_model.objects.get(pk=worker_pk))
                response = client.post(self.path + "send/", {"version": 1, "confirmed": True}, format="json")
                outcomes.put(("response", response.status_code, response.data))
            except Exception as exc:
                outcomes.put(("error", repr(exc)))
            finally:
                finished.set()
                connection.close()

        with patch("worker_finance.documents.render_pdf", return_value=b"%PDF-frozen-v1"), patch(
            "django.core.mail.EmailMessage.send", autospec=True, side_effect=accept_after_invoice_is_locked,
        ) as smtp:
            sender = Thread(target=send_invoice, daemon=True)
            sender.start()
            try:
                self.assertTrue(smtp_entered.wait(5), "The finance send never reached SMTP")
                sender_pid = pids.get(timeout=2)
                with transaction.atomic():
                    Invoice.objects.select_for_update().get(pk=self.invoice.pk)
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT pg_backend_pid()")
                        holder_pid = cursor.fetchone()[0]
                    release_smtp.set()
                    # Confirm that completion has actually reached this held
                    # invoice, rather than making an assertion on thread timing.
                    deadline = monotonic() + 3
                    blockers = []
                    while monotonic() < deadline and not finished.is_set():
                        with connection.cursor() as cursor:
                            cursor.execute("SELECT pg_blocking_pids(%s)", [sender_pid])
                            blockers = cursor.fetchone()[0]
                        if holder_pid in blockers:
                            break
                    self.assertIn(holder_pid, blockers, "Email completion never waited for the invoice lock")
                    # A reservation/completion path holding Invoice must still
                    # be able to take Delivery. The old reverse order holds
                    # Delivery while waiting above, making this NOWAIT fail.
                    try:
                        with transaction.atomic():
                            delivery = Delivery.objects.select_for_update(nowait=True).get(
                                invoice=self.invoice, version=1,
                            )
                    except DatabaseError as exc:
                        self.fail(f"Email completion held Delivery before obtaining Invoice: {exc}")
                    self.assertEqual(delivery.status, "sending")
            finally:
                release_smtp.set()
                sender.join(15)
            self.assertFalse(sender.is_alive(), "Send completion exceeded bounded PostgreSQL timeouts")
            smtp.assert_called_once()
        result = outcomes.get(timeout=2)
        self.assertEqual(result[:2], ("response", 200), result)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "sent")
        self.assertEqual(self.invoice.revisions.get(version=1).invoice_status, "sent")
        self.assertEqual(Delivery.objects.get(invoice=self.invoice, version=1).status, "sent")
        self.assertFalse(self.invoice.payments.exists())

    @override_settings(
        CELERY_TASK_ALWAYS_EAGER=False,
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    )
    def test_contending_legacy_tasks_send_once_and_later_redelivery_does_not_resend(self):
        legacy = Invoice.objects.create(
            user=self.worker, external=True, custom_bill_to_name="Legacy customer",
            issuer_first_name="Delivery", issuer_last_name="Worker",
            issuer_email=self.worker.email, bill_to_email="legacy@example.test",
            cc_emails="copy@example.test", invoice_date=self.today, due_date=self.today,
            subtotal=Decimal("100.00"), total=Decimal("100.00"),
        )
        InvoiceLineItem.objects.create(
            invoice=legacy, description="Legacy services", category_code="ProfessionalServices",
            unit="Hours", quantity=Decimal("1.00"), unit_price=Decimal("100.00"), total=Decimal("100.00"),
        )
        # First-time task discovery may initialize Celery's configuration; use
        # the real Django setting instead of patching that transient object.
        task_queue.registered_task_name("invoicing.tasks.deliver_invoice_email")
        with patch.object(
            task_queue.current_app, "send_task", return_value=SimpleNamespace(id="legacy-delivery-task"),
        ) as publish, patch("invoicing.views.render_invoice_to_pdf", return_value=b"%PDF-legacy-v1"):
            queued = self.client.post(f"/api/v1/invoices/{legacy.pk}/send/", {}, format="json")
        self.assertEqual(queued.status_code, 200, queued.data)
        publish.assert_called_once()
        published = publish.call_args
        task = task_queue.current_app.tasks[published.args[0]]
        args = deepcopy(published.kwargs.get("args", ()))
        kwargs = deepcopy(published.kwargs.get("kwargs", {}))
        delivery = Delivery.objects.get(invoice=legacy, version=1)
        self.assertEqual(delivery.status, "legacy_queued")

        smtp_entered, release_smtp = Event(), Event()
        outcomes, threads = Queue(), []

        def accept_after_other_task_returns(message, fail_silently=False):
            smtp_entered.set()
            if not release_smtp.wait(12):
                raise AssertionError("The losing task did not finish while the winner was at SMTP")
            return 1

        def run_task(index, pids, finished):
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '6s'")
                    cursor.execute("SET statement_timeout = '12s'")
                    cursor.execute("SELECT pg_backend_pid()")
                    pids.put(cursor.fetchone()[0])
                result = task.run(*deepcopy(args), **deepcopy(kwargs))
                outcomes.put((index, "returned", result))
            except Exception as exc:
                outcomes.put((index, "error", repr(exc)))
            finally:
                finished.set()
                connection.close()

        with patch(
            "django.core.mail.EmailMultiAlternatives.send", autospec=True,
            side_effect=accept_after_other_task_returns,
        ) as smtp:
            try:
                with transaction.atomic():
                    Invoice.objects.select_for_update().get(pk=legacy.pk)
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT pg_backend_pid()")
                        earlier_pids = [cursor.fetchone()[0]]
                    # Both real task executions reach the same locked invoice
                    # before either may claim its delivery reservation.
                    for index in range(2):
                        pids, finished = Queue(), Event()
                        thread = Thread(target=run_task, args=(index, pids, finished), daemon=True)
                        threads.append(thread)
                        thread.start()
                        pid = pids.get(timeout=3)
                        blockers = []
                        deadline = monotonic() + 3
                        while monotonic() < deadline and not finished.is_set():
                            with connection.cursor() as cursor:
                                cursor.execute("SELECT pg_blocking_pids(%s)", [pid])
                                blockers = cursor.fetchone()[0]
                            if set(blockers).intersection(earlier_pids):
                                break
                        self.assertTrue(
                            set(blockers).intersection(earlier_pids),
                            f"Legacy task {index} never contended for the held invoice; blockers={blockers}",
                        )
                        earlier_pids.append(pid)
                self.assertTrue(smtp_entered.wait(5), "Neither legacy task reached SMTP")
                try:
                    loser = outcomes.get(timeout=5)
                except Empty:
                    self.fail("The losing legacy task did not return while the winning SMTP attempt was in flight")
                self.assertEqual(loser[1], "returned", loser)
                smtp.assert_called_once()
            finally:
                release_smtp.set()
                for thread in threads:
                    thread.join(15)
            self.assertTrue(all(not thread.is_alive() for thread in threads), "Legacy task exceeded bounded waits")
            winner = outcomes.get(timeout=2)
            self.assertEqual(winner[1], "returned", winner)
            self.assertNotEqual(winner[0], loser[0])
            delivery.refresh_from_db()
            self.assertEqual(delivery.status, "sent")
            self.assertIsNotNone(delivery.sent_at)
            sent_at = delivery.sent_at
            # A broker can redeliver even after successful local finalization.
            task.run(*deepcopy(args), **deepcopy(kwargs))
            smtp.assert_called_once()
        delivery.refresh_from_db()
        legacy.refresh_from_db()
        self.assertEqual((delivery.status, delivery.sent_at), ("sent", sent_at))
        self.assertEqual(delivery.version, 1)
        self.assertEqual(Delivery.objects.filter(invoice=legacy).count(), 1)
        self.assertEqual((legacy.version, legacy.status, legacy.request_key), (1, "sent", None))
        self.assertEqual(legacy.user_id, self.worker.pk)
        self.assertIsNone(legacy.customer_id)
        self.assertEqual((legacy.payload, legacy.calculation), ({}, {}))
        self.assertFalse(legacy.payments.exists())
