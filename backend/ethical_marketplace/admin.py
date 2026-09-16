from django.contrib import admin

from .models import (EthicalAuditEvent, EthicalJurisdictionPolicy, EthicalPharmacyApproval,
                     EthicalProfessionalAccess, EthicalProduct)

admin.site.register((EthicalPharmacyApproval, EthicalProfessionalAccess, EthicalJurisdictionPolicy, EthicalProduct, EthicalAuditEvent))
