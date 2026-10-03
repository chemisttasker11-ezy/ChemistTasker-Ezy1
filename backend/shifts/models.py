"""Shift models. Django app labels remain client_profile during the code-ownership phase."""
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
import uuid
from datetime import timedelta
from workforce.models import RosterPeriod


# Shift Model - Represents an available shift in a pharmacy
class Shift(models.Model):
    ROLE_CHOICES = [
        ('PHARMACIST', 'Pharmacist'),
        ('INTERN', 'Intern'),
        ('STUDENT', 'Student'),
        ('ASSISTANT', 'Assistant'),
        ('TECHNICIAN', 'Technician'),
        ('EXPLORER', 'Explorer'),
    ]
    RATE_TYPE_CHOICES = [
        ('FIXED', 'Fixed'),
        ('FLEXIBLE', 'Flexible'),
        ('PHARMACIST_PROVIDED', 'Pharmacist Provided'),
    ]
    EMPLOYMENT_TYPE_CHOICES = [
        ('FULL_TIME', 'Full-Time'),
        ('PART_TIME', 'Part-Time'),
        ('CASUAL', 'Casual employee'),
        ('LOCUM', 'Locum'),
    ]

    PAYMENT_STATUS_CHOICES = (
        ('NOT_REQUIRED', 'Not Required'),
        ('PENDING', 'Pending Payment'),
        ('PAID', 'Paid'),
    )
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='NOT_REQUIRED')

    pharmacy = models.ForeignKey(
        'Pharmacy',
        on_delete=models.CASCADE,
        related_name='shifts'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        editable=False,
        on_delete=models.SET_NULL,
        related_name='shifts_created'
    )
    dedicated_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='dedicated_shifts'
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    role_needed = models.CharField(max_length=50, choices=ROLE_CHOICES)
    employment_type = models.CharField(
        max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, default='LOCUM'
    )
    is_roster_container = models.BooleanField(
        default=False,
        editable=False,
        help_text=(
            "Internal schedule container. Full/part-time candidate advertisements "
            "remain separate and keep their advertised pay-band validation."
        ),
    )

    workload_tags = models.JSONField(default=list, blank=True)
    must_have = models.JSONField(default=list, blank=True)
    nice_to_have = models.JSONField(default=list, blank=True)

    rate_type = models.CharField(
        max_length=50, choices=RATE_TYPE_CHOICES,
        null=True, blank=True
    )
    fixed_rate = models.DecimalField(
        max_digits=6, decimal_places=2,
        null=True, blank=True
    )
    owner_adjusted_rate = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        blank=True,
        null=True,
        help_text="Optional bonus/hr offered by owner for all staff"
    )
    flexible_timing = models.BooleanField(default=False)
    min_hourly_rate = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    max_hourly_rate = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    min_annual_salary = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    max_annual_salary = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    super_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    payment_preference = models.CharField(max_length=10, blank=True, null=True)  # e.g., ABN/TFN
    visibility = models.CharField(
        max_length=20,
        choices=[
            ('FULL_PART_TIME', 'Full/Part Time Pharmacy Members'),
            ('LOCUM_CASUAL',   'Locum/Casual Pharmacy Members'),
            ('OWNER_CHAIN',    'Owner Chain'),
            ('ORG_CHAIN',      'Organization Chain'),
            ('PLATFORM',       'Platform (Public)'),
        ],
        default='PLATFORM'
    )

    reveal_count = models.IntegerField(default=0)
    reveal_quota = models.IntegerField(null=True, blank=True)

    escalate_to_locum_casual = models.DateTimeField(null=True, blank=True)
    escalate_to_owner_chain = models.DateTimeField(null=True, blank=True)
    escalate_to_org_chain = models.DateTimeField(null=True, blank=True)
    escalate_to_platform = models.DateTimeField(null=True, blank=True)
    escalation_level = models.IntegerField(default=3)

    revealed_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='revealed_shifts'
    )
    interested_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='interested_shifts'
    )
    single_user_only = models.BooleanField(
        default=False,
        help_text="If true, only one user may take the entire shift (all slots)."
    )
    has_travel = models.BooleanField(
        default=False,
        help_text="Whether travel allowance is provided for this shift."
    )
    has_accommodation = models.BooleanField(
        default=False,
        help_text="Whether accommodation is provided for this shift."
    )
    is_urgent = models.BooleanField(
        default=False,
        help_text="Whether this shift is marked as urgent by the poster."
    )
    post_anonymously = models.BooleanField(
        default=False,
        help_text="Hide pharmacy identity from applicants; only suburb is shown."
    )
    share_token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, null=True)

    description = models.TextField(
        blank=True,
        null=True,
        help_text="A plain English description of the shift."
    )


    def clean(self):
        # Validate JSON lists are lists of strings
        for field in ['workload_tags', 'must_have', 'nice_to_have']:
            val = getattr(self, field)
            if not isinstance(val, list) or not all(isinstance(x, str) for x in val):
                raise ValidationError({field: 'Must be a list of strings.'})

        # Validate rate fields ONLY for PHARMACIST
        if self.role_needed == 'PHARMACIST':
            if self.rate_type == 'FIXED' and self.fixed_rate is None:
                raise ValidationError({'fixed_rate': 'fixed_rate required when rate_type=FIXED.'})
        else:
            if self.rate_type or self.fixed_rate is not None:
                raise ValidationError('Rate fields are only allowed for Pharmacist shifts.')

        # A slotless FT/PT record is a candidate advertisement and must carry
        # its advertised pay band. Roster containers get their frozen rate and
        # settlement terms from ShiftSlotAssignment/EmploymentEngagement.
        if self.employment_type in ['FULL_TIME', 'PART_TIME'] and not self.is_roster_container:
            has_hourly = self.min_hourly_rate is not None or self.max_hourly_rate is not None
            has_annual = self.min_annual_salary is not None or self.max_annual_salary is not None
            if not has_hourly and not has_annual:
                raise ValidationError({
                    'min_hourly_rate': 'Provide hourly or annual pay.',
                    'min_annual_salary': 'Provide hourly or annual pay.',
                })
            if has_hourly:
                if self.min_hourly_rate is None or self.max_hourly_rate is None:
                    raise ValidationError({'min_hourly_rate': 'Both min and max hourly are required for hourly pay.'})
                if self.min_hourly_rate > self.max_hourly_rate:
                    raise ValidationError({'min_hourly_rate': 'Min hourly cannot exceed max hourly.'})
            if has_annual:
                if self.min_annual_salary is None or self.max_annual_salary is None:
                    raise ValidationError({'min_annual_salary': 'Both min and max annual are required for annual pay.'})
                if self.min_annual_salary > self.max_annual_salary:
                    raise ValidationError({'min_annual_salary': 'Min annual cannot exceed max annual.'})
                if self.super_percent is None:
                    raise ValidationError({'super_percent': 'Super % is required when annual package is provided.'})
        else:
            # For locum/casual, ignore any annual/hourly inputs
            self.min_hourly_rate = None
            self.max_hourly_rate = None
            self.min_annual_salary = None
            self.max_annual_salary = None
            # super_percent can still be stored for locum/casual (used for superannuation flag)


    def save(self, *args, **kwargs):
        if self.pk:
            _assert_roster_shift_mutable(self)
        self.full_clean()
        if not self.pk and self.role_needed == 'PHARMACIST':
            self.rate_type = self.rate_type or self.pharmacy.default_rate_type
            self.fixed_rate = self.fixed_rate or self.pharmacy.default_fixed_rate
        super().save(*args, **kwargs)
   
    class Meta:
        app_label = "client_profile"
        indexes = [
            models.Index(fields=['pharmacy']),
            models.Index(fields=['created_by']),
        ]


