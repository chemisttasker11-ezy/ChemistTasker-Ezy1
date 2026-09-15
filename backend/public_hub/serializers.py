from rest_framework import serializers
from .models import Article, Comment, Reaction


def public_name(user):
    # Never expose email addresses, usernames (which may be emails), or account roles.
    return (user.get_full_name().strip() or 'Community member') if user else 'Former member'


def reaction_summary(obj, user):
    reactions = list(obj.reactions.all())
    return {'counts': {kind: sum(r.kind == kind for r in reactions) for kind, _ in Reaction.KINDS},
            'mine': next((r.kind for r in reactions if user and user.is_authenticated and r.user_id == user.pk), None)}


class ArticleSerializer(serializers.ModelSerializer):
    comment_count = serializers.IntegerField(read_only=True)
    read_minutes = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = ['id', 'title', 'slug', 'kind', 'topic', 'excerpt', 'cover_url', 'cover_alt',
                  'source_name', 'source_url', 'author_name', 'published_at', 'updated_at',
                  'featured', 'comments_open', 'seo_title', 'seo_description', 'comment_count', 'read_minutes', 'reactions']

    def get_read_minutes(self, obj):
        return max(1, (len(obj.body.split()) + 199) // 200)

    def get_reactions(self, obj):
        return reaction_summary(obj, self.context['request'].user)


class ArticleDetailSerializer(ArticleSerializer):
    class Meta(ArticleSerializer.Meta):
        fields = ArticleSerializer.Meta.fields + ['body', 'body_document']


class CommentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    body = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()
    reply_count = serializers.IntegerField(read_only=True)
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ['id', 'parent', 'body', 'author_name', 'created_at', 'deleted', 'can_delete', 'reply_count', 'reactions']

    def get_author_name(self, obj):
        return 'Removed comment' if obj.deleted else public_name(obj.author)

    def get_body(self, obj):
        return '' if obj.deleted else obj.body

    def get_can_delete(self, obj):
        user = self.context['request'].user
        return not obj.deleted and user.is_authenticated and (user.pk == obj.author_id or user.has_perm('public_hub.delete_comment'))

    def get_reactions(self, obj):
        return reaction_summary(obj, self.context['request'].user) if not obj.deleted else {'counts': {}, 'mine': None}


class CommentInput(serializers.Serializer):
    body = serializers.CharField(max_length=3000, trim_whitespace=True)
    parent = serializers.IntegerField(min_value=1, required=False, allow_null=True)


class ReactionInput(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Reaction.KINDS)


class ReportInput(serializers.Serializer):
    reason = serializers.CharField(max_length=500, trim_whitespace=True)
