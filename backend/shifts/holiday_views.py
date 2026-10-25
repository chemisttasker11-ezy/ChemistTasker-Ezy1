"""Read-only region discovery for explicit declared work-base verification.

Business rules belong exclusively to shifts.holidays. This API merely exposes
source-labelled, dated region choices; no postcode-to-council guesses.
"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from shifts.holidays import normalize_state, holiday_calendar_status
from shifts.pricing_data import local_public_holidays


class PublicHolidayRegionsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        state = normalize_state(request.query_params.get("state", ""))
        if not state:
            raise ValidationError({"state": "Select a valid Australian state or territory."})
        records = local_public_holidays()["regions"]
        choices = []
        for key, record in sorted(records.items()):
            if record["state"] == state:
                choices.append({
                    "code": key, "label": record["label"],
                    "coverage": record["coverage"],
                    "verifiedYears": record["verified_years"],
                    "pendingYears": record["pending_years"],
                    "source": record["source"],
                    "requiresBoundaryVerification": True,
                })
        return Response({
            "state": state, "regionRequired": state in {"QLD", "NSW", "NT", "TAS", "VIC", "WA"},
            "calendar": holiday_calendar_status(state),
            "regions": choices,
            "legalBasis": local_public_holidays()["legal_basis"],
            "note": (
                "Options are exact declared districts, not postcode matches. "
                "If your employee work base is not listed, request source "
                "verification; do not choose an adjacent council."
            ),
        })
