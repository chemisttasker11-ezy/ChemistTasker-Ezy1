# client_profile/urls.py
"""Routes owned by the client_profile kernel.

Project-level composition of promoted domain apps lives in
`core.api_v1_urls`. Keeping this module domain-local prevents
client_profile from becoming the owner of unrelated apps while preserving the
public `api_v1:` namespace at the project composition layer.
"""
from django.urls import path
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.include_root_view = False



urlpatterns = [
]
