import os, sys, json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','core.settings')
import django
django.setup()
from django.apps import apps
names='OtherStaffOnboarding ExplorerOnboarding PharmacyAdmin Chain ShiftSlot ShiftInterest ShiftSlotAssignment ShiftCounterOffer ShiftOffer LeaveRequest Invoice InvoiceLineItem ExplorerPost UserAvailability Conversation Participant Message Notification PharmacyHubComment PharmacyHubReaction PharmacyHubAttachment PharmacyHubPoll PharmacyHubPollOption PharmacyHubPollVote MarketplaceExchange MarketplaceMessage MarketplaceExchangeParticipant ListingDeliveryTerms MarketplaceImage MarketplaceReservation EthicalPharmacyApproval EthicalProfessionalAccess EthicalPharmacyGrant EthicalProduct EthicalStockLot EthicalListing EthicalListingLot EthicalTransfer EthicalTransferLine EthicalMessage'.split()
for name in names:
 m=next(m for m in apps.get_models() if m.__name__==name)
 print('\n'+m._meta.label)
 for f in m._meta.fields:
  if f.name in ['id','created_at','updated_at']:continue
  print(f.name, f.get_internal_type(), 'null' if f.null else '', 'blank' if f.blank else '', ('choices='+str(f.choices)) if f.choices else '', ('default='+str(f.default)) if f.has_default() else '')
