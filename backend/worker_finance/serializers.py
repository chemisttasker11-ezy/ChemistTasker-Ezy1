"""Explicit input schemas. Never accept owner, totals or ABR verification from clients."""
from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers
from .calculations import TAX_CODES, CalculationError, normalise_abn, expense_gst_credit
from .models import Customer, CatalogueItem, Expense

CATEGORIES = ('ProfessionalServices', 'Superannuation', 'Transportation', 'Accommodation', 'Miscellaneous')


class StrictDecimalField(serializers.DecimalField):
    """Accept JSON decimal strings/integers; never silently coerce binary floats."""
    def to_internal_value(self, data):
        if isinstance(data, (float, bool)):
            self.fail('invalid')
        return super().to_internal_value(data)


class MoneyField(StrictDecimalField):
    def __init__(self, **kwargs):
        kwargs.setdefault('min_value', Decimal('0'))
        super().__init__(max_digits=10, decimal_places=2, **kwargs)


class CustomerSerializer(serializers.ModelSerializer):
    # Accept formatted ABNs before normalising into the 11-character model field.
    abn = serializers.CharField(max_length=20, allow_blank=True, required=False)
    payment_terms_days = serializers.IntegerField(min_value=0, max_value=365, default=14)
    address = serializers.CharField(max_length=2000, allow_blank=True, required=False)
    notes = serializers.CharField(max_length=3000, allow_blank=True, required=False)

    class Meta:
        model = Customer
        fields = ('id', 'name', 'legal_name', 'abn', 'contact_name', 'email', 'phone',
                  'address', 'payment_terms_days', 'notes', 'active', 'abn_result', 'abn_checked_at')
        read_only_fields = ('abn_result', 'abn_checked_at')

    def validate_abn(self, value):
        try:
            return normalise_abn(value) if value.strip() else ''
        except CalculationError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def update(self, instance, validated_data):
        if validated_data.get('abn', instance.abn) != instance.abn:
            instance.abn_result = {}
            instance.abn_checked_at = None
        return super().update(instance, validated_data)


class ItemSerializer(serializers.ModelSerializer):
    code = serializers.CharField(max_length=40, allow_blank=True, required=False, default='')
    category = serializers.ChoiceField(choices=CATEGORIES)
    unit = serializers.CharField(max_length=30)
    tax_code = serializers.ChoiceField(choices=TAX_CODES)
    unit_price = MoneyField()

    class Meta:
        model = CatalogueItem
        fields = ('id', 'code', 'name', 'category', 'unit', 'unit_price', 'tax_code', 'super_eligible', 'active')

    def validate(self, attrs):
        merged = {field: getattr(self.instance, field, None) for field in ('category', 'tax_code', 'super_eligible')}
        merged.update(attrs)
        if merged['category'] == 'Superannuation' and (merged['tax_code'] != 'OUT_OF_SCOPE' or merged['super_eligible']):
            raise serializers.ValidationError('Super requests must be out of scope and cannot attract super.')
        return attrs


class LineInput(serializers.Serializer):
    item_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    category_code = serializers.ChoiceField(choices=CATEGORIES, required=False, default='ProfessionalServices')
    unit = serializers.CharField(max_length=30, required=False, default='Item')
    quantity = StrictDecimalField(max_digits=6, decimal_places=2, min_value=Decimal('0.01'))
    unit_price = MoneyField()
    discount = StrictDecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, default=0)
    tax_code = serializers.ChoiceField(choices=TAX_CODES, required=False, default='OUT_OF_SCOPE')
    super_eligible = serializers.BooleanField(required=False, default=False)
    worked_on = serializers.DateField(required=False, allow_null=True)
    source_assignment_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    shift_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)

    def validate(self, attrs):
        if not attrs.get('item_id') and not str(attrs.get('description') or '').strip():
            raise serializers.ValidationError('Enter a description or choose a saved item.')
        return attrs


