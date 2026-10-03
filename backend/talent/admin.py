"""Django admin for the talent app (moved from client_profile/admin.py)."""
from django.contrib import admin
from talent.models import ExplorerPost


admin.site.register(ExplorerPost)
