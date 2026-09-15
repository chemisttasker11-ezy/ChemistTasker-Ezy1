from django.urls import path
from . import views
from . import community
from .sitemap import Sitemap
from .media import MediaFile

app_name = 'public_hub'
urlpatterns = [
    path('media/<uuid:pk>/', MediaFile.as_view()),
    path('sitemap/', Sitemap.as_view()),
    path('community/', community.Hubs.as_view()),
    path('community/<slug:hub>/posts/', community.PostList.as_view()),
    path('community/<slug:hub>/polls/', community.PollList.as_view()),
    path('posts/<int:pk>/', community.PostDetail.as_view()),
    path('posts/<int:pk>/comments/', community.CommentList.as_view()),
    path('posts/<int:pk>/report/', community.ReportPost.as_view()),
    path('attachments/<int:pk>/', community.Attachment.as_view()),
    path('me/', views.MemberView.as_view()),
    path('articles/', views.ArticleList.as_view()),
    path('articles/<slug:slug>/', views.ArticleDetail.as_view()),
    path('articles/<slug:slug>/comments/', views.CommentList.as_view()),
    path('articles/<slug:slug>/reaction/', views.ReactionView.as_view()),
    path('comments/<int:pk>/', views.CommentDelete.as_view()),
    path('comments/<int:pk>/reaction/', views.ReactionView.as_view()),
    path('comments/<int:pk>/report/', views.CommentReport.as_view()),
]
