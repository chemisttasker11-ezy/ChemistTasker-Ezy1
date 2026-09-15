"""Local harness only. Production continues to use the existing users/login endpoint."""
from django.contrib import admin
from django.urls import include, path
from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView


class LocalLoginSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop('username', None)
        self.fields['email'] = serializers.EmailField()

    def validate(self, attrs):
        user = get_user_model().objects.filter(email=attrs['email']).first()
        return super().validate({'username': user.username if user else '', 'password': attrs['password']})


class LocalLogin(TokenObtainPairView):
    serializer_class = LocalLoginSerializer


urlpatterns = [path('api/public-hub/', include('public_hub.urls')),
               path('api/users/login/', LocalLogin.as_view()),
               path('api/users/token/refresh/', TokenRefreshView.as_view()),
               path('admin/', admin.site.urls)]
