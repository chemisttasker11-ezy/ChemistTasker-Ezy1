"""Talent-owned cleanup for account deletion and newcomer conversion."""
from django.db.models import Q
from talent.models import ExplorerPost


def delete_user_posts(user):
    return ExplorerPost.objects.filter(Q(author_user=user) | Q(explorer_profile__user=user)).delete()


def remove_newcomer_posts(user):
    selection = (Q(explorer_profile__user=user)
                 | Q(author_user=user, role_category__in=('EXPLORER', ''))
                 | Q(author_user=user, role_category__isnull=True))
    return ExplorerPost.objects.filter(selection).delete()