class ShiftDescriptionTemplate(models.Model):
    pharmacy = models.ForeignKey(
        'Pharmacy',
        on_delete=models.CASCADE,
        related_name='shift_description_templates',
    )
    role_needed = models.CharField(max_length=50, choices=Shift.ROLE_CHOICES)
    description = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_shift_description_templates',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_shift_description_templates',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "client_profile"
        constraints = [
            models.UniqueConstraint(
                fields=['pharmacy', 'role_needed'],
                name='unique_shift_description_template_per_pharmacy_role',
            )
        ]
        indexes = [
            models.Index(fields=['pharmacy', 'role_needed']),
        ]

    def __str__(self):
        return f"{self.pharmacy_id} {self.role_needed} description template"


def _published_roster_period(pharmacy_id, work_date):
    if not pharmacy_id or not work_date:
        return None
    monday = work_date - timedelta(days=work_date.weekday())
    return RosterPeriod.objects.filter(
        pharmacy_id=pharmacy_id,
        week_start=monday,
        status=RosterPeriod.Status.PUBLISHED,
    ).first()


def _published_period_for_slot(slot):
    if slot.roster_period_id:
        period = RosterPeriod.objects.filter(pk=slot.roster_period_id).first()
        if period and period.status == RosterPeriod.Status.PUBLISHED:
            return period

    dates = {slot.date}
    if slot.pk:
        original = ShiftSlot.objects.filter(pk=slot.pk).values("date", "roster_period_id").first()
        if original:
            dates.add(original["date"])
            if original["roster_period_id"]:
                period = RosterPeriod.objects.filter(pk=original["roster_period_id"]).first()
                if period and period.status == RosterPeriod.Status.PUBLISHED:
                    return period
        if ShiftSlotAssignment.objects.filter(slot_id=slot.pk, is_rostered=True).exists():
            for work_date in dates:
                period = _published_roster_period(slot.shift.pharmacy_id, work_date)
                if period:
                    return period
    return None


