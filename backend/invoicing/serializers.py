"""Serializers for the invoice API."""
from rest_framework import serializers
from invoicing.models import Invoice, InvoiceLineItem
from decimal import Decimal


# === Invoice ===
class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = [
            'id',
            'description',
            'category_code',
            'unit',
            'quantity',
            'unit_price',
            'discount',
            'total',
            'gst_applicable',
            'super_applicable',
            'is_manual',
            'was_modified',
            'shift',
            'source_assignment',
        ]
        read_only_fields = ['total', 'was_modified', 'source_assignment']

    def create(self, validated_data):
        qty      = validated_data['quantity']
        rate     = validated_data['unit_price']
        discount = validated_data.get('discount', Decimal('0')) / Decimal('100')
        validated_data['total'] = (qty * rate * (1 - discount)).quantize(Decimal('0.01'))
        if not validated_data.get('source_assignment'):
            validated_data['is_manual'] = True
            validated_data['was_modified'] = True
        return super().create(validated_data)

    def update(self, instance, validated_data):
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        discount = validated_data.get('discount', instance.discount) / Decimal('100')
        instance.total = (instance.quantity * instance.unit_price * (1 - discount)).quantize(Decimal('0.01'))
        instance.save()
        return instance


class InvoiceSerializer(serializers.ModelSerializer):
    line_items = InvoiceLineItemSerializer(many=True)
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    finance_record_id = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id', 'user', 'external', 'pharmacy',
            'pharmacy_name_snapshot', 'pharmacy_address_snapshot', 'pharmacy_abn_snapshot',
            'custom_bill_to_name', 'custom_bill_to_address',
            'gst_registered', 'super_rate_snapshot',
            'bank_account_name', 'bsb', 'account_number',
            'super_fund_name', 'super_usi', 'super_member_number',
            'bill_to_email', 'cc_emails',
            'invoice_date', 'due_date',
            'subtotal', 'gst_amount', 'super_amount', 'total',
            'source_snapshot', 'finance_record_id',
            'status', 'created_at',
            'line_items',
            # Recipient snapshot
            'bill_to_first_name', 'bill_to_last_name', 'bill_to_abn',

            # Issuer snapshot
            'issuer_first_name', 'issuer_last_name', 'issuer_abn', 'issuer_email',
        ]
        read_only_fields = [
            'subtotal', 'gst_amount', 'super_amount', 'total', 'source_snapshot', 'created_at'
        ]

    def get_finance_record_id(self, obj):
        return obj.pk if obj.request_key is not None else None

    def create(self, validated_data):
        items = validated_data.pop('line_items', [])
        invoice = Invoice.objects.create(**validated_data)
        for item in items:
            item['invoice'] = invoice
            InvoiceLineItemSerializer().create(item)

        from invoicing.services import recalculate_invoice_totals
        invoice.refresh_from_db()
        return recalculate_invoice_totals(invoice)

    def update(self, instance, validated_data):
        items = validated_data.pop('line_items', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()

        if items is not None:
            internal_source = (instance.source_snapshot or {}).get("source") == "INTERNAL_ABN_SHIFT_ASSIGNMENTS"
            if internal_source:
                protected = instance.line_items.filter(
                    category_code="ProfessionalServices",
                    source_assignment__isnull=False,
                )
                protected_ids = list(protected.values_list("id", flat=True))
                instance.line_items.exclude(id__in=protected_ids).delete()
                for item in items:
                    category = item.get("category_code") or "ProfessionalServices"
                    if category == "ProfessionalServices":
                        continue
                    item['invoice'] = instance
                    InvoiceLineItemSerializer().create(item)
            else:
                instance.line_items.all().delete()
                for item in items:
                    item['invoice'] = instance
                    InvoiceLineItemSerializer().create(item)

        from invoicing.services import recalculate_invoice_totals
        return recalculate_invoice_totals(instance)
