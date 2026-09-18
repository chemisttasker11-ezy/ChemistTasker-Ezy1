from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.loader import MigrationLoader
from marketplace.models import MarketplaceCategory

REQUIRED_CATEGORY_SLUGS={"books-study","workwear","office-tools","pharmacy-fixtures","pharmacy-stock"}

class Command(BaseCommand):
    help="Fail closed when marketplace deployment prerequisites are missing."
    def handle(self,*args,**options):
        loader=MigrationLoader(connection,ignore_no_migrations=True)
        missing=[]
        for app_label in ("marketplace","ethical_marketplace"):
            if not any(app==app_label for app,_name in loader.disk_migrations): missing.append(app_label)
        if missing:
            raise CommandError("Missing committed migration history for: "+", ".join(missing)+". Recover/reconcile migration files against the target PostgreSQL ledger before deployment.")
        executor=MigrationExecutor(connection); pending=executor.migration_plan(executor.loader.graph.leaf_nodes())
        if pending:
            raise CommandError("Pending database migrations: "+", ".join(f"{m.app_label}.{m.name}" for m,_ in pending))
        present=set(MarketplaceCategory.objects.filter(is_active=True).values_list("slug",flat=True)); missing_categories=REQUIRED_CATEGORY_SLUGS-present
        if missing_categories: raise CommandError("Marketplace categories not seeded: "+", ".join(sorted(missing_categories)))
        self.stdout.write(self.style.SUCCESS("Marketplace migration/category release gate passed."))
        flags = (
            "MARKETPLACE_READ_ENABLED", "MARKETPLACE_NEW_LISTINGS_ENABLED", "MARKETPLACE_CONTACT_ENABLED",
            "MARKETPLACE_NEW_COMMITMENTS_ENABLED", "MARKETPLACE_ESCALATION_ENABLED",
            "ETHICAL_PRIVATE_READ_ENABLED", "ETHICAL_INVENTORY_ENABLED", "ETHICAL_NEW_TRANSFERS_ENABLED",
            "ETHICAL_ESCALATION_ENABLED", "ETHICAL_S8_ENABLED",
        )
        for name in flags:
            self.stdout.write(f"{name}={getattr(settings, name)}")