def _assert_roster_slot_mutable(slot):
    period = _published_period_for_slot(slot)
    if period:
        raise ValidationError(
            "Cannot change a published roster. Unpublish the roster period before editing it."
        )


def _assert_roster_shift_mutable(shift):
    for slot in shift.slots.all():
        period = _published_period_for_slot(slot)
        if period:
            raise ValidationError(
                "Cannot change a shift in a published roster. Unpublish the roster period before editing it."
            )


def _assert_roster_assignment_mutable(assignment):
    slot = assignment.slot if assignment.slot_id else None
    if not slot:
        return
    is_rostered = assignment.is_rostered
    if assignment.pk:
        is_rostered = is_rostered or ShiftSlotAssignment.objects.filter(
            pk=assignment.pk, is_rostered=True
        ).exists()
    if not is_rostered:
        return
    period = _published_period_for_slot(slot)
    if not period:
        period = _published_roster_period(slot.shift.pharmacy_id, assignment.slot_date or slot.date)
    if period:
        raise ValidationError(
            "Cannot change an assignment in a published roster. Unpublish the roster period before editing it."
        )


class ShiftSlot(models.Model):
    roster_period = models.ForeignKey(
        "workforce.RosterPeriod", null=True, blank=True, on_delete=models.PROTECT,
        related_name="planned_slots",
        help_text="Explicit ownership of a roster slot, retained when it is vacant.",
    )
    planned_break_minutes = models.PositiveSmallIntegerField(default=0)
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name='slots'
    )
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    rate = models.DecimalField(
        max_digits=7,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Optional per-slot hourly rate for display."
    )
    is_recurring = models.BooleanField(default=False)
    recurring_days = models.JSONField(default=list, blank=True)
    recurring_end_date = models.DateField(null=True, blank=True)

    def clean(self):
        """
        Validates a ShiftSlot, ensuring recurring slot definitions are correct.

        - recurring_days: List of integers 0 (Monday) to 6 (Sunday) - consistent with Python's datetime.weekday().
        - recurring_end_date: Required for recurring slots, must be after start date.
        - For non-recurring, recurring_days must be empty.
        """
        if self.planned_break_minutes:
            from datetime import datetime, timedelta
            start = datetime.combine(self.date, self.start_time)
            end = datetime.combine(self.date, self.end_time)
            if end <= start:
                end += timedelta(days=1)
            if self.planned_break_minutes >= (end - start).total_seconds() / 60:
                raise ValidationError({'planned_break_minutes': 'Planned break must be shorter than the shift.'})
        if self.is_recurring:
            if not self.recurring_days:
                raise ValidationError({'recurring_days': 'This field is required for recurring slots.'})
            if not isinstance(self.recurring_days, list):
                raise ValidationError({'recurring_days': 'Must be a list of integers (0=Monday, 6=Sunday).'})
            for d in self.recurring_days:
                if not isinstance(d, int) or not (0 <= d <= 6):
                    raise ValidationError({'recurring_days': 'Each entry must be an integer between 0 (Monday) and 6 (Sunday).'})

            if self.recurring_end_date is None:
                raise ValidationError({'recurring_end_date': 'This field is required for recurring slots.'})
            if self.recurring_end_date <= self.date:
                raise ValidationError({'recurring_end_date': 'End date must be after start date for recurring slots.'})
        else:
            if self.recurring_days:
                raise ValidationError({'recurring_days': 'Should be empty for non-recurring slots.'})
            if self.recurring_end_date:
                raise ValidationError({'recurring_end_date': 'Should be empty for non-recurring slots.'})

    def save(self, *args, **kwargs):
        _assert_roster_slot_mutable(self)
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        _assert_roster_slot_mutable(self)
        return super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.shift} slot on {self.date}"
    class Meta:
        app_label = "client_profile"



