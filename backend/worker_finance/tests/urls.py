from django.urls import include, path
from worker_finance import legacy
urlpatterns = [
    path('api/client-profile/finance/', include('worker_finance.urls')),
    path('api/client-profile/invoices/<int:pk>/', legacy.detail),
]
