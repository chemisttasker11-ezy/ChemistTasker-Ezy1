"""Chat attachment storage paths."""
from infrastructure.uploads import unique_upload_path as _unique_upload_path


def chat_upload_path(instance, filename):
    conversation_id = instance.conversation_id or "new"
    return _unique_upload_path(f"chat/{conversation_id}", filename)
