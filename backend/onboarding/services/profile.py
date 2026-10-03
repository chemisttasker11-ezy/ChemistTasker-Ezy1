"""Profile data shared by the onboarding roles: the profile photo (basic tab) and the profile tab (resume and short
bio), with old files deleted when replaced or cleared."""
from core.serializer_lifecycle import _delete_file_if_unreferenced, _file_has_changed, _should_clear_flag


def apply_profile_photo(instance, vdata: dict, initial_data, update_fields: list):
    """Replace or clear the profile photo (the basic tab of every role); the old file is deleted when unreferenced.
    Appends to `update_fields`; the caller saves."""
    clear_photo = _should_clear_flag(initial_data, "profile_photo_clear")
    if "profile_photo" in vdata or clear_photo:
        new_photo = vdata.pop("profile_photo", None)
        old_photo = getattr(instance, "profile_photo", None)
        if new_photo is None and clear_photo:
            if old_photo:
                try:
                    _delete_file_if_unreferenced(old_photo, current_instance=instance)
                except Exception:
                    pass
            instance.profile_photo = None
            update_fields.append("profile_photo")
        elif new_photo is not None:
            if old_photo and _file_has_changed(new_photo, old_photo):
                try:
                    _delete_file_if_unreferenced(old_photo, current_instance=instance)
                except Exception:
                    pass
            instance.profile_photo = new_photo
            update_fields.append("profile_photo")


def apply_profile_tab(instance, vdata: dict, submit: bool):
    """
    Profile tab: resume file + short note (short_bio).
    Behavior:
    - If a new resume is uploaded, delete the old file first (Azure + dev parity).
    - If resume is explicitly set to None, delete existing file.
    - short_bio is plain text, optional.
    """
    update_fields = []

    # Handle short_bio (optional)
    if 'short_bio' in vdata:
        instance.short_bio = vdata['short_bio']
        update_fields.append('short_bio')

    # Handle resume
    if 'resume' in vdata:
        new_file = vdata['resume']  # may be a file object or None
        old_file = getattr(instance, 'resume', None)

        if new_file is None:
            # explicit clear
            if old_file:
                _delete_file_if_unreferenced(old_file, current_instance=instance)  # Azure/local safe
            instance.resume = None
            update_fields.append('resume')
        else:
            # replace file: delete old first to mimic overwrite behavior everywhere
            if old_file:
                try:
                    # delete only if name differs (optional; safe to always delete)
                    if getattr(old_file, 'name', None) != getattr(new_file, 'name', None):
                        _delete_file_if_unreferenced(old_file, current_instance=instance)
                except Exception:
                    # swallow storage deletion errors to avoid blocking user save
                    pass
            instance.resume = new_file
            update_fields.append('resume')

    # Submit does not auto-verify anything here; keep profile unverified until all tabs pass
    if submit:
        instance.verified = False
        update_fields.append('verified')

    if update_fields:
        instance.save(update_fields=list(set(update_fields)))
    return instance
