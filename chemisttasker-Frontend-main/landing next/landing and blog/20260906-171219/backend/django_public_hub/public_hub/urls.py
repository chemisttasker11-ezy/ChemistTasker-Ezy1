from django.urls import path
from . import views

app_name = 'public_hub'
urlpatterns = [
    path('me/', views.MemberView.as_view()),
    path('articles/', views.ArticleList.as_view()),
    path('articles/<slug:slug>/', views.ArticleDetail.as_view()),
    path('articles/<slug:slug>/comments/', views.CommentList.as_view()),
    path('articles/<slug:slug>/reaction/', views.ReactionView.as_view()),
    path('comments/<int:pk>/', views.CommentDelete.as_view()),
    path('comments/<int:pk>/reaction/', views.ReactionView.as_view()),
    path('comments/<int:pk>/report/', views.CommentReport.as_view()),
]
