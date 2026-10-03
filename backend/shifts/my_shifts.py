"""A worker's own shifts: confirmed (upcoming) and history."""
from django.utils import timezone
from datetime import date
from shifts.access import IsPharmacistOrOtherStaff
from shifts.base import BaseShiftViewSet
from shifts.selectors import _matching_shift_slot_exists
from shifts.serializers import MyShiftSerializer


# --- “My Confirmed” Viewset ---
class MyConfirmedShiftsViewSet(BaseShiftViewSet):
    """
    Shifts I’m assigned to that haven’t ended yet.
    """
    serializer_class   = MyShiftSerializer
    permission_classes = [IsPharmacistOrOtherStaff]

    def get_queryset(self):
        user  = self.request.user
        now   = timezone.now()
        today = date.today()

        qs = super().get_queryset().filter(
            slot_assignments__user=user
        )
        qs = qs.annotate(
            has_confirmed_slot=_matching_shift_slot_exists(
                now=now,
                today=today,
                assigned_user_id=user.id,
                state='confirmed',
            )
        ).filter(has_confirmed_slot=True)

        return qs.distinct()


# --- “My History” Viewset ---
class MyHistoryShiftsViewSet(BaseShiftViewSet):
    """
    Shifts I’m assigned to that have already ended.
    """
    serializer_class   = MyShiftSerializer
    permission_classes = [IsPharmacistOrOtherStaff]

    def get_queryset(self):
        user  = self.request.user
        now   = timezone.now()
        today = date.today()

        qs = super().get_queryset().filter(
            slot_assignments__user=user
        )
        payment_pref = self.request.query_params.get('payment_preference')
        if payment_pref:
            qs = qs.filter(payment_preference__iexact=payment_pref)
        qs = qs.annotate(
            has_history_slot=_matching_shift_slot_exists(
                now=now,
                today=today,
                assigned_user_id=user.id,
                state='history',
            )
        ).filter(has_history_slot=True)

        return qs.distinct()
