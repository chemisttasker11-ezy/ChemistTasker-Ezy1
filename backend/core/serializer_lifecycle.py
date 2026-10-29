"""Historical serializer helpers; implementations live with mechanics and identity."""
from infrastructure.serializer_lifecycle import (
    RemoveOldFilesMixin, _delete_file_if_unreferenced, _file_has_changed,
    _known_file_references, _should_clear_flag, default_storage, verification_fields_changed,
)
from users.identity_updates import _normalize_identity_value, _update_locked_user_fields, serializers
