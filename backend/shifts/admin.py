"""Django admin for the shifts app (moved from client_profile/admin.py)."""
from django.contrib import admin
from shifts.models import (
    Shift,
    ShiftCounterOffer,
    ShiftCounterOfferSlot,
    ShiftInterest,
    ShiftOffer,
    ShiftRejection,
    ShiftSlot,
    ShiftSlotAssignment,
    WorkerShiftRequest,
)


class ShiftSlotInline(admin.TabularInline):
    model = ShiftSlot
    extra = 1


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    inlines = [ShiftSlotInline]
    list_display = [
        'id','pharmacy','role_needed','employment_type',
        'visibility','reveal_count','single_user_only','created_at', 'created_by'
    ]
    list_filter = [
        'role_needed','employment_type','single_user_only','visibility'
    ]
    search_fields = ['pharmacy__name','role_needed']


@admin.register(ShiftSlotAssignment)
class ShiftSlotAssignmentAdmin(admin.ModelAdmin):
    list_display = ('id','shift','slot','user','assigned_at')
    list_filter  = ('shift','user')
    search_fields = ('user__username','shift__pharmacy__name')


@admin.register(ShiftInterest)
class ShiftInterestAdmin(admin.ModelAdmin):
    list_display = ('id','shift','slot','user','revealed','expressed_at')
    list_filter  = ('revealed','slot','shift')
    search_fields = ('user__username','shift__pharmacy__name')


@admin.register(ShiftRejection)
class ShiftRejectionAdmin(admin.ModelAdmin):
    list_display = ('id','shift','slot','user','rejected_at')
    list_filter  = ('slot','shift')
    search_fields = ('user__username','shift__pharmacy__name')


admin.site.register(WorkerShiftRequest)


class ShiftCounterOfferSlotInline(admin.TabularInline):
    model = ShiftCounterOfferSlot
    extra = 0
    readonly_fields = ('slot', 'proposed_start_time', 'proposed_end_time', 'proposed_rate')


@admin.register(ShiftCounterOffer)
class ShiftCounterOfferAdmin(admin.ModelAdmin):
    list_display = ('id', 'shift', 'pharmacy_name', 'user', 'status', 'created_at')
    list_filter = ('status', 'shift__pharmacy')
    search_fields = ('id', 'shift__pharmacy__name', 'user__email', 'user__first_name', 'user__last_name')
    readonly_fields = ('shift', 'user', 'status', 'message', 'request_travel', 'created_at', 'updated_at')
    inlines = [ShiftCounterOfferSlotInline]

    def pharmacy_name(self, obj):
        return getattr(obj.shift.pharmacy, 'name', None)

    pharmacy_name.short_description = "Pharmacy"


@admin.register(ShiftOffer)
class ShiftOfferAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'shift',
        'pharmacy_name',
        'slot',
        'user',
        'status',
        'offered_slot_date',
        'offered_start_time',
        'offered_end_time',
        'offered_rate',
        'expires_at',
        'created_at',
    )
    list_filter = (
        'status',
        'shift__pharmacy',
        'offered_slot_date',
        'expires_at',
    )
    search_fields = (
        'id',
        'shift__id',
        'shift__pharmacy__name',
        'user__email',
        'user__first_name',
        'user__last_name',
        'user__username',
    )
    autocomplete_fields = ('shift', 'user', 'counter_offer')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'

    def pharmacy_name(self, obj):
        return getattr(obj.shift.pharmacy, 'name', None)

    pharmacy_name.short_description = "Pharmacy"