class CustomerSnapshotInput(serializers.Serializer):
    """Invoice-only bill-to snapshot. Editing it never rewrites the saved customer/pharmacy."""

    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    legal_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    abn = serializers.CharField(max_length=20, required=False, allow_blank=True)
    contact_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(max_length=2000, required=False, allow_blank=True)

    def validate_abn(self, value):
        try:
            return normalise_abn(value) if value.strip() else ''
        except CalculationError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class InvoiceInput(serializers.Serializer):
    request_key = serializers.UUIDField()
    version = serializers.IntegerField(min_value=1, required=False)
    customer_id = serializers.IntegerField(min_value=0)
    customer = CustomerSnapshotInput(required=False)
    source_assignment_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=False,
        max_length=100,
    )
    invoice_date = serializers.DateField()
    due_date = serializers.DateField()
    issuer_name = serializers.CharField(max_length=150)
    issuer_entity_type = serializers.ChoiceField(choices=('sole_trader', 'company'), default='sole_trader')
    issuer_abn = serializers.CharField(max_length=20, allow_blank=True)
    issuer_address = serializers.CharField(max_length=2000, allow_blank=True, default='')
    gst_registered = serializers.BooleanField(default=False)
    price_mode = serializers.ChoiceField(choices=('exclusive', 'inclusive'), default='exclusive')
    super_mode = serializers.ChoiceField(choices=('none', 'summary', 'separate'), default='none')
    super_rate = StrictDecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, default='12.00')
    super_confirmed = serializers.BooleanField(default=False)
    bank_account_name = serializers.CharField(max_length=255, allow_blank=True, default='')
    bsb = serializers.RegexField(r'^\d{6}$', allow_blank=True, default='')
    account_number = serializers.RegexField(r'^\d{4,20}$', allow_blank=True, default='')
    super_fund_name = serializers.CharField(max_length=255, allow_blank=True, default='')
    super_usi = serializers.CharField(max_length=50, allow_blank=True, default='')
    super_member_number = serializers.CharField(max_length=50, allow_blank=True, default='')
    reference = serializers.CharField(max_length=120, allow_blank=True, default='')
    notes = serializers.CharField(max_length=3000, allow_blank=True, default='')
    lines = LineInput(many=True, min_length=1, max_length=100)

    def validate(self, data):
        if not data.get('source_assignment_ids') and data.get('customer_id', 0) < 1:
            raise serializers.ValidationError({'customer_id': 'Select a customer before saving an external invoice.'})
        if data['due_date'] < data['invoice_date']:
            raise serializers.ValidationError('Due date cannot precede invoice date.')
        try:
            data['issuer_abn'] = normalise_abn(data['issuer_abn']) if data['issuer_abn'] else ''
        except CalculationError as exc:
            raise serializers.ValidationError({'issuer_abn': str(exc)}) from exc
        if data['gst_registered'] and not data['issuer_abn']:
            raise serializers.ValidationError('An issuer ABN is required to charge GST.')
        if data['super_mode'] != 'none' and not data['super_confirmed']:
            raise serializers.ValidationError('Confirm the contractual/statutory super basis before enabling super.')
        return data


class ExpenseSerializer(serializers.ModelSerializer):
    request_key = serializers.UUIDField()
    amount = MoneyField()
    gst_amount = MoneyField()
    tax_code = serializers.ChoiceField(choices=TAX_CODES)
    business_use_percent = StrictDecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100)
    notes = serializers.CharField(max_length=3000, allow_blank=True, required=False)
    gst_credit = serializers.SerializerMethodField()
    receipts = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = ('id', 'request_key', 'version', 'supplier', 'description', 'category', 'incurred_on',
                  'paid_on', 'amount', 'gst_amount', 'tax_code', 'business_use_percent', 'gst_registered',
                  'evidence_confirmed', 'reimbursable', 'reference', 'notes', 'gst_credit', 'receipts')

    def get_gst_credit(self, obj):
        return str(expense_gst_credit(amount=obj.amount, gst_amount=obj.gst_amount, business_use_percent=obj.business_use_percent,
                                     tax_code=obj.tax_code, evidence_confirmed=obj.evidence_confirmed, gst_registered=obj.gst_registered))

    def get_receipts(self, obj):
        return list(obj.receipts.values('id', 'filename', 'size', 'created_at'))

    def validate(self, attrs):
        fields = ('amount', 'gst_amount', 'business_use_percent', 'tax_code', 'evidence_confirmed', 'gst_registered')
        merged = {key: getattr(self.instance, key, None) for key in fields}
        merged.update(attrs)
        if any(merged.get(key) is None for key in fields):
            raise serializers.ValidationError('Complete amount, GST, business use and evidence settings.')
        incurred = attrs.get('incurred_on', getattr(self.instance, 'incurred_on', None))
        paid = attrs.get('paid_on', getattr(self.instance, 'paid_on', None))
        if paid and incurred and paid < incurred:
            raise serializers.ValidationError({'paid_on': 'Prepayments are not supported. Payment cannot precede the incurred date.'})
        if paid and paid > timezone.localdate():
            raise serializers.ValidationError({'paid_on': 'Record actual payments only, not a future payment date.'})
        try:
            expense_gst_credit(**{key: merged[key] for key in fields})
        except CalculationError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return attrs
