from django.urls import path
from . import views

app_name = 'billing'

urlpatterns = [
    path('subscription/', views.current_subscription, name='current_subscription'),
    path('subscribe/', views.create_subscription_checkout, name='subscribe'),
    path('subscription/seats/', views.update_subscription_seats, name='update_subscription_seats'),
    path('charge-fulfillment/<int:shift_id>/', views.charge_shift_fulfillment, name='charge_fulfillment'),
    path('charge-fulfillment/<int:shift_id>/checkouts/<uuid:checkout_id>/expire/',
         views.expire_fulfillment_checkout, name='expire_fulfillment_checkout'),
    path('charge-fulfillment/<int:shift_id>/checkouts/<uuid:checkout_id>/resume/',
         views.resume_fulfillment_checkout, name='resume_fulfillment_checkout'),
    path('charge-penalty/<int:shift_id>/', views.charge_penalty, name='charge_penalty'),
    
    # Stripe Webhook
    path('webhook/', views.stripe_webhook, name='stripe_webhook'),
]
