"""Small numeric coercion helpers with intentionally distinct return types."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


def quantize_decimal_6(value):
    """Return a Decimal rounded to six places, or None for blank/invalid input."""
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None


def coerce_float_6(value):
    """Return a float rounded to six places, or None for blank/invalid input."""
    if value in (None, ""):
        return None
    try:
        return round(float(value), 6)
    except Exception:
        return None
