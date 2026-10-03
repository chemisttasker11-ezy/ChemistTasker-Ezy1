"""Small shared helpers: e-mail normalisation, frontend dashboard links, two-decimal quantising."""
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from django.conf import settings


def clean_email(email):
    """Remove hidden unicode chars and spaces from email."""
    if not email:
        return email
    # Remove LTR/RTL, bidi, zero-width space, and all whitespace
    # \u200e (LTR), \u200f (RTL), \u202a-\u202e (bidi), \u200b (zero-width space), \s (any space)
    return re.sub(r'[\u200e\u200f\u202a-\u202e\u200b\s]', '', email)


def get_frontend_dashboard_url(user):
    """
    Returns the appropriate frontend dashboard URL based on the user's role.
    Handles 'OTHER_STAFF' to 'otherstaff' conversion.
    """
    if not user or not hasattr(user, 'role'):
        return f"{settings.FRONTEND_BASE_URL}/dashboard/" # Default fallback

    role_slug = user.role.lower()
    if role_slug == 'other_staff': # Your specific conversion rule
        role_slug = 'otherstaff'
    elif role_slug == 'owner':
        # Check for organization admin role first if it influences dashboard path
        # Assuming 'ORGANIZATION' role is handled within the 'owner' dashboard structure or has its own path
        if hasattr(user, 'organization_memberships') and user.organization_memberships.filter(
            role__in=['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN']
        ).exists():
            return f"{settings.FRONTEND_BASE_URL}/dashboard/organization/" # Or whatever your org admin path is
        else:
            return f"{settings.FRONTEND_BASE_URL}/dashboard/owner/"
    
    return f"{settings.FRONTEND_BASE_URL}/dashboard/{role_slug}/"


def q6(v):
    """Quantize to 6 decimal places; return None on blank/invalid."""
    if v in (None, ''):
        return None
    try:
        return Decimal(str(v)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None
