"""The identity tab of every onboarding role: document type, primary and secondary document files and per-type
details, with verification resets on change, per-type validation on submit and the document check queued on submit."""
from rest_framework import serializers

from core.serializer_lifecycle import _delete_file_if_unreferenced
from core.task_queue import async_task
from onboarding.models import OwnerOnboarding


def apply_identity_tab(instance, vdata: dict, submit: bool):
    """
    Handles:
    - government_id_type (dropdown)
    - government_id (primary file)
    - identity_secondary_file (secondary file for paired docs)
    - identity_meta (JSON with per-type fields)
    Normalises per document type and validates on submit.
    """
    update_fields = []

    # helper to compare file names safely
    def _fname(f):
        return getattr(f, 'name', None) if f else None

    # Track changes to drive verification resets
    type_changed = False
    gov_id_changed = False
    sec_changed = False
    meta_changed = False

    # --- type (dropdown) – optional
    if 'government_id_type' in vdata:
        new_type = vdata.get('government_id_type')
        type_changed = (new_type != getattr(instance, 'government_id_type'))
        instance.government_id_type = new_type
        update_fields.append('government_id_type')

        # If switching to a type that doesn't need a secondary file, clear it
        if new_type in ('DRIVER_LICENSE', 'AUS_PASSPORT', 'AGE_PROOF'):
            old_sec = getattr(instance, 'identity_secondary_file', None)
            if old_sec:
                try:
                    _delete_file_if_unreferenced(old_sec, current_instance=instance)
                except Exception:
                    pass
                instance.identity_secondary_file = None
                update_fields.append('identity_secondary_file')
                sec_changed = True

        # If type changes and no new meta provided, wipe old meta to avoid stale keys
        if 'identity_meta' not in vdata:
            instance.identity_meta = {}
            update_fields.append('identity_meta')
            meta_changed = True

    # --- primary file handling (replace / clear)
    if 'government_id' in vdata:
        new_file = vdata.get('government_id')
        old_file = getattr(instance, 'government_id', None)
        gov_id_changed = (_fname(new_file) != _fname(old_file))

        if new_file is None:
            if old_file:
                try:
                    _delete_file_if_unreferenced(old_file, current_instance=instance)
                except Exception:
                    pass
            instance.government_id = None
            update_fields.append('government_id')
        else:
            if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
                try:
                    _delete_file_if_unreferenced(old_file, current_instance=instance)
                except Exception:
                    pass
            instance.government_id = new_file
            update_fields.append('government_id')

    # --- secondary file handling (replace / clear)
    if 'identity_secondary_file' in vdata:
        new_sec = vdata.get('identity_secondary_file')  # may be file or None
        old_sec = getattr(instance, 'identity_secondary_file', None)
        sec_changed = (_fname(new_sec) != _fname(old_sec))

        if new_sec is None:
            if old_sec:
                try:
                    _delete_file_if_unreferenced(old_sec, current_instance=instance)
                except Exception:
                    pass
            instance.identity_secondary_file = None
            update_fields.append('identity_secondary_file')
        else:
            if old_sec and _fname(old_sec) and _fname(old_sec) != _fname(new_sec):
                try:
                    _delete_file_if_unreferenced(old_sec, current_instance=instance)
                except Exception:
                    pass
            instance.identity_secondary_file = new_sec
            update_fields.append('identity_secondary_file')

    # --- identity_meta (JSON) – normalise per document type
    if 'identity_meta' in vdata:
        incoming_meta = vdata.get('identity_meta') or {}
        meta = dict(incoming_meta)  # shallow copy
        doc_type = getattr(instance, 'government_id_type')

        if doc_type == 'DRIVER_LICENSE':
            keep = {'state', 'expiry'}
            meta = {k: v for k, v in meta.items() if k in keep}

        elif doc_type == 'VISA':
            # Visa + Overseas passport (secondary file)
            keep = {'visa_type_number', 'valid_to', 'passport_country', 'passport_expiry'}
            meta = {k: v for k, v in meta.items() if k in keep}

        elif doc_type == 'AUS_PASSPORT':
            keep = {'expiry'}
            meta = {k: v for k, v in meta.items() if k in keep}
            meta['country'] = 'Australia'

        elif doc_type == 'OTHER_PASSPORT':
            # Overseas passport + Visa (secondary file)
            keep = {'country', 'expiry', 'visa_type_number', 'valid_to'}
            meta = {k: v for k, v in meta.items() if k in keep}

        elif doc_type == 'AGE_PROOF':
            keep = {'state', 'expiry'}
            meta = {k: v for k, v in meta.items() if k in keep}

        # Detect change
        if meta != (instance.identity_meta or {}):
            instance.identity_meta = meta
            update_fields.append('identity_meta')
            meta_changed = True

    # --- reset verification flags if any relevant identity input changed
    if gov_id_changed or sec_changed or type_changed or meta_changed:
        instance.gov_id_verified = False
        instance.gov_id_verification_note = ""
        update_fields += ['gov_id_verified', 'gov_id_verification_note']

    # Owner identity is a separate marketplace gate; do not revoke an
    # approved owner profile or unrelated dashboard access on submission.
    if submit and not isinstance(instance, OwnerOnboarding):
        instance.verified = False
        update_fields.append('verified')

    if update_fields:
        instance.save(update_fields=list(set(update_fields)))

    # --- Validate on submit (per type)
    if submit:
        errors = {}
        doc_type = getattr(instance, 'government_id_type')
        meta_now = getattr(instance, 'identity_meta') or {}

        if not doc_type:
            errors['government_id_type'] = ['Select a document type.']

        # Primary file required for all types
        if not getattr(instance, 'government_id', None):
            errors['government_id'] = ['This file is required.']

        if doc_type == 'DRIVER_LICENSE':
            if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
            if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']

        elif doc_type == 'VISA':
            if not meta_now.get('visa_type_number'):  errors['identity_meta.visa_type_number'] = ['Required.']
            if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']
            if not getattr(instance, 'identity_secondary_file', None):
                errors['identity_secondary_file'] = ['Overseas passport file is required with a Visa.']
            if not meta_now.get('passport_country'): errors['identity_meta.passport_country'] = ['Required.']
            if not meta_now.get('passport_expiry'):  errors['identity_meta.passport_expiry'] = ['Required.']

        elif doc_type == 'AUS_PASSPORT':
            if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']
            # country forced to Australia in normalisation

        elif doc_type == 'OTHER_PASSPORT':
            if not meta_now.get('country'): errors['identity_meta.country'] = ['Required.']
            if not meta_now.get('expiry'):  errors['identity_meta.expiry'] = ['Required.']
            if not getattr(instance, 'identity_secondary_file', None):
                errors['identity_secondary_file'] = ['Visa file is required with an Overseas passport.']
            if not meta_now.get('visa_type_number'): errors['identity_meta.visa_type_number'] = ['Required.']
            if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']

        elif doc_type == 'AGE_PROOF':
            if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
            if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']

        if errors:
            raise serializers.ValidationError(errors)

        # On submit: schedule verification task if needed (primary file)
        if instance.government_id and (gov_id_changed or type_changed or meta_changed or not instance.gov_id_verified):
            async_task(
                'client_profile.tasks.verify_filefield_task',
                instance._meta.model_name, instance.pk,
                'government_id',
                instance.user.first_name or '',
                instance.user.last_name or '',
                instance.user.email or '',
                verification_field='gov_id_verified',
                note_field='gov_id_verification_note',
            )

    # Recompute final verified gate on every pass
    return instance
