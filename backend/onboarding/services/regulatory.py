"""The regulatory tab of the other-staff onboarding: role classification, the intern's AHPRA number and optional
evidence documents (qualification certificate, university ID, ...). Documents earn badges and are checked by the
document verification task; they never block submission (onboarding/verification/policy.py)."""
from rest_framework import serializers

from infrastructure.serializer_lifecycle import _delete_file_if_unreferenced
from users.task_dispatch import async_task


def check_role_unchanged(instance, vdata: dict) -> None:
    """Owner decision 2026-10-14: a Pharmacy team role is fixed once chosen."""
    original_role = str(instance.role_type or '').upper()
    if 'role_type' in vdata and original_role and str(vdata.get('role_type') or '').upper() != original_role:
        raise serializers.ValidationError({'role_type': ['Your role is set and cannot be changed. Contact support if it is wrong.']})


def apply_regulatory_tab(instance, vdata: dict, submit: bool):
    """
    Keeps your current role/subrole logic and per-role docs,
    but runs per-field resets and schedules file verifications.
    """
    update_fields = []
    old_files_to_delete = []
    file_fields = [
        'ahpra_proof','hours_proof','certificate','university_id','cpr_certificate','s8_certificate'
    ]

    def _fname(f):
        return getattr(f, 'name', None) if f else None

    original_role = str(instance.role_type or '').upper()
    original_class = instance.classification_level
    original_year = instance.student_year
    original_half = instance.intern_half
    original_dispensing = instance.dispensary_qualification
    # Owner decision 2026-10-14: a Pharmacy team role is fixed once chosen (a pharmacy may still give the person a
    # different role in its own team through the membership; that never reaches the public profile).
    check_role_unchanged(instance, vdata)

    # role classification inputs
    for f in ['role_type','classification_level','student_year','intern_half','dispensary_qualification','ahpra_number']:
        if f in vdata:
            if getattr(instance, f) != vdata[f]:
                setattr(instance, f, vdata[f])
                update_fields.append(f)
    # A changed AHPRA number resets its check (and Verified) in the serializer's guard (verification/ahpra_numbers.py).

    role_or_class_changed = (
        original_role != str(instance.role_type or '').upper()
        or original_class != instance.classification_level
        or original_year != instance.student_year
        or original_half != instance.intern_half
    )
    if role_or_class_changed:
        # Previously checked documents must not silently back a new award classification (their badges reset;
        # Verified does not depend on them).
        for flag in ('ahpra_proof_verified', 'hours_proof_verified', 'certificate_verified', 'university_id_verified'):
            setattr(instance, flag, False)
            update_fields.append(flag)

    # Handle each file: replace/clear safely; reset its verified flag on change
    def handle_file(field):
        changed = False
        if field in vdata:
            new_file = vdata.get(field)  # may be file or None
            old_file = getattr(instance, field, None)
            changed = (_fname(new_file) != _fname(old_file))
            if new_file is None:
                if old_file:
                    old_files_to_delete.append(old_file)
                setattr(instance, field, None)
                update_fields.append(field)
            else:
                if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
                    old_files_to_delete.append(old_file)
                setattr(instance, field, new_file)
                update_fields.append(field)

            # reset verification when changed
            if changed:
                vflag = f"{field}_verified"
                vnote = f"{field}_verification_note"
                if hasattr(instance, vflag):
                    setattr(instance, vflag, False)
                    update_fields.append(vflag)
                if hasattr(instance, vnote):
                    setattr(instance, vnote, "")
                    update_fields.append(vnote)
        return changed

    changed_map = {f: handle_file(f) for f in file_fields}
    if role_or_class_changed or original_dispensing != instance.dispensary_qualification or changed_map['certificate']:
        instance.dispensary_qualification_verified = False
        instance.dispensary_qualification_verification_note = ''
        update_fields.extend(['dispensary_qualification_verified', 'dispensary_qualification_verification_note'])

    if submit:
        if str(instance.role_type or '').upper() == 'INTERN' and not (instance.ahpra_number or '').strip():
            raise serializers.ValidationError({'ahpra_number': ['Enter your AHPRA number (provisional registration).']})

    if update_fields:
        instance.save(update_fields=list(set(update_fields)))

    # Storage deletion is deliberately after validation and the successful DB
    # write. A rejected submit must never leave the persisted row pointing at
    # a file that has already been deleted.
    for old_file in old_files_to_delete:
        try:
            _delete_file_if_unreferenced(old_file, current_instance=instance)
        except Exception:
            pass

    # Interns: the admin team checks the AHPRA number on the public register, as for pharmacists (who send theirs from
    # the basic tab); the difference is the registration type, provisional.
    if submit and str(instance.role_type or '').upper() == 'INTERN' and not instance.ahpra_verified:
        from onboarding.emails import notify_superuser_on_onboarding
        try:
            notify_superuser_on_onboarding(instance)
        except Exception:
            pass  # never block the worker on email problems

    # schedule verification tasks for any provided file that changed or is not verified
    if submit:
        for field, changed in changed_map.items():
            vflag = f"{field}_verified"
            if getattr(instance, field, None) and (changed or not getattr(instance, vflag, False)):
                async_task(
                    'client_profile.tasks.verify_filefield_task',
                    instance._meta.model_name, instance.pk,
                    field,
                    instance.user.first_name or '',
                    instance.user.last_name or '',
                    instance.user.email or '',
                    verification_field=f"{field}_verified",
                    note_field=f"{field}_verification_note",
                )
    return instance