class ShiftInterest(models.Model):
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name='interests'
    )
    slot = models.ForeignKey(
        ShiftSlot,
        on_delete=models.CASCADE,
        related_name='slot_interests',
        null=True, blank=True
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='shift_interests'
    )

    revealed = models.BooleanField(default=False)

    expressed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        slot_info = f' (slot {self.slot.id})' if self.slot else ''
        return f"{self.user.get_full_name()} interested in {self.shift.pharmacy.name}{slot_info}"
    class Meta:
        app_label = "client_profile"



class ShiftSlotAssignment(models.Model):
    # link back to the parent Shift for easy filtering
    shift = models.ForeignKey(
        'Shift',
        on_delete=models.CASCADE,
        related_name='slot_assignments'
    )
    slot = models.ForeignKey(
        'ShiftSlot',
        on_delete=models.CASCADE,
        related_name='assignments'
    )
    slot_date = models.DateField(
        null=True,  # ✅ TEMPORARY — allow nulls just for migration
        blank=True,
        help_text="Specific date instance if this slot recurs"
    )
    # who is doing that slot
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='slot_assignments'
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    unit_rate = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Locked-in rate at time of assignment"
    )

    rate_reason = models.JSONField(
        default=dict,
        blank=True,
        help_text="Details explaining how the rate was calculated"
    )
    payment_preference_snapshot = models.CharField(max_length=10, blank=True)
    settlement_channel = models.CharField(max_length=16, blank=True)
    engagement_kind = models.CharField(max_length=32, blank=True)
    engagement_terms_snapshot = models.JSONField(default=dict, blank=True)
    engagement_terms_accepted_at = models.DateTimeField(null=True, blank=True)
    payroll_activated_at = models.DateTimeField(null=True, blank=True)
    source_offer = models.ForeignKey(
        'ShiftOffer', on_delete=models.PROTECT, related_name='slot_assignments',
        null=True, blank=True,
    )
    class Meta:
        app_label = "client_profile"
        unique_together = ('slot', 'slot_date')
        indexes = [
            models.Index(fields=['slot', 'slot_date']),      # Fast lookup by slot and date
            models.Index(fields=['user', 'slot_date']),      # Fast lookup for all slots by user for a day
        ]

    is_rostered = models.BooleanField(default=False) 

    def __str__(self):
        return f"{self.user.get_full_name()} assigned to slot {self.slot.id}"

    def save(self, *args, **kwargs):
        _assert_roster_assignment_mutable(self)
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        _assert_roster_assignment_mutable(self)
        return super().delete(*args, **kwargs)


