"""Legacy invoice delivery contracts through HTTP, commits and the broker boundary."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.conf import settings
from django.core import mail
from django.db import connection, transaction
from django.test import TransactionTestCase, override_settings
from kombu.serialization import dumps, loads
from rest_framework.test import APIRequestFactory, force_authenticate

from client_profile.characterization_support import client_for, make_user
from core import task_queue
from invoicing.models import Invoice, InvoiceLineItem
from invoicing.views import send_invoice_email
from worker_finance.models import Customer, Delivery
from worker_finance.services import save_draft


PDF = b"%PDF-1.4\n\x00\x80\xff frozen invoice attachment\n%%EOF"


class _InvoiceDeliveryFixture:
    def setUp(self):
        super().setUp()
        self.worker = make_user("OTHER_STAFF")
        self.client = client_for(self.worker)
        # Expected server failures are observed as HTTP responses, not re-raised by the client.
        self.client.raise_request_exception = False
        self.invoice = self.create_legacy_invoice()
        self.url = f"/api/v1/invoices/{self.invoice.pk}/send/"
        # Intercept only external publication. Alias resolution and task registration remain real.
        self.publish = self.enterContext(patch.object(
            task_queue.current_app, "send_task", return_value=SimpleNamespace(id="invoice-task"),
        ))
        self.render = self.enterContext(patch("invoicing.views.render_invoice_to_pdf", return_value=PDF))

    def create_legacy_invoice(self):
        invoice = Invoice.objects.create(
            user=self.worker, external=True, custom_bill_to_name="Legacy Customer",
            issuer_first_name="Original", issuer_last_name="Worker", issuer_email=self.worker.email,
            issuer_abn="51824753556", bill_to_email="accounts@example.invalid",
            cc_emails=" first@example.invalid, second@example.invalid ",
            invoice_date=date(2026, 10, 29), due_date=date(2026, 11, 12),
            subtotal=Decimal("150.00"), total=Decimal("150.00"),
            bank_account_name="Original Worker", bsb="123456", account_number="12345678",
        )
        InvoiceLineItem.objects.create(
            invoice=invoice, description="Original services", category_code="ProfessionalServices",
            unit="Hours", quantity=Decimal("2.00"), unit_price=Decimal("75.00"), total=Decimal("150.00"),
        )
        return invoice

    def finance_record(self):
        customer = Customer.objects.create(owner=self.worker, name="Managed customer", email="managed@example.invalid")
        return save_draft(self.worker, {
            "request_key": str(uuid4()), "customer_id": customer.pk,
            "invoice_date": "2026-10-29", "due_date": "2026-11-12",
            "issuer_name": "Original Worker", "issuer_abn": "51824753556",
            "gst_registered": False, "price_mode": "exclusive", "super_mode": "none",
            "super_rate": "0.00", "super_confirmed": False,
            "bank_account_name": "Original Worker", "bsb": "123456", "account_number": "12345678",
            "lines": [{
                "description": "Managed services", "category_code": "ProfessionalServices", "unit": "Hours",
                "quantity": "2.00", "unit_price": "75.00", "discount": "0.00",
                "tax_code": "OUT_OF_SCOPE", "super_eligible": False,
            }],
        })


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=False,
    CELERY_TASK_SERIALIZER="json",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class LegacyInvoiceDeliveryTests(_InvoiceDeliveryFixture, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.smtp = self.enterContext(patch("django.core.mail.EmailMultiAlternatives.send"))
        self.addCleanup(self.smtp.assert_not_called)

    def test_outer_rollback_discards_reservation_and_queues_nothing(self):
        with self.assertRaisesRegex(RuntimeError, "abort issuance"):
            with transaction.atomic():
                response = self.client.post(self.url, {}, format="json")
                self.assertEqual(response.status_code, 200, response.content)
                raise RuntimeError("abort issuance")
        self.publish.assert_not_called()
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "draft")
        self.assertFalse(Delivery.objects.filter(invoice=self.invoice).exists())

    def test_publication_waits_for_commit_and_observes_a_durable_reservation(self):
        observed = []

        def observe_publish(*args, **kwargs):
            observed.append((connection.in_atomic_block, Delivery.objects.filter(invoice=self.invoice).count()))
            return SimpleNamespace(id="invoice-task")

        self.publish.side_effect = observe_publish
        with transaction.atomic():
            response = self.client.post(self.url, {}, format="json")
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.data["status"], "draft")
            self.publish.assert_not_called()
        self.publish.assert_called_once()
        self.assertEqual(observed, [(False, 1)])
        self.assertEqual(Delivery.objects.get(invoice=self.invoice).status, "legacy_queued")

    def test_unadopted_invoice_has_one_reservation_without_finance_adoption(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["status"], "sent")
        self.assertEqual(Delivery.objects.filter(invoice=self.invoice).count(), 1)
        delivery = Delivery.objects.get(invoice=self.invoice)
        self.assertEqual((delivery.version, delivery.recipient, delivery.status),
                         (1, "accounts@example.invalid", "legacy_queued"))
        self.invoice.refresh_from_db()
        self.assertIsNone(self.invoice.request_key)
        self.assertIsNone(self.invoice.customer_id)
        self.assertEqual(Customer.objects.filter(owner=self.worker).count(), 0)
        detail = self.client.get(f"/api/v1/invoices/{self.invoice.pk}/")
        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertIsNone(detail.data["finance_record_id"])
        duplicate = self.client.post(self.url, {}, format="json")
        self.assertEqual(duplicate.status_code, 409, duplicate.content)
        self.publish.assert_called_once()
        self.assertEqual(Delivery.objects.filter(invoice=self.invoice).count(), 1)

    def test_content_edit_fences_old_attempt_but_status_only_edit_keeps_version(self):
        for state in ("preparing", "queue_uncertain", "sent"):
            with self.subTest(state=state):
                invoice = self.create_legacy_invoice()
                delivery = Delivery.objects.create(
                    invoice=invoice, version=1, recipient=invoice.bill_to_email, status=state,
                )
                detail_url = f"/api/v1/invoices/{invoice.pk}/"
                status_only = self.client.patch(detail_url, {"status": "draft"}, format="json")
                self.assertEqual(status_only.status_code, 200, status_only.content)
                invoice.refresh_from_db()
                self.assertEqual(invoice.version, 1)

                changed = self.client.patch(detail_url, {
                    "custom_bill_to_name": "Revised customer", "status": "draft",
                }, format="json")
                self.assertEqual(changed.status_code, 200, changed.content)
                invoice.refresh_from_db()
                self.assertEqual((invoice.version, invoice.status), (2, "draft"))
                self.assertIsNone(invoice.request_key)
                self.assertIsNone(invoice.customer_id)
                subsequent = self.client.patch(detail_url, {"due_date": "2026-12-01"}, format="json")
                self.assertEqual(subsequent.status_code, 200, subsequent.content)
                invoice.refresh_from_db()
                self.assertEqual(invoice.version, 2)
                delivery.refresh_from_db()
                self.assertEqual((delivery.version, delivery.status), (1, state))

                deleted = self.client.delete(detail_url)
                self.assertEqual(deleted.status_code, 403, deleted.content)
                self.assertTrue(Invoice.objects.filter(pk=invoice.pk).exists())
                self.assertTrue(Delivery.objects.filter(pk=delivery.pk).exists())
        self.publish.assert_not_called()

    def test_definite_prepublication_failure_does_not_prevent_legacy_deletion(self):
        self.render.side_effect = RuntimeError("PDF preparation failed")
        failed = self.client.post(self.url, {}, format="json")
        self.assertEqual(failed.status_code, 503, failed.content)
        self.assertEqual(Delivery.objects.get(invoice=self.invoice).status, "failed")
        deleted = self.client.delete(f"/api/v1/invoices/{self.invoice.pk}/")
        self.assertEqual(deleted.status_code, 204, deleted.content)
        self.assertFalse(Invoice.objects.filter(pk=self.invoice.pk).exists())
        self.assertFalse(Delivery.objects.filter(invoice_id=self.invoice.pk).exists())
        self.publish.assert_not_called()


    def test_real_configured_serializer_round_trips_binary_pdf_and_cc(self):
        decoded = []

        def serialize_publish(task_name, *, args, kwargs, **options):
            content_type, content_encoding, payload = dumps(
                {"args": args, "kwargs": kwargs}, serializer=settings.CELERY_TASK_SERIALIZER,
            )
            decoded.append(loads(payload, content_type, content_encoding, accept=[content_type]))
            return SimpleNamespace(id="invoice-task")

        def leaves(value):
            if isinstance(value, dict):
                return [leaf for child in value.values() for leaf in leaves(child)]
            if isinstance(value, (list, tuple)):
                return [leaf for child in value for leaf in leaves(child)]
            return [value]

        self.publish.side_effect = serialize_publish
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(decoded), 1)
        values = leaves(decoded[0])
        self.assertIn(PDF, values)
        self.assertIn("accounts@example.invalid", values)
        self.assertIn("first@example.invalid", values)
        self.assertIn("second@example.invalid", values)
        self.assertIn(f"invoice_{self.invoice.pk}.pdf", values)

    def test_existing_finance_attempt_blocks_direct_legacy_helper_redispatch(self):
        # This is intentionally a helper test: the canonical managed HTTP route
        # returns 409 before reaching this legacy helper (positive control below).
        for state in ("preparing", "sending", "uncertain"):
            with self.subTest(state=state):
                record = self.finance_record()
                delivery = Delivery.objects.create(
                    invoice=record, version=record.version, recipient=record.bill_to_email, status=state,
                )
                request = APIRequestFactory().post(f"/invoices/{record.pk}/send/", {}, format="json")
                force_authenticate(request, user=self.worker)
                response = send_invoice_email(request, record.pk)
                self.assertEqual(response.status_code, 409, response.data)
                self.publish.assert_not_called()
                record.refresh_from_db()
                delivery.refresh_from_db()
                self.assertEqual(record.status, "draft")
                self.assertEqual(delivery.status, state)
                self.assertEqual(record.revisions.get(version=record.version).invoice_status, "draft")

    def test_managed_canonical_route_still_returns_finance_conflict(self):
        record = self.finance_record()
        response = self.client.post(f"/api/v1/invoices/{record.pk}/send/", {}, format="json")
        self.assertEqual(response.status_code, 409, response.content)
        self.assertEqual(response.data["finance_record_id"], record.pk)
        self.publish.assert_not_called()
        self.render.assert_not_called()
        self.assertFalse(Delivery.objects.filter(invoice=record).exists())

    def test_definite_pdf_preparation_failure_allows_one_safe_retry(self):
        self.render.side_effect = [RuntimeError("PDF preparation failed"), PDF]
        failed = self.client.post(self.url, {}, format="json")
        self.assertEqual(failed.status_code, 503, failed.content)
        self.publish.assert_not_called()
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "draft")
        retried = self.client.post(self.url, {}, format="json")
        self.assertEqual(retried.status_code, 200, retried.content)
        self.assertEqual(retried.data["status"], "sent")
        self.publish.assert_called_once()
        self.assertEqual(Delivery.objects.filter(invoice=self.invoice).count(), 1)

    def test_broker_exception_does_not_report_queued_success_or_retry_publication(self):
        self.publish.side_effect = TimeoutError("Broker acknowledgement was lost")
        failed = self.client.post(self.url, {}, format="json")
        self.assertEqual(failed.status_code, 503, failed.content)
        self.assertNotEqual(failed.data.get("status"), "sent")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "draft")
        delivery = Delivery.objects.get(invoice=self.invoice)
        self.assertEqual(delivery.status, "queue_uncertain")
        repeated = self.client.post(self.url, {}, format="json")
        self.assertEqual(repeated.status_code, 409, repeated.content)
        self.publish.assert_called_once()
        self.assertEqual(Delivery.objects.filter(invoice=self.invoice).count(), 1)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=False,
    CELERY_TASK_SERIALIZER="json",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class LegacyInvoiceWorkerTests(_InvoiceDeliveryFixture, TransactionTestCase):
    """Run the actual registered task locally with serialized broker arguments."""

    def captured_task(self):
        call = self.publish.call_args
        self.assertIsNotNone(call)
        self.assertEqual(call.args[0], "invoicing.tasks.deliver_invoice_email")
        content_type, encoding, payload = dumps({
            "args": call.kwargs["args"], "kwargs": call.kwargs["kwargs"],
        }, serializer=settings.CELERY_TASK_SERIALIZER)
        decoded = loads(payload, content_type, encoding, accept=[content_type])
        return task_queue.current_app.tasks[call.args[0]], decoded["args"], decoded["kwargs"]

    def run_task(self, invocation, *, throw=True):
        task, args, kwargs = invocation
        return task.apply(args=args, kwargs=kwargs, throw=throw)

    def queue_invoice(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return self.captured_task()

    def test_broker_redelivery_sends_only_once_for_the_exact_attempt(self):
        recipient = make_user("OTHER_STAFF")
        self.invoice.bill_to_email = recipient.email
        self.invoice.save(update_fields=["bill_to_email"])
        with patch("notifications.services.notify_users") as notify:
            invocation = self.queue_invoice()
            self.run_task(invocation)
            self.run_task(invocation)
            notify.assert_called_once()
        self.assertEqual(len(mail.outbox), 1)
        delivery = Delivery.objects.get(invoice=self.invoice)
        self.assertEqual(delivery.status, "sent")
        self.assertIsNotNone(delivery.sent_at)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "sent")
        self.publish.assert_called_once()

    def test_acknowledgement_loss_allows_original_worker_but_no_second_publication(self):
        self.publish.side_effect = TimeoutError("Broker accepted task but its reply was lost")
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, 503, response.content)
        delivery = Delivery.objects.get(invoice=self.invoice)
        self.assertEqual(delivery.status, "queue_uncertain")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "draft")
        invocation = self.captured_task()

        self.run_task(invocation)
        self.run_task(invocation)
        self.assertEqual(len(mail.outbox), 1)
        delivery.refresh_from_db()
        self.invoice.refresh_from_db()
        self.assertEqual((delivery.status, self.invoice.status), ("sent", "sent"))
        duplicate = self.client.post(self.url, {}, format="json")
        self.assertEqual(duplicate.status_code, 409, duplicate.content)
        self.publish.assert_called_once()

    def test_old_task_uses_frozen_body_pdf_and_recipients_without_publishing_new_edit(self):
        invocation = self.queue_invoice()
        self.render.return_value = b"%PDF-revised-content"
        changed = self.client.patch(f"/api/v1/invoices/{self.invoice.pk}/", {
            "custom_bill_to_name": "Revised customer", "bill_to_email": "revised@example.invalid",
            "cc_emails": "revised-cc@example.invalid", "issuer_first_name": "Revised",
            "due_date": "2026-12-01", "status": "draft",
            "line_items": [{
                "description": "Revised services", "category_code": "ProfessionalServices",
                "unit": "Hours", "quantity": "3.00", "unit_price": "90.00",
            }],
        }, format="json")
        self.assertEqual(changed.status_code, 200, changed.content)
        self.invoice.refresh_from_db()
        self.assertEqual((self.invoice.version, self.invoice.status, self.invoice.total),
                         (2, "draft", Decimal("270.00")))

        self.run_task(invocation)
        self.run_task(invocation)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["accounts@example.invalid"])
        self.assertEqual(message.cc, ["first@example.invalid", "second@example.invalid"])
        for original_value in ("Legacy Customer", "Original Worker", "$150.00", "2026-11-12"):
            self.assertIn(original_value, message.body)
        self.assertNotIn("Revised customer", message.body)
        self.assertNotIn("$270.00", message.body)
        attachments = [part for part in message.attachments if isinstance(part, tuple)]
        self.assertIn((f"invoice_{self.invoice.pk}.pdf", PDF, "application/pdf"), attachments)
        self.render.assert_called_once()
        self.invoice.refresh_from_db()
        self.assertEqual((self.invoice.version, self.invoice.status), (2, "draft"))
        self.assertEqual(Delivery.objects.get(invoice=self.invoice, version=1).status, "sent")
        self.assertFalse(Delivery.objects.filter(invoice=self.invoice, version=2).exists())

    def assert_ambiguous_provider_is_not_retried(self, **send_behavior):
        invocation = self.queue_invoice()
        with patch("django.core.mail.EmailMultiAlternatives.send", **send_behavior) as smtp:
            first = self.run_task(invocation, throw=False)
            self.assertNotEqual(first.state, "RETRY")
            self.run_task(invocation)
            smtp.assert_called_once()
        delivery = Delivery.objects.get(invoice=self.invoice)
        self.assertEqual(delivery.status, "legacy_uncertain")
        self.assertIsNone(delivery.sent_at)
        duplicate = self.client.post(self.url, {}, format="json")
        self.assertEqual(duplicate.status_code, 409, duplicate.content)
        self.publish.assert_called_once()

    def test_smtp_acknowledgement_loss_blocks_task_and_http_retries(self):
        self.assert_ambiguous_provider_is_not_retried(side_effect=TimeoutError("SMTP reply was lost"))

    def test_zero_provider_acceptance_is_not_recorded_as_sent_or_retried(self):
        self.assert_ambiguous_provider_is_not_retried(return_value=0)

    def test_provider_acceptance_then_finalization_failure_never_sends_twice(self):
        invocation = self.queue_invoice()
        original_save = Delivery.save

        def fail_sent_update(instance, *args, **kwargs):
            if instance.status == "sent":
                raise RuntimeError("Database finalization failed after SMTP acceptance")
            return original_save(instance, *args, **kwargs)

        with patch.object(Delivery, "save", new=fail_sent_update):
            self.run_task(invocation, throw=False)
        self.assertEqual(len(mail.outbox), 1)
        delivery = Delivery.objects.get(invoice=self.invoice)
        self.assertIn(delivery.status, ("legacy_sending", "legacy_uncertain"))
        self.assertIsNone(delivery.sent_at)
        self.run_task(invocation)
        self.assertEqual(len(mail.outbox), 1)
        duplicate = self.client.post(self.url, {}, format="json")
        self.assertEqual(duplicate.status_code, 409, duplicate.content)
        self.publish.assert_called_once()

    def test_stale_task_cannot_claim_the_replacement_after_safe_preparation_retry(self):
        original_invocation = self.queue_invoice()
        original_delivery = Delivery.objects.get(invoice=self.invoice)
        with patch("django.template.loader.render_to_string", side_effect=RuntimeError("Template unavailable")):
            self.run_task(original_invocation, throw=False)
        original_delivery.refresh_from_db()
        self.assertEqual(original_delivery.status, "legacy_failed")
        self.assertEqual(len(mail.outbox), 0)

        replacement_invocation = self.queue_invoice()
        replacement = Delivery.objects.get(invoice=self.invoice)
        self.assertNotEqual(replacement.pk, original_delivery.pk)
        self.assertFalse(Delivery.objects.filter(pk=original_delivery.pk).exists())
        self.run_task(original_invocation)
        self.assertEqual(len(mail.outbox), 0)
        self.run_task(replacement_invocation)
        self.assertEqual(len(mail.outbox), 1)
        replacement.refresh_from_db()
        self.assertEqual(replacement.status, "sent")

    def test_fast_worker_completion_is_not_downgraded_when_publish_ack_arrives(self):
        def execute_before_publish_ack(*args, **kwargs):
            self.run_task(self.captured_task())
            return SimpleNamespace(id="already-delivered-task")

        self.publish.side_effect = execute_before_publish_ack
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["status"], "sent")
        delivery = Delivery.objects.get(invoice=self.invoice)
        self.assertEqual(delivery.status, "sent")
        self.assertIsNotNone(delivery.sent_at)
        self.assertEqual(len(mail.outbox), 1)
        self.publish.assert_called_once()

