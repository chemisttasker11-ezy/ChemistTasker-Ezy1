from django.urls import include, path
from worker_finance import legacy
urlpatterns = [
    path('api/v1/finance/', include('worker_finance.urls')),
    path('api/v1/invoices/<int:pk>/', legacy.detail),
]
