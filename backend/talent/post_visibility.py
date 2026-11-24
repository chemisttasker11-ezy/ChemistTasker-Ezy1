"""Who may see the author of an anonymous talent post."""

from django.db.models import Q

ANONYMOUS_NAME = "Anonymous candidate"


def _author_id(post):
    return post.author_user_id or getattr(post.explorer_profile, "user_id", None)


def reader_sees_author(post, user):
    """Named posts show their author to everyone; anonymous ones only to the author."""
    if not post.is_anonymous:
        return True
    return bool(user and user.is_authenticated and user.pk == _author_id(post))


def visible_profile_posts(queryset, user):
    """A profile's posts without other authors' anonymous ones, so they cannot be linked to the profile."""
    return queryset.filter(
        Q(is_anonymous=False)
        | Q(author_user=user)
        | Q(author_user__isnull=True, explorer_profile__user=user)
    )
