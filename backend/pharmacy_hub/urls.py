"""URL routes of the pharmacy_hub app. Mounted inside client_profile.urls, so public paths and the `client_profile:` route names are unchanged."""
from django.urls import path
from pharmacy_hub.views import (
    HubCommentReactionView,
    HubCommentViewSet,
    HubCommunityGroupViewSet,
    HubContextView,
    HubOrganizationProfileView,
    HubPharmacyProfileView,
    HubPollCommentViewSet,
    HubPollReactionView,
    HubPollViewSet,
    HubPostViewSet,
    HubReactionView,
)


hub_group_list = HubCommunityGroupViewSet.as_view({"get": "list", "post": "create"})
hub_group_detail = HubCommunityGroupViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
hub_post_list = HubPostViewSet.as_view({"get": "list", "post": "create"})
hub_post_detail = HubPostViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
hub_post_pin = HubPostViewSet.as_view({"post": "pin"})
hub_post_unpin = HubPostViewSet.as_view({"post": "unpin"})
hub_comment_list = HubCommentViewSet.as_view({"get": "list", "post": "create"})
hub_comment_detail = HubCommentViewSet.as_view(
    {"patch": "partial_update", "delete": "destroy"}
)
hub_poll_list = HubPollViewSet.as_view({"get": "list", "post": "create"})
hub_poll_detail = HubPollViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)
hub_poll_vote = HubPollViewSet.as_view({"post": "vote"})
hub_poll_comment_list = HubPollCommentViewSet.as_view({"get": "list", "post": "create"})
hub_poll_comment_detail = HubPollCommentViewSet.as_view(
    {"patch": "partial_update", "delete": "destroy"}
)

urlpatterns = [
    path('hub/context/', HubContextView.as_view(), name='hub-context'),
    path('hub/groups/', hub_group_list, name='hub-group-list'),
    path('hub/groups/<int:pk>/', hub_group_detail, name='hub-group-detail'),
    path('hub/posts/', hub_post_list, name='hub-post-list'),
    path('hub/posts/<int:pk>/', hub_post_detail, name='hub-post-detail'),
    path('hub/posts/<int:pk>/pin/', hub_post_pin, name='hub-post-pin'),
    path('hub/posts/<int:pk>/unpin/', hub_post_unpin, name='hub-post-unpin'),
    path('hub/polls/', hub_poll_list, name='hub-poll-list'),
    path('hub/polls/<int:pk>/', hub_poll_detail, name='hub-poll-detail'),
    path('hub/polls/<int:pk>/vote/', hub_poll_vote, name='hub-poll-vote'),
    path('hub/polls/<int:poll_pk>/comments/', hub_poll_comment_list, name='hub-poll-comment-list'),
    path('hub/polls/<int:poll_pk>/comments/<int:pk>/', hub_poll_comment_detail, name='hub-poll-comment-detail'),
    path('hub/polls/<int:poll_pk>/reactions/', HubPollReactionView.as_view(), name='hub-poll-reaction'),
    path('hub/posts/<int:post_pk>/comments/', hub_comment_list, name='hub-comment-list'),
    path(
            'hub/posts/<int:post_pk>/comments/<int:pk>/',
            hub_comment_detail,
            name='hub-comment-detail',
        ),
    path(
            'hub/posts/<int:post_pk>/comments/<int:comment_pk>/reactions/',
            HubCommentReactionView.as_view(),
            name='hub-comment-reaction',
        ),
    path(
            'hub/posts/<int:post_pk>/reactions/',
            HubReactionView.as_view(),
            name='hub-reaction',
        ),
    path(
            'hub/pharmacies/<int:pharmacy_pk>/profile/',
            HubPharmacyProfileView.as_view(),
            name='hub-pharmacy-profile',
        ),
    path(
            'hub/organizations/<int:organization_pk>/profile/',
            HubOrganizationProfileView.as_view(),
            name='hub-organization-profile',
        ),
]
