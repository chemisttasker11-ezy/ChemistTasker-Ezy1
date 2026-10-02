from django.db import migrations, models
import django.db.models.deletion
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5


def copy_finance_records(apps, schema_editor):
    Invoice = apps.get_model("client_profile", "Invoice")
    InvoiceRecord = apps.get_model("worker_finance", "InvoiceRecord")
    InvoiceRevision = apps.get_model("worker_finance", "InvoiceRevision")
    InvoiceReviewRequest = apps.get_model("worker_finance", "InvoiceReviewRequest")
    Payment = apps.get_model("worker_finance", "Payment")
    Delivery = apps.get_model("worker_finance", "Delivery")
    Customer = apps.get_model("worker_finance", "Customer")
    InvoiceLineItem = apps.get_model("client_profile", "InvoiceLineItem")
    Notification = apps.get_model("client_profile", "Notification")

    record_to_invoice = dict(InvoiceRecord.objects.values_list("pk", "invoice_id"))
    for record in InvoiceRecord.objects.all().iterator():
        if record.owner_id != Invoice.objects.only("user_id").get(pk=record.invoice_id).user_id:
            raise RuntimeError(f"InvoiceRecord {record.pk} owner does not match Invoice {record.invoice_id}")
        Invoice.objects.filter(pk=record.invoice_id).update(
            customer_id=record.customer_id,
            parent_id=record_to_invoice.get(record.parent_id),
            kind=record.kind,
            source=record.source,
            version=record.version,
            request_key=record.request_key,
            payload=record.payload,
            calculation=record.calculation,
            locked_at=record.locked_at,
            voided_at=record.voided_at,
            review_status=record.review_status,
            last_review_note=record.last_review_note,
            last_reviewed_at=record.last_reviewed_at,
        )

    for Model in (InvoiceRevision, InvoiceReviewRequest, Payment, Delivery):
        for row in Model.objects.all().only("pk", "record_id").iterator():
            row.invoice_id = record_to_invoice[row.record_id]
            row.save(update_fields=["invoice"])

    # Notification payloads are durable links. Rewrite the former record ID to
    # the canonical Invoice ID before the duplicate table is removed.
    for notification in Notification.objects.filter(payload__has_key="finance_invoice_id").only("pk", "payload").iterator():
        payload = dict(notification.payload or {})
        try:
            former_id = int(payload["finance_invoice_id"])
        except (KeyError, TypeError, ValueError):
            continue
        canonical_id = record_to_invoice.get(former_id)
        if canonical_id is None:
            continue
        payload["finance_invoice_id"] = canonical_id
        notification.payload = payload
        notification.save(update_fields=["payload"])

    # Promote every pre-workspace invoice into the same canonical feature set.
    # Stored totals remain authoritative; this creates snapshots, not new bills.
    for invoice in Invoice.objects.filter(request_key__isnull=True).iterator():
        customer_name = invoice.custom_bill_to_name or invoice.pharmacy_name_snapshot or "Invoice customer"
        customer = Customer.objects.filter(owner_id=invoice.user_id, name=customer_name).order_by("pk").first()
        if customer is None:
            customer = Customer.objects.create(
                owner_id=invoice.user_id,
                name=customer_name,
                legal_name=customer_name,
                abn=invoice.bill_to_abn or invoice.pharmacy_abn_snapshot or "",
                contact_name=" ".join(part for part in (invoice.bill_to_first_name, invoice.bill_to_last_name) if part).strip(),
                email=invoice.bill_to_email or "",
                address=invoice.custom_bill_to_address or invoice.pharmacy_address_snapshot or "",
            )
        lines = []
        for line in InvoiceLineItem.objects.filter(invoice_id=invoice.pk).order_by("pk"):
            net = Decimal(str(line.total or 0))
            gst = (net * Decimal("0.10")).quantize(Decimal("0.01")) if invoice.gst_registered and line.gst_applicable else Decimal("0.00")
            lines.append({
                "item_id": None,
                "description": line.description,
                "category_code": line.category_code,
                "unit": line.unit,
                "quantity": str(line.quantity),
                "unit_price": str(line.unit_price),
                "discount": str(line.discount),
                "tax_code": "GST" if invoice.gst_registered and line.gst_applicable else "OUT_OF_SCOPE",
                "super_eligible": bool(line.super_applicable),
                "worked_on": None,
                "source_assignment_id": line.source_assignment_id,
                "shift_id": line.shift_id,
                "net": str(net),
                "gst": str(gst),
                "gross": str(net + gst),
            })
        request_key = uuid5(NAMESPACE_URL, f"chemisttasker:invoice:{invoice.pk}")
        payload = {
            "request_key": str(request_key),
            "customer_id": customer.pk,
            "invoice_date": str(invoice.invoice_date),
            "due_date": str(invoice.due_date or invoice.invoice_date),
            "issuer_name": " ".join(part for part in (invoice.issuer_first_name, invoice.issuer_last_name) if part).strip() or invoice.issuer_email,
            "issuer_entity_type": "sole_trader",
            "issuer_abn": invoice.issuer_abn or "",
            "issuer_address": "",
            "gst_registered": bool(invoice.gst_registered),
            "price_mode": "exclusive",
            "super_mode": "summary" if invoice.super_amount else "none",
            "super_rate": str(invoice.super_rate_snapshot),
            "super_confirmed": bool(invoice.super_amount),
            "bank_account_name": invoice.bank_account_name,
            "bsb": invoice.bsb,
            "account_number": invoice.account_number,
            "super_fund_name": invoice.super_fund_name,
            "super_usi": invoice.super_usi,
            "super_member_number": invoice.super_member_number,
            "reference": "",
            "notes": "Imported from the original invoice workspace.",
            "lines": lines,
            "customer": {
                "name": customer.name,
                "legal_name": customer.legal_name,
                "address": customer.address,
                "abn": customer.abn,
                "email": customer.email,
                "contact_name": customer.contact_name,
            },
        }
        calculation = {
            "lines": lines,
            "subtotal": str(invoice.subtotal),
            "gst": str(invoice.gst_amount),
            "payable": str(invoice.total),
            "sales_gross": str(invoice.total),
            "super": str(invoice.super_amount),
            "automatic_super": "0.00",
        }
        Invoice.objects.filter(pk=invoice.pk).update(
            customer_id=customer.pk,
            source="internal" if invoice.pharmacy_id else "external",
            request_key=request_key,
            payload=payload,
            calculation=calculation,
            legacy_snapshot=True,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0059_invoice_finance_workspace_state"),
        ("worker_finance", "0004_portable_revision_constraint"),
    ]

    operations = [
        migrations.AddField(model_name="invoicerevision", name="invoice", field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="revisions", to="client_profile.invoice")),
        migrations.AddField(model_name="invoicereviewrequest", name="invoice", field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="review_requests", to="client_profile.invoice")),
        migrations.AddField(model_name="payment", name="invoice", field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="payments", to="client_profile.invoice")),
        migrations.AddField(model_name="delivery", name="invoice", field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="deliveries", to="client_profile.invoice")),
        migrations.RunPython(copy_finance_records, migrations.RunPython.noop),
    ]
