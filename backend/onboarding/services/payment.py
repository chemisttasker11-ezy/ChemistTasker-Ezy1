"""The payment tab of the pharmacist and other-staff onboarding: ABN (with the user's entity confirmation) or TFN
with super details, and the ABN lookup queued on submit."""
from rest_framework import serializers

from core.task_queue import async_task


def apply_payment_tab(instance, vdata: dict, submit: bool):
    """
    Payment fields only. No GST file in V2.
    - ABN: task scrapes ABR fields; user must confirm => abn_verified=True
    - TFN: store through encrypted model field `tfn_number`, show only tfn_masked on reads
    - When pref=TFN and submit=True -> TFN + super_* are required
    """
    payment_fields = [
        'payment_preference', 'abn', 'gst_registered',
        'super_fund_name', 'super_usi', 'super_member_number',
        'abn_entity_confirmed',
    ]
    update_fields: list[str] = []

    # normalize pref for logic below
    pref_in = (vdata.get('payment_preference') or instance.payment_preference or '').upper()

    # compare with the stored ABN before the regular writes overwrite it
    abn_changed = ('abn' in vdata) and (vdata.get('abn') != getattr(instance, 'abn'))

    # 1) regular writes
    for f in payment_fields:
        if f in vdata:
            setattr(instance, f, vdata[f])
            update_fields.append(f)

    # 2) TFN payload – client sends "tfn" (source='tfn_number'), DRF puts it in vdata['tfn_number']
    if 'tfn_number' in vdata:
        instance.tfn_number = (vdata['tfn_number'] or '').strip()
        update_fields.append('tfn_number')

    # 3) if ABN changed -> reset verification + confirmation
    if abn_changed:
        instance.abn_verified = False
        instance.abn_entity_confirmed = False
        instance.abn_verification_note = ""
        update_fields += ['abn_verified', 'abn_entity_confirmed', 'abn_verification_note']

    # 4) confirmation gate: only user confirmation can set abn_verified=True
    if 'abn_entity_confirmed' in vdata:
        confirmed = bool(vdata['abn_entity_confirmed'])
        if confirmed and instance.abn_entity_name:   # must have scraped data to confirm
            instance.abn_verified = True
            if not instance.abn_verification_note:
                instance.abn_verification_note = 'User confirmed ABN entity details.'
            update_fields += ['abn_verified', 'abn_verification_note']
        else:
            if instance.abn_verified:
                instance.abn_verified = False
                update_fields.append('abn_verified')

    # 5) optional sync of boolean gst_registered from ABR result if client didn’t send it
    if 'gst_registered' not in vdata:
        if instance.abn_gst_registered is True and not instance.gst_registered:
            instance.gst_registered = True
            update_fields.append('gst_registered')

    # 6) TFN validation: when submitting TFN path, enforce super_* required
    if submit and (pref_in or instance.payment_preference):
        pref_effective = (pref_in or instance.payment_preference or '').upper()
        if pref_effective == 'TFN':
            errors = {}
            if not instance.tfn_number:
                errors['tfn'] = ['TFN is required.']
            if not instance.super_fund_name:
                errors['super_fund_name'] = ['Super fund name is required for TFN.']
            if not instance.super_usi:
                errors['super_usi'] = ['USI is required for TFN.']
            if not instance.super_member_number:
                errors['super_member_number'] = ['Member number is required for TFN.']
            if errors:
                raise serializers.ValidationError(errors)

    # 7) submitting this tab keeps the whole profile unverified until all tabs pass
    if submit:
        instance.verified = False
        update_fields.append('verified')

    if update_fields:
        instance.save(update_fields=list(set(update_fields)))

    # 8) run ABN task on submit (TFN has no task)
    if submit:
        pref_effective = (pref_in or instance.payment_preference or '').upper()
        if pref_effective == 'ABN' and instance.abn:
            async_task(
                'client_profile.tasks.verify_abn_task',
                instance._meta.model_name,
                instance.pk,
                instance.abn,
                instance.user.first_name or '',
                instance.user.last_name or '',
                instance.user.email or '',
                note_field='abn_verification_note',  # task will only fill ABR fields + note
            )
    return instance


def masked_tfn(obj):
    """
    Never expose raw TFN back to the client.
    TFNs are stored through the encrypted `tfn_number` field and masked on output.
    """
    tfn = getattr(obj, 'tfn_number', '') or ''
    if not tfn:
        return ''
    return f'*** *** {tfn[-3:]}'
