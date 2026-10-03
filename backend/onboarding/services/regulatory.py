"""The regulatory tab of the other-staff onboarding: role classification and the documents each role must provide
(AHPRA and hours proof for interns, a certificate for technicians and assistants, a university ID for students),
reset on change, required on submit and checked by the document verification task."""
from rest_framework import serializers

from core.serializer_lifecycle import _delete_file_if_unreferenced
from core.task_queue import async_task


def required_documents_for_role(instance):
    """
    Returns list of (field_name, verified_flag, note_field) tuples required for the selected role.
    """
    role = (instance.role_type or '').upper()
    mapping = {
        'INTERN': [
            ('ahpra_proof', 'ahpra_proof_verified', 'ahpra_proof_verification_note'),
            ('hours_proof', 'hours_proof_verified', 'hours_proof_verification_note'),
        ],
        'TECHNICIAN': [
            ('certificate', 'certificate_verified', 'certificate_verification_note'),
        ],
        'ASSISTANT': [
            ('certificate', 'certificate_verified', 'certificate_verification_note'),
        ],
        'STUDENT': [
            ('university_id', 'university_id_verified', 'university_id_verification_note'),
        ],
    }
    return mapping.get(role, [])


def apply_regulatory_tab(instance, vdata: dict, submit: bool):
    """
    Keeps your current role/subrole logic and per-role docs,
    but runs per-field resets and schedules file verifications.
    """
    update_fields = []
    file_fields = [
        'ahpra_proof','hours_proof','certificate','university_id','cpr_certificate','s8_certificate'
    ]

    def _fname(f):
        return getattr(f, 'name', None) if f else None

    # role classification inputs
    for f in ['role_type','classification_level','student_year','intern_half']:
        if f in vdata:
            if getattr(instance, f) != vdata[f]:
                setattr(instance, f, vdata[f])
                update_fields.append(f)

    # Handle each file: replace/clear safely; reset its verified flag on change
    def handle_file(field):
        changed = False
        if field in vdata:
            new_file = vdata.get(field)  # may be file or None
            old_file = getattr(instance, field, None)
            changed = (_fname(new_file) != _fname(old_file))
            if new_file is None:
                if old_file:
                    try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception: pass
                setattr(instance, field, None)
                update_fields.append(field)
            else:
                if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
                    try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception: pass
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

    if submit:
        instance.verified = False
        update_fields.append('verified')

        # Validate required per role
        req = required_documents_for_role(instance)
        errors = {}
        for field, _, _ in req:
            if not getattr(instance, field, None):
                errors[field] = ['This file is required for the selected role.']
        if errors:
            raise serializers.ValidationError(errors)

    if update_fields:
        instance.save(update_fields=list(set(update_fields)))

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
