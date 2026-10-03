"""User-input normalization helpers with explicit semantics."""
import re


def sanitize_email_text(email):
    """Remove hidden Unicode direction/zero-width characters and all whitespace, preserving case."""
    if not email:
        return email
    return re.sub(r'[\u200e\u200f\u202a-\u202e\u200b\s]', '', email)


def normalize_email(email):
    """Trim outer whitespace and lowercase an email-like value."""
    return (email or "").strip().lower()
