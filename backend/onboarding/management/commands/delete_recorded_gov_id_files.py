from django.core.management.base import BaseCommand

from onboarding.services.gov_id import purge_recorded_gov_id_files


class Command(BaseCommand):
    help = "Count government ID files with recorded results. Use --apply to delete them."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        candidates, deleted, failed = purge_recorded_gov_id_files(apply=options["apply"])
        self.stdout.write(f"Candidates: {candidates}, deleted: {deleted}, failed: {failed}")
