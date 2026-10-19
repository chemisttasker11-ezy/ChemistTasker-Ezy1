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


class AhpraStateSerializer(serializers.Serializer):
    state = serializers.ChoiceField(choices=('ok', 'pending', 'suspended', 'not_found', 'unreadable', 'rejected', 'type_not_accepted'))
    attempts = serializers.IntegerField(default=0)
    contact_support = serializers.BooleanField(default=False)
    frozen = serializers.BooleanField(default=False)
    registration_status = serializers.CharField(allow_null=True)
    registration_type = serializers.CharField(allow_null=True)
    expiry_date = serializers.DateField(allow_null=True)
    note = serializers.CharField(allow_blank=True)
    checked_at = serializers.DateTimeField(allow_null=True)
    recheck_available_at = serializers.DateTimeField(allow_null=True)

    def to_representation(self, instance):
        from onboarding.verification.state import ahpra_frozen, ahpra_state, member_suspension_note
        if isinstance(instance, dict):
            return super().to_representation(instance)
        state = ahpra_state(instance)
        frozen = ahpra_frozen(instance.user, state)
        if state['state'] == 'suspended' and not frozen and str(instance.user.role).upper() != 'OWNER':
            state['note'] = member_suspension_note(state['registration_status'])
        return {**state, 'frozen': frozen}


class VerificationSummarySerializer(serializers.Serializer):
    ahpra = AhpraStateSerializer()
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
