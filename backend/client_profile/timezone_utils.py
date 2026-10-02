"""Backward-compatible pharmacy timezone helper.

New domain code should import from `organizations.timezone`.
This facade preserves the historical import path for external/internal callers.
"""
from organizations.timezone import get_pharmacy_timezone

__all__ = ["get_pharmacy_timezone"]
