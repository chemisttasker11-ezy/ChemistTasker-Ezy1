from django.core.management.base import BaseCommand
from marketplace.models import MarketplaceCategory

ALL_PERSONAL=["OWNER","PHARMACIST","INTERN","TECHNICIAN","ASSISTANT","STUDENT","EXPLORER","CAREER_SWITCHER"]
PHARMACY_PROFESSIONALS=["OWNER","PHARMACIST","INTERN","TECHNICIAN","ASSISTANT","STUDENT"]
DEFS=[
{"slug":"books-study","name":"Books & study","description":"Reference books, textbooks and permitted study resources.","context":"BOTH","permitted_modes":["SELL","SWAP","FREE"],"maximum_buyer_roles":ALL_PERSONAL,"field_schema":{"allowed_seller_roles":ALL_PERSONAL}},
{"slug":"workwear","name":"Workwear","description":"Personally owned uniforms, white coats, suitable footwear and work bags.","context":"BOTH","permitted_modes":["SELL","SWAP","FREE"],"maximum_buyer_roles":ALL_PERSONAL,"field_schema":{"allowed_seller_roles":ALL_PERSONAL}},
{"slug":"office-tools","name":"Office & tools","description":"Furniture, stationery, calculators and approved non-clinical work tools.","context":"BOTH","permitted_modes":["SELL","SWAP","FREE"],"maximum_buyer_roles":PHARMACY_PROFESSIONALS,"field_schema":{"allowed_seller_roles":PHARMACY_PROFESSIONALS}},
{"slug":"pharmacy-fixtures","name":"Pharmacy fixtures","description":"Pharmacy-owned shelving, counters, gondolas, furniture, storage and display fittings.","context":"PHARMACY","permitted_modes":["SELL","SWAP","FREE"],"maximum_buyer_roles":["OWNER"],"field_schema":{"allowed_seller_roles":["OWNER"],"owner_authority_required":True}},
{"slug":"pharmacy-stock","name":"Ordinary pharmacy stock","description":"Approved non-medicine front-shop or business stock owned by the pharmacy.","context":"PHARMACY","permitted_modes":["SELL","SWAP","FREE"],"maximum_buyer_roles":["OWNER"],"field_schema":{"allowed_seller_roles":["OWNER"],"owner_authority_required":True,"medicine_forbidden":True}},
]
class Command(BaseCommand):
    help="Seed/update ordinary marketplace categories and seller-role policy."
    def handle(self,*args,**opts):
        for d in DEFS:
            slug=d["slug"]; defaults={**d,"policy_version":"2026-09-17","is_active":True,"is_medicine":False,"requires_review":True}; defaults.pop("slug")
            row,created=MarketplaceCategory.objects.update_or_create(slug=slug,defaults=defaults)
            self.stdout.write(self.style.SUCCESS(f"{'created' if created else 'updated'} {row.slug}"))
