"""The basic tab of each onboarding role: personal and address details, the profile photo and, per role, AHPRA
(pharmacist, owner), role classification (other staff, explorer) and the owner's pharmacy details."""
from rest_framework import serializers

from core.numbers import coerce_float_6 as q6
from core.serializer_lifecycle import _update_locked_user_fields
from onboarding.services.profile import apply_profile_photo


def apply_pharmacist_basic_tab(instance, vdata: dict, submit: bool, *, initial_data):
    # nested user data
    user_data = vdata.pop('user', {})

    update_fields = []

    if user_data:
        _update_locked_user_fields(instance.user, user_data)

    apply_profile_photo(instance, vdata, initial_data, update_fields)

    # helper to compare file names safely
    def _fname(f):
        return getattr(f, 'name', None) if f else None

    # We will handle government_id explicitly (to delete old files safely),
    # so do NOT include it in direct_fields.
    direct_fields = [
    'ahpra_number',
    'street_address', 'suburb', 'state', 'postcode', 'google_place_id',
    'open_to_travel', 'travel_states', 'coverage_radius_km',
    'date_of_birth', 'gender', 'emergency_contact_number', 'emergency_contact_relation',
    ]

    # Detect changes that affect verification flags
    ahpra_changed = 'ahpra_number' in vdata and (vdata.get('ahpra_number') != getattr(instance, 'ahpra_number'))

    # --- government_id: delete old file on replace or explicit clear ---
    # gov_id_changed = False
    # if 'government_id' in vdata:
    #     new_file = vdata.get('government_id')  # may be a file object or None
    #     old_file = getattr(instance, 'government_id', None)
    #     gov_id_changed = (_fname(new_file) != _fname(old_file))

    #     if new_file is None:
    #         # explicit clear
    #         if old_file:
    #             try:
    #                 _delete_file_if_unreferenced(old_file, current_instance=instance)   # Azure/local safe
    #             except Exception:
    #                 pass
    #         instance.government_id = None
    #         update_fields.append('government_id')
    #     else:
    #         # replacing: delete old first if it's different
    #         if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
    #             try:
    #                 _delete_file_if_unreferenced(old_file, current_instance=instance)
    #             except Exception:
    #                 pass
    #         instance.government_id = new_file
    #         update_fields.append('government_id')

    # regular writes for other basic fields
    for f in direct_fields:
        if f in vdata:
            setattr(instance, f, vdata[f])
            update_fields.append(f)

    # round/quantize lat/lon to 6 dp if provided
    if 'latitude' in vdata:
        instance.latitude = q6(vdata.get('latitude'))
        update_fields.append('latitude')
    if 'longitude' in vdata:
        instance.longitude = q6(vdata.get('longitude'))
        update_fields.append('longitude')

    # reset only relevant flags when inputs changed
    if ahpra_changed:
        instance.ahpra_verified = False
        instance.ahpra_verification_note = ""
        update_fields += ['ahpra_verified', 'ahpra_verification_note']

    # if gov_id_changed:
    #     instance.gov_id_verified = False
    #     instance.gov_id_verification_note = ""
    #     update_fields += ['gov_id_verified', 'gov_id_verification_note']

    # full profile remains unverified until all tabs pass
    if submit:
        instance.verified = False
        update_fields.append('verified')

    if update_fields:
        instance.save(update_fields=list(set(update_fields)))

    # trigger ONLY the basic-tab tasks when submitting
    if submit:
        ahpra = vdata.get('ahpra_number', instance.ahpra_number)
        # gov   = vdata.get('government_id', instance.government_id)
        errors = {}
        if not ahpra:
            errors['ahpra_number'] = ['AHPRA number is required to submit.']
        # if not gov:
        #     errors['government_id'] = ['Government ID file is required to submit.']
        if errors:
            raise serializers.ValidationError(errors)

        # NOTE: AHPRA verification is handled manually to avoid automated scraping.
        # if instance.ahpra_number and (ahpra_changed or not instance.ahpra_verified):
        #     async_task(
        #         'client_profile.tasks.verify_ahpra_task',
        #         instance._meta.model_name, instance.pk,
        #         instance.ahpra_number, instance.user.first_name,
        #         instance.user.last_name, instance.user.email,
        #     )

        # GOV ID: file changed OR not verified yet
        # if instance.government_id and (gov_id_changed or not instance.gov_id_verified):
        #     async_task(
        #         'client_profile.tasks.verify_filefield_task',
        #         instance._meta.model_name, instance.pk,
        #         'government_id',
        #         instance.user.first_name or '',
        #         instance.user.last_name or '',
        #         instance.user.email or '',
        #         verification_field='gov_id_verified',
        #         note_field='gov_id_verification_note',
        #     )

    return instance


