from django.urls import path
from . import content_views as v

urlpatterns = [
    path('moderation/', v.Moderation.as_view()),
    path('moderation/<str:kind>/<int:pk>/', v.Moderation.as_view()),
    path('me/', v.ContentMe.as_view()),
    path('documents/', v.Documents.as_view()),
    path('documents/<int:pk>/', v.DocumentDetail.as_view()),
    path('documents/<int:pk>/<str:action>/', v.DocumentAction.as_view()),
    path('invitations/', v.Invitations.as_view()),
    path('invitations/accept/', v.AcceptInvitation.as_view()),
    path('invitations/<int:pk>/<str:action>/', v.InvitationAction.as_view()),
    path('team/', v.Team.as_view()),
    path('team/<int:pk>/', v.Team.as_view()),
    path('media/', v.Media.as_view()),
    path('audit/', v.AuditLog.as_view()),
]
