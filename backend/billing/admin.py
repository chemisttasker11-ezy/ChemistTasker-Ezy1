from django import forms
from django.contrib import admin, messages
from django.contrib.admin.helpers import ActionForm
from django.db import transaction

from .checkout_reservations import CheckoutConflict, expire_unreconciled_checkout
from .models import FulfillmentCheckout, OwnerSubscription, ShiftPayment


@admin.register(OwnerSubscription)
class OwnerSubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'account_type',
        'account_name',
        'billing_contact',
        'status',
        'staff_count',
        'stripe_customer_id',
        'stripe_subscription_id',
        'updated_at',
    )
    list_filter = ('status', 'created_at', 'updated_at')
    search_fields = (
        'owner__email',
        'owner__first_name',
        'owner__last_name',
        'organization__name',
        'billing_contact__email',
        'stripe_customer_id',
        'stripe_subscription_id',
    )
    readonly_fields = ('created_at', 'updated_at')
    autocomplete_fields = ('owner', 'organization', 'billing_contact')

    def account_type(self, obj):
        return 'Organization' if obj.organization_id else 'Owner'

    account_type.short_description = 'Account type'

    def account_name(self, obj):
        if obj.organization_id:
            return obj.organization.name
        if obj.owner_id:
            return obj.owner.get_full_name() or obj.owner.email
        return '-'

    account_name.short_description = 'Billing account'


@admin.register(ShiftPayment)
class ShiftPaymentAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'owner',
        'shift',
        'payment_type',
        'payment_method',
        'status',
        'amount_aud',
        'stripe_payment_intent_id',
        'paid_at',
        'created_at',
    )
    list_filter = ('payment_type', 'payment_method', 'status', 'created_at', 'paid_at')
    search_fields = (
        'owner__email',
        'owner__first_name',
        'owner__last_name',
        'shift__id',
        'stripe_payment_intent_id',
        'stripe_invoice_id',
    )
    readonly_fields = ('created_at', 'paid_at')
    autocomplete_fields = ('owner', 'shift')


class ReconciliationActionForm(ActionForm):
    reason = forms.CharField(required=False, label='Reason')


@admin.register(FulfillmentCheckout)
class FulfillmentCheckoutAdmin(admin.ModelAdmin):
    list_display = ('id', 'original_shift_id', 'state', 'stripe_session_id', 'payment', 'expected_amount_cents', 'created_at')
    list_filter = ('state', 'created_at')
    search_fields = ('id', 'original_shift_id', 'stripe_session_id')
    readonly_fields = [field.name for field in FulfillmentCheckout._meta.fields]
    action_form = ReconciliationActionForm
    actions = ('mark_expired_after_reconciliation',)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_reconcile_permission(self, request):
        return request.user.is_superuser

    @admin.action(description='Mark expired after manual reconciliation', permissions=['reconcile'])
    def mark_expired_after_reconciliation(self, request, queryset):
        reason = request.POST.get('reason', '').strip()
        if not reason:
            self.message_user(request, 'Enter the reconciliation reason.', messages.ERROR)
            return
        for attempt in queryset:
            try:
                with transaction.atomic():  # Release and its audit entry commit together or not at all.
                    expire_unreconciled_checkout(attempt)
                    self.log_change(request, attempt, f'Marked expired after manual reconciliation: {reason}')
            except CheckoutConflict as error:
                self.message_user(request, f'{attempt.pk}: {error.detail}', messages.ERROR)
                continue
            self.message_user(request, f'{attempt.pk}: expired, reservations released.')
