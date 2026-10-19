from django.urls import path
from onboarding.consumers import AhpraVerifierConsumer

websocket_urlpatterns = [path('ws/ahpra-verifier/', AhpraVerifierConsumer.as_asgi())]
