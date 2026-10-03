"""The referees tab of the pharmacist, other-staff and explorer onboarding: two referees, locked once confirmed,
reset when edited, required on submit, e-mailed on submit."""
from rest_framework import serializers

from users.normalization import normalize_email as clean_email


def apply_referees_tab(instance, vdata: dict, submit: bool):
    """
    Two referees are required on submit.
    Required per referee: name, relation, workplace, email.
    If referee is already confirmed -> ignore edits (lock).
    On change for a pending referee -> reset confirmed/rejected + last_sent.
    On submit -> send referee emails (no final-eval). Scheduling happens in utils.
    """
    from onboarding.emails import send_referee_emails
    update_fields = []

    def apply_ref(idx: int):
        prefix = f"referee{idx}_"
        locked = bool(getattr(instance, f"{prefix}confirmed", False))

        incoming = {
            'name': vdata.get(f"{prefix}name", getattr(instance, f"{prefix}name")),
            'relation': vdata.get(f"{prefix}relation", getattr(instance, f"{prefix}relation")),
            'email': clean_email(vdata.get(f"{prefix}email", getattr(instance, f"{prefix}email"))),
            'workplace': vdata.get(f"{prefix}workplace", getattr(instance, f"{prefix}workplace")),
        }

        if locked:
            return

        changed = False
        for key in ['name', 'relation', 'email', 'workplace']:
            field = f"{prefix}{key}"
            if field in vdata and getattr(instance, field) != incoming[key]:
                setattr(instance, field, incoming[key])
                update_fields.append(field)
                changed = True

        if changed:
            if getattr(instance, f"{prefix}confirmed", False):
                setattr(instance, f"{prefix}confirmed", False)
                update_fields.append(f"{prefix}confirmed")
            if getattr(instance, f"{prefix}rejected", False):
                setattr(instance, f"{prefix}rejected", False)
                update_fields.append(f"{prefix}rejected")
            if getattr(instance, f"{prefix}last_sent", None) is not None:
                setattr(instance, f"{prefix}last_sent", None)
                update_fields.append(f"{prefix}last_sent")

    apply_ref(1)
    apply_ref(2)

    if submit:
        errors = {}
        for idx in [1, 2]:
            prefix = f"referee{idx}_"
            name = getattr(instance, f"{prefix}name")
            relation = getattr(instance, f"{prefix}relation")
            email = getattr(instance, f"{prefix}email")
            workplace = getattr(instance, f"{prefix}workplace")
            if not name:
                errors[prefix + 'name'] = ['Required.']
            if not relation:
                errors[prefix + 'relation'] = ['Required.']
            if not email:
                errors[prefix + 'email'] = ['Required.']
            if not workplace:
                errors[prefix + 'workplace'] = ['Required.']
        if errors:
            raise serializers.ValidationError(errors)

        if not instance.verified:
            instance.verified = False
            update_fields.append('verified')

    if update_fields:
        instance.save(update_fields=list(set(update_fields)))

    if submit:
        send_referee_emails(instance, is_reminder=False)  # schedules per-ref inside
    return instance
