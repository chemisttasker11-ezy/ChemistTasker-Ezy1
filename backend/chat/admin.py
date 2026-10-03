"""Django admin for the chat app (moved from client_profile/admin.py)."""
from django.contrib import admin
from chat.models import Message


admin.site.register(Message)
