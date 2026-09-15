from django.urls import path, include
from users.browser_session import csrf_token

urlpatterns = [path('api/public-hub/', include('public_hub.urls')),
               path('api/content/', include('public_hub.content_urls')),
               path('api/users/csrf/', csrf_token)]
