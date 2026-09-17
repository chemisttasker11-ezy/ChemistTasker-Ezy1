from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import CustomerViewSet, ItemViewSet, InvoiceViewSet, ExpenseViewSet, receipt_download, calculate_hours, bas_worksheet

router = DefaultRouter()
router.register('customers', CustomerViewSet, basename='finance-customer')
router.register('items', ItemViewSet, basename='finance-item')
router.register('invoices', InvoiceViewSet, basename='finance-invoice')
router.register('expenses', ExpenseViewSet, basename='finance-expense')
urlpatterns = [
    path('', include(router.urls)),
    path('receipts/<int:pk>/download/', receipt_download, name='finance-receipt'),
    path('shift-hours/', calculate_hours, name='finance-shift-hours'),
    path('bas-worksheet/', bas_worksheet, name='finance-bas-worksheet'),
]