def apply_otherstaff_basic_tab(instance, vdata: dict, submit: bool, *, initial_data):
    # nested user data
    user_data = vdata.pop('user', {})
    if user_data:
        _update_locked_user_fields(instance.user, user_data)

    update_fields = []

    apply_profile_photo(instance, vdata, initial_data, update_fields)

    # regular writes for basic fields (address + dob)
    direct_fields = [
        'street_address','suburb','state','postcode','google_place_id','open_to_travel','travel_states','coverage_radius_km','date_of_birth',
        'gender','emergency_contact_number','emergency_contact_relation',
        'role_type','classification_level','student_year','intern_half',  # allow role data in Basic if FE sends them early
    ]
    for f in direct_fields:
        if f in vdata:
            setattr(instance, f, vdata[f])
            update_fields.append(f)

    # lat/lon rounding to 6 dp
    if 'latitude' in vdata:
        instance.latitude = q6(vdata.get('latitude'))
        update_fields.append('latitude')
    if 'longitude' in vdata:
        instance.longitude = q6(vdata.get('longitude'))
        update_fields.append('longitude')

    if submit:
        instance.verified = False
        update_fields.append('verified')

    if update_fields:
        instance.save(update_fields=list(set(update_fields)))
    return instance


def apply_explorer_basic_tab(instance, vdata: dict, submit: bool, *, initial_data):
    # nested user data
    user_data = vdata.pop('user', {})
    if user_data:
        _update_locked_user_fields(instance.user, user_data)

    update_fields = []

    apply_profile_photo(instance, vdata, initial_data, update_fields)

    # role + address
    direct_fields = [
        'role_type','gender','emergency_contact_number','emergency_contact_relation',
        'street_address','suburb','state','postcode','google_place_id','open_to_travel','travel_states','coverage_radius_km',
    ]
    for f in direct_fields:
        if f in vdata:
            setattr(instance, f, vdata[f])
            update_fields.append(f)

    # lat/lon rounding
    if 'latitude' in vdata:
        instance.latitude = q6(vdata.get('latitude'))
        update_fields.append('latitude')
    if 'longitude' in vdata:
        instance.longitude = q6(vdata.get('longitude'))
        update_fields.append('longitude')

    if submit:
        instance.verified = False
        update_fields.append('verified')

    if update_fields:
        instance.save(update_fields=list(set(update_fields)))
    return instance


def apply_owner_basic_tab(instance, vdata: dict, submit: bool, *, initial_data):
    user_data = vdata.pop("user", {})
    update_fields: list[str] = []

    if user_data:
        _update_locked_user_fields(instance.user, user_data)

    apply_profile_photo(instance, vdata, initial_data, update_fields)

    direct_fields = ["gender", "role", "chain_pharmacy", "number_of_pharmacies", "ahpra_number"]
    role_changed = "role" in vdata and vdata.get("role") != instance.role
    ahpra_changed = "ahpra_number" in vdata and vdata.get("ahpra_number") != instance.ahpra_number

    for field in direct_fields:
        if field in vdata:
            setattr(instance, field, vdata[field])
            update_fields.append(field)

    reset_ahpra = role_changed or ahpra_changed
    if reset_ahpra:
        instance.ahpra_verified = False
        instance.ahpra_verification_note = ""
        update_fields.extend(["ahpra_verified", "ahpra_verification_note"])

    first_submit = submit and not instance.submitted_for_verification
    if first_submit:
        instance.submitted_for_verification = True
        update_fields.append("submitted_for_verification")

    if submit:
        instance.verified = False
        update_fields.append("verified")

    if update_fields:
        instance.save(update_fields=list(set(update_fields)))

    # Notify on any update to this onboarding (manual review required).
    if update_fields:
        from onboarding.emails import notify_superuser_on_onboarding
        try:
            notify_superuser_on_onboarding(instance)
        except Exception:
            pass

    # NOTE: AHPRA verification is handled manually to avoid automated scraping.
    # if submit and instance.role == "PHARMACIST":
    #     should_verify_ahpra = bool(instance.ahpra_number) and (
    #         ahpra_changed or not instance.ahpra_verified
    #     )
    #     if should_verify_ahpra:
    #         async_task(
    #             "client_profile.tasks.verify_ahpra_task",
    #             instance._meta.model_name,
    #             instance.pk,
    #             instance.ahpra_number,
    #             instance.user.first_name or "",
    #             instance.user.last_name or "",
    #             instance.user.email or "",
    #         )

    return instance