class ShiftProfileAccessAudit(models.Model):
    class Action(models.TextChoices):
        REVEAL_PROFILE = "REVEAL_PROFILE", "Reveal profile"
        VIEW_ASSIGNED_PROFILE = "VIEW_ASSIGNED_PROFILE", "View assigned profile"

    shift = models.ForeignKey(
        'Shift',
        on_delete=models.CASCADE,
        related_name='profile_access_audits'
    )
    slot = models.ForeignKey(
        'ShiftSlot',
        on_delete=models.SET_NULL,
        related_name='profile_access_audits',
        null=True,
        blank=True
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile_access_events'
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='performed_profile_access_events'
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    request_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "client_profile"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['shift', 'created_at']),
            models.Index(fields=['target_user', 'created_at']),
            models.Index(fields=['actor', 'created_at']),
            models.Index(fields=['action', 'created_at']),
        ]

    def __str__(self):
        return f"{self.action} shift={self.shift_id} actor={self.actor_id} target={self.target_user_id}"


class ShiftRejection(models.Model):
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name='rejections'
    )
    slot = models.ForeignKey(
        ShiftSlot,
        on_delete=models.CASCADE,
        related_name='slot_rejections',
        null=True, blank=True
    )
    slot_date = models.DateField(
        null=True, blank=True,
        help_text="Specific date instance if this slot recurs"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='slot_rejections'
    )
    rejected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "client_profile"
        unique_together = ('slot', 'slot_date', 'user')
        indexes = [
            models.Index(fields=['slot', 'slot_date']),
            models.Index(fields=['user', 'slot_date']),
        ]

    def __str__(self):
        # FIX: Check if self.slot is not None before accessing its attributes
        slotinfo = f' (slot {self.slot.id})' if self.slot else ''
        # You can add slot_date for more detail if slot is present and has a date
        if self.slot and self.slot_date: # Only add slot_date if slot is not None and slot_date exists
            slotinfo = f" (slot {self.slot.id} on {self.slot_date})"
        elif self.slot_date: # If slot is None but slot_date exists (though unlikely for a full rejection)
            slotinfo = f" (on {self.slot_date})"
        # If both slot and slot_date are None, slotinfo remains an empty string.

        return f"{self.user.get_full_name()} rejected shift at {self.shift.pharmacy.name}{slotinfo}"


