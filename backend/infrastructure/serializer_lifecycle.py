"""File lifecycle mechanics; application composition supplies explicit model references."""
from django.core.exceptions import ImproperlyConfigured
from django.core.files.storage import default_storage


_file_references = None


def configure_file_references(references):
    global _file_references
    _file_references = tuple(references)


def _known_file_references():
    if _file_references is None:
        raise ImproperlyConfigured("Application startup must configure file references.")
    return list(_file_references)


def verification_fields_changed(instance, validated_data, fields):
    for field in fields:
        old = getattr(instance, field, None)
        if field in validated_data:
            new = validated_data[field]
        else:
            continue
        if hasattr(old, "name") or hasattr(new, "name"):
            old_name = getattr(old, "name", None)
            new_name = getattr(new, "name", None)
            if (old_name or "").strip() != (new_name or "").strip():
                return True
        else:
            # Important: Convert both to string to handle bools, numbers, etc.
            if str(old or "").strip() != str(new or "").strip():
                return True
    return False


def _file_has_changed(new_file, old_file):
    return getattr(new_file, "name", None) != getattr(old_file, "name", None)


def _delete_file_if_unreferenced(file_field, *, current_instance=None):
    name = getattr(file_field, "name", None)
    if not name:
        return False

    for model, field_name in _known_file_references():
        qs = model.objects.filter(**{field_name: name})
        if current_instance is not None and isinstance(current_instance, model):
            qs = qs.exclude(pk=getattr(current_instance, "pk", None))
        if qs.exists():
            return False

    try:
        # Delete the storage object, not the bound FieldFile. FieldFile.delete()
        # also writes None back onto its model instance; when callers have just
        # saved a replacement file that would erase the new in-memory pointer
        # and can suppress follow-up work such as verification dispatch.
        storage = getattr(file_field, "storage", None) or default_storage
        storage.delete(name)
        return True
    except Exception:
        return False


def _should_clear_flag(initial_data, key):
    value = initial_data.get(key)
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


class RemoveOldFilesMixin:
    file_fields: list[str] = []
    def update(self, instance, validated_data):
        for field_name in self.file_fields:
            if field_name in validated_data:
                new_file, old_file = validated_data[field_name], getattr(instance, field_name)
                if old_file and old_file.name and (new_file is None or old_file.name != new_file.name):
                    _delete_file_if_unreferenced(old_file, current_instance=instance)
            elif field_name in validated_data and validated_data[field_name] is None:
                old_file = getattr(instance, field_name)
                if old_file:
                    _delete_file_if_unreferenced(old_file, current_instance=instance)
        return super().update(instance, validated_data)

