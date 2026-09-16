from django.urls import path
from . import views

urlpatterns = [
    path("categories/", views.Categories.as_view()),
    path("listings/", views.Listings.as_view()),
    path("listings/<uuid:pk>/", views.ListingDetail.as_view()),
    path("me/access/", views.MyAccess.as_view()),
    path("me/listings/", views.MyListings.as_view()),
    path("listings/<uuid:pk>/eligibility/", views.ListingEligibility.as_view()),
    path("listings/<uuid:pk>/audience/", views.ListingAudience.as_view()),
    path("listings/<uuid:pk>/images/", views.ListingImages.as_view()),
    path("listings/<uuid:pk>/enquiries/", views.Enquiries.as_view()),
    path("listings/<uuid:pk>/internal-transfers/", views.InternalTransfers.as_view()),
    path("listings/<uuid:pk>/<str:action>/", views.ListingAction.as_view()),
    path("images/<int:pk>/", views.ImageDetail.as_view()),
    path("me/exchanges/", views.Exchanges.as_view()),
    path("exchanges/<uuid:pk>/", views.ExchangeDetail.as_view()),
    path("exchanges/<uuid:pk>/messages/", views.ExchangeMessages.as_view()),
    path("exchanges/<uuid:pk>/<str:action>/", views.ExchangeAction.as_view()),
    path("saved/<uuid:pk>/", views.Saved.as_view()),
    path("reports/", views.Reports.as_view()),
    path("internal-transfers/<int:pk>/<str:action>/", views.InternalTransferAction.as_view()),
    path("catalogue/lookup/", views.CatalogueLookup.as_view()),
]
