from django.urls import path
from . import views
from .owner_views import ImportCommit, MyListings

urlpatterns = [
    path("me/access/", views.MyAccess.as_view()),
    path("me/listings/", MyListings.as_view()),
    path("pharmacies/<int:pharmacy_id>/approval/", views.PharmacyApproval.as_view()),
    path("pharmacies/<int:pharmacy_id>/grants/", views.PharmacyGrants.as_view()),
    path("pharmacies/<int:pharmacy_id>/grants/<int:pk>/revoke/", views.GrantRevoke.as_view()),
    path("catalogue/", views.Catalogue.as_view()),
    path("catalogue/lookup/", views.CatalogueLookup.as_view()),
    path("inventory/imports/", views.Imports.as_view()),
    path("inventory/imports/<int:pk>/", views.ImportDetail.as_view()),
    path("inventory/imports/<int:pk>/commit/", ImportCommit.as_view()),
    path("inventory/lots/", views.Lots.as_view()),
    path("inventory/lots/<int:pk>/", views.LotDetail.as_view()),
    path("inventory/lots/<int:pk>/reconcile/", views.LotReconcile.as_view()),
    path("listings/", views.Listings.as_view()),
    path("listings/<uuid:pk>/", views.ListingDetail.as_view()),
    path("listings/<uuid:pk>/requests/", views.ListingRequests.as_view()),
    path("listings/<uuid:pk>/<str:action>/", views.ListingAction.as_view()),
    path("transfers/", views.Transfers.as_view()),
    path("transfers/<uuid:pk>/", views.Transfers.as_view()),
    path("transfers/<uuid:pk>/messages/", views.TransferMessages.as_view()),
    path("transfers/<uuid:pk>/documents/", views.TransferDocument.as_view()),
    path("transfers/<uuid:pk>/documents/<int:document_id>/", views.TransferDocument.as_view()),
    path("transfers/<uuid:pk>/<str:action>/", views.TransferAction.as_view()),
]
