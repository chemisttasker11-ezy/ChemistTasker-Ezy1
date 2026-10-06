from django.urls import path, include
from users.browser_session import csrf_token

urlpatterns = [path('api/v1/public-hub/', include('public_hub.urls')),
               path('api/v1/content/', include('public_hub.content_urls')),
               path('api/v1/users/csrf/', csrf_token)]
