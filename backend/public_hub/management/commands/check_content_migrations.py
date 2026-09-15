from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Fail deployment early when the platform migration sources are missing.'

    def handle(self, *args, **kwargs):
        missing = [name for name in ['users', 'client_profile', 'billing']
                   if not list((Path(settings.BASE_DIR) / name / 'migrations').glob('[0-9]*.py'))]
        if missing:
            raise CommandError('Recover the deployed migration files before deployment: ' + ', '.join(missing) + '. Do not regenerate or fake the production baseline.')
        from django.db.migrations.loader import MigrationLoader
        from django.db import connection
        loader = MigrationLoader(connection)
        loader.check_consistent_history(connection)
        self.stdout.write('Migration sources and applied graph are consistent. Rehearse schema changes on staging before cutover.')
