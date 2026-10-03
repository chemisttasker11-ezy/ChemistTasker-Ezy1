"""Text sanitising for chat messages."""
import re
from django.utils.html import strip_tags


def sanitize_chat_text(value: str) -> str:
    raw_value = (value or "").strip()
    # Drop script/style blocks entirely so their inner text is not kept in messages.
    raw_value = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", " ", raw_value, flags=re.IGNORECASE | re.DOTALL)
    cleaned = strip_tags(raw_value)
    return " ".join(cleaned.split())