class ShiftCounterOffer(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"

    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name="counter_offers"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shift_counter_offers"
    )
    message = models.TextField(blank=True)
    request_travel = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_shift_counter_offers"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "client_profile"
        indexes = [
            models.Index(fields=["shift", "status"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self):
        return f"CounterOffer#{self.pk} shift={self.shift_id} user={self.user_id} status={self.status}"


class ShiftOffer(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED_AWAITING_PAYMENT = "ACCEPTED_AWAITING_PAYMENT", "Accepted Awaiting Payment"
        ACCEPTED = "ACCEPTED", "Accepted"
        DECLINED = "DECLINED", "Declined"
        EXPIRED = "EXPIRED", "Expired"

    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name="offers"
    )
    slot = models.ForeignKey(
        ShiftSlot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="offers"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shift_offers"
    )
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    offered_slot_date = models.DateField(null=True, blank=True)
    offered_start_time = models.TimeField(null=True, blank=True)
    offered_end_time = models.TimeField(null=True, blank=True)
    offered_rate = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    counter_offer = models.ForeignKey(
        "ShiftCounterOffer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_shift_offers",
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    last_buzzed_at = models.DateTimeField(null=True, blank=True)
    payment_preference_snapshot = models.CharField(max_length=10, blank=True)
    settlement_channel = models.CharField(max_length=16, blank=True)
    engagement_kind = models.CharField(max_length=32, blank=True)
    engagement_terms_snapshot = models.JSONField(default=dict, blank=True)
    engagement_terms_accepted_at = models.DateTimeField(null=True, blank=True)
    payroll_activated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "client_profile"
        indexes = [
            models.Index(fields=["shift", "status"]),
            models.Index(fields=["user", "status"]),
            models.Index(fields=["expires_at"]),
        ]

    def __str__(self):
        return f"ShiftOffer#{self.pk} shift={self.shift_id} user={self.user_id} status={self.status}"


class ShiftCounterOfferSlot(models.Model):
    offer = models.ForeignKey(
        ShiftCounterOffer,
        on_delete=models.CASCADE,
        related_name="slots"
    )
    slot = models.ForeignKey(
        ShiftSlot,
        on_delete=models.CASCADE,
        related_name="counter_offer_slots",
        null=True,
        blank=True
    )
    slot_date = models.DateField(null=True, blank=True)
    proposed_start_time = models.TimeField()
    proposed_end_time = models.TimeField()
    proposed_rate = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True
    )

    class Meta:
        app_label = "client_profile"
        unique_together = ("offer", "slot", "slot_date")
        indexes = [
            models.Index(fields=["offer", "slot", "slot_date"]),
        ]

    def __str__(self):
        return f"CounterOfferSlot#{self.pk} offer={self.offer_id} slot={self.slot_id}"


class ShiftSaved(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="saved_shifts"
    )
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name="saved_by"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "client_profile"
        unique_together = ("user", "shift")
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["shift"]),
        ]

    def __str__(self):
        return f"SavedShift#{self.pk} user={self.user_id} shift={self.shift_id}"


class LeaveRequest(models.Model):
    """Historical Sada leave rows retained for migration/audit compatibility.

    Active leave reads and writes are owned by workforce.WorkforceLeaveRequest.
    """

    LEAVE_TYPE_CHOICES = [
        ('SICK', 'Sick Leave'),
        ('ANNUAL', 'Annual Leave'),
        ('COMPASSIONATE', 'Compassionate Leave'),
        ('STUDY', 'Study Leave'),
        ('CARER', 'Carer\'s Leave'),
        ('UNPAID', 'Unpaid Leave'),
        ('OTHER', 'Other'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    slot_assignment = models.ForeignKey(
        'ShiftSlotAssignment', 
        on_delete=models.CASCADE, 
        related_name='leave_requests'
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    leave_type = models.CharField(max_length=20, choices=LEAVE_TYPE_CHOICES)
    note = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='PENDING')
    date_applied = models.DateTimeField(auto_now_add=True)
    date_resolved = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "client_profile"
        unique_together = ('slot_assignment', 'user', 'leave_type', 'status')  # Prevent duplicate pending leaves

    def __str__(self):
        return f"{self.user} requests {self.leave_type} for {self.slot_assignment} ({self.status})"


class WorkerShiftRequest(models.Model):
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("AUTO_PUBLISHED", "Auto Published"),
    ]

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="worker_shift_requests",
    )
    # Match your codebase convention: use AUTH_USER_MODEL (resolves to users.User in your setup)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="worker_shift_requests",
    )
    # Optional link for true “swap” (when requesting on an already-defined/assigned slot)
    shift = models.ForeignKey(
        "client_profile.ShiftSlotAssignment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="swap_requests",
    )

    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_worker_shift_requests",
    )
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    role = models.CharField(max_length=100)
    slot_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    note = models.TextField(blank=True, null=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.requested_by} → {self.pharmacy} ({self.slot_date})"

    class Meta:
        app_label = "client_profile"
        ordering = ["-created_at"]
        verbose_name = "Worker Shift Request"
        verbose_name_plural = "Worker Shift Requests"
