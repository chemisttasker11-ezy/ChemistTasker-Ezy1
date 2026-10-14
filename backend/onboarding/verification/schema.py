"""OpenAPI shape of verification_summary() (policy.py), shared by the onboarding and talent responses.

Documentation and contract only: the views return the dict verification_summary() builds; tests validate real
payloads against these serializers so the schema cannot drift from the response."""
from rest_framework import serializers

from onboarding.models import WORK_RIGHTS_CHOICES

STATES = ('verified', 'pending', 'not_supplied', 'failed')
BADGE_CODES = ('AHPRA', 'AHPRA_PROVISIONAL', 'QUALIFICATION', 'DISPENSING', 'ENROLMENT', 'ID', 'REFERENCES', 'ABN')
REQUIREMENTS = ('email', 'mobile', 'ahpra', 'gov_id', 'referees', 'role')


class VerificationBadgeSerializer(serializers.Serializer):
    code = serializers.ChoiceField(choices=BADGE_CODES)
    state = serializers.ChoiceField(choices=STATES)


class VerificationSummarySerializer(serializers.Serializer):
    verified = serializers.BooleanField()
    missing = serializers.ListField(child=serializers.ChoiceField(choices=REQUIREMENTS))
    outstanding = serializers.ListField(child=serializers.ChoiceField(choices=REQUIREMENTS))
    grace_until = serializers.DateField(allow_null=True)
    badges = VerificationBadgeSerializer(many=True)
    skill_evidence = serializers.DictField(child=serializers.ChoiceField(choices=STATES))
    overseas = serializers.BooleanField()
    mobile_waived = serializers.BooleanField()
    work_rights = serializers.ChoiceField(choices=[('', 'Not answered'), *WORK_RIGHTS_CHOICES], allow_blank=True)
    under_18 = serializers.BooleanField()
