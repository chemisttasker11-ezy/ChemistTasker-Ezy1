"""Backward-compatible common helper imports."""
from core.numbers import quantize_decimal_6 as q6
from users.navigation import get_frontend_dashboard_url
from users.normalization import sanitize_email_text as clean_email

__all__ = ["clean_email", "q6", "get_frontend_dashboard_url"]
