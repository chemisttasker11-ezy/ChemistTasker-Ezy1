import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from rest_framework.exceptions import ValidationError

from onboarding.models import AhpraCheck, OtherStaffOnboarding, PharmacistOnboarding
from onboarding.tasks import verify_ahpra_task
from onboarding.verification.ahpra_numbers import full_registration_number, guard_ahpra_number


class Command(BaseCommand):
    help = "Seed, report or reset the isolated local AHPRA e2e database."
    requires_system_checks = []

    def add_arguments(self, parser):
        commands = parser.add_subparsers(dest="action", required=True)
        commands.add_parser("seed").add_argument("--cases", required=True)
        commands.add_parser("report")
        commands.add_parser("reset")

    def handle(self, *args, **options):
        if (not settings.SETTINGS_MODULE.endswith("ahpra_e2e_settings")
                or settings.DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3"):
            raise CommandError("ahpra_e2e requires ahpra_e2e_settings and a sqlite3 default database")
        if options["action"] == "seed":
            self.seed(options["cases"])
        elif options["action"] == "report":
            self.report()
        else:
            with transaction.atomic():
                for model in (PharmacistOnboarding, OtherStaffOnboarding):
                    AhpraCheck.objects.filter(
                        model_name=model.__name__, object_pk__in=self.profiles(model).values("pk"),
                    ).delete()
                count, _ = get_user_model().objects.filter(email__iendswith="@example.invalid").delete()
            self.stdout.write(f"Reset: deleted {count} e2e objects.")

    def profiles(self, model):
        return model.objects.filter(user__email__iendswith="@example.invalid").select_related("user")

    def seed(self, path):
        try:
            cases = json.loads(Path(path).read_text(encoding="utf-8-sig"))
        except (OSError, ValueError) as exc:
            raise CommandError("Cannot read cases JSON file") from exc
        required = ("first_name", "last_name", "role", "registration_number")
        if not isinstance(cases, list):
            raise CommandError("Cases must be a JSON list")
        for index, case in enumerate(cases, 1):
            if (not isinstance(case, dict)
                    or any(not isinstance(case.get(key), str) or not case[key].strip() for key in required)
                    or case["role"] not in ("pharmacist", "intern")
                    or not full_registration_number(case["registration_number"])):
                raise CommandError(f"Invalid case {index}: expected names, pharmacist/intern role and valid registration_number")
        User = get_user_model()
        for index, case in enumerate(cases, 1):
            number = full_registration_number(case["registration_number"])
            pharmacist = case["role"] == "pharmacist"
            with transaction.atomic():
                n = index
                while User.objects.filter(email=f"ahpra-e2e-{n}@example.invalid").exists():
                    n += 1
                user = User.objects.create_user(
                    email=f"ahpra-e2e-{n}@example.invalid", first_name=case["first_name"],
                    last_name=case["last_name"], role="PHARMACIST" if pharmacist else "OTHER_STAFF",
                )
                model = PharmacistOnboarding if pharmacist else OtherStaffOnboarding
                profile = model.objects.create(user=user, **({} if pharmacist else {"role_type": "INTERN"}))
                try:
                    guard_ahpra_number(profile, number)
                except ValidationError:
                    transaction.set_rollback(True)
                    self.stdout.write(f"Case {index}: skipped (AHPRA ownership rules).")
                    continue
            verify_ahpra_task(model.__name__, profile.pk, profile.ahpra_number,
                              user.first_name, user.last_name, user.email)
            self.stdout.write(f"Case {index}: queued ({user.email}).")

    def report(self):
        self.stdout.write("number\tname\trole\tcheck status\tcheck outcome\tahpra_verified\tprofile note\tsupervised_practice")
        for model in (PharmacistOnboarding, OtherStaffOnboarding):
            for profile in self.profiles(model).order_by("pk"):
                check = AhpraCheck.objects.filter(model_name=model.__name__, object_pk=profile.pk).order_by("-pk").first()
                values = [profile.ahpra_number or "", profile.user.get_full_name(),
                          "pharmacist" if model == PharmacistOnboarding else (profile.role_type or "").lower(),
                          check.status if check else "-", check.outcome if check else "-",
                          profile.ahpra_verified, (profile.ahpra_verification_note or "")[:100],
                          (check.register_data or {}).get("supervised_practice", "-") if check else "-"]
                self.stdout.write("\t".join(str(value).replace("\n", " ").replace("\r", " ").replace("\t", " ") for value in values))
