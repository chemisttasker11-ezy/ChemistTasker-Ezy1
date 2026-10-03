"""Hub alerts: telling a post's author about comments and reactions, with a link back to the post."""
from urllib.parse import urlencode
from notifications.services import notify_users


def _get_user_display_name(user):
    if not user:
        return "A user"
    full_name = user.get_full_name().strip() if hasattr(user, "get_full_name") else ""
    return full_name or getattr(user, "username", "") or getattr(user, "email", "") or "A user"


def _build_hub_post_action_params(post):
    params = {"post": post.id}
    if post.platform_hub:
        params.update(
            {
                "scope": "platform",
                "platform_hub": post.platform_hub,
            }
        )
    elif post.community_group_id:
        params.update(
            {
                "scope": "group",
                "group_id": post.community_group_id,
            }
        )
    elif post.organization_id:
        params.update(
            {
                "scope": "organization",
                "organization_id": post.organization_id,
            }
        )
    elif post.pharmacy_id:
        params.update(
            {
                "scope": "pharmacy",
                "pharmacy_id": post.pharmacy_id,
            }
        )
    return params


def _build_hub_post_action_url(post):
    return f"/dashboard/pharmacy-hub?{urlencode(_build_hub_post_action_params(post))}"


def _notify_hub_post_owner(*, post, actor_user, title, body="", payload=None):
    post_author = getattr(getattr(post, "author_membership", None), "user", None)
    if not post_author:
        post_author = getattr(post, "author_user", None)
    if not post_author or not post_author.is_active:
        return
    if actor_user and post_author.id == actor_user.id:
        return
    final_payload = {
        "post_id": post.id,
        **(payload or {}),
    }
    notify_users(
        [post_author.id],
        title=title,
        body=body,
        notification_type="alert",
        action_url=_build_hub_post_action_url(post),
        payload=final_payload,
    )
