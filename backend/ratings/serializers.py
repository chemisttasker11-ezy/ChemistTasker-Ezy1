"""Serializers for the ratings API."""
from rest_framework import serializers
from ratings.models import Rating


#  Ratings  
class RatingReadSerializer(serializers.ModelSerializer):
    rater_user_id = serializers.IntegerField(source="rater_user.id", read_only=True)
    ratee_user_id = serializers.IntegerField(source="ratee_user.id", read_only=True)
    ratee_pharmacy_id = serializers.IntegerField(source="ratee_pharmacy.id", read_only=True)

    class Meta:
        model = Rating
        fields = [
            "id", "direction", "stars", "comment",
            "rater_user_id", "ratee_user_id", "ratee_pharmacy_id",
            "created_at", "updated_at",
        ]
        read_only_fields = fields


class RatingWriteSerializer(serializers.ModelSerializer):
    """
    Upsert semantics: if a rating already exists for (direction, rater, target),
    we update stars/comment; otherwise we create it.
    rater_user is taken from request.user in the view.
    """
    class Meta:
        model = Rating
        fields = ["direction", "ratee_user", "ratee_pharmacy", "stars", "comment"]

    def validate(self, attrs):
        direction = attrs.get("direction")
        ratee_user = attrs.get("ratee_user")
        ratee_pharmacy = attrs.get("ratee_pharmacy")

        if direction == Rating.Direction.OWNER_TO_WORKER:
            if not ratee_user or ratee_pharmacy is not None:
                raise serializers.ValidationError("OWNER_TO_WORKER requires ratee_user and no ratee_pharmacy.")
        elif direction == Rating.Direction.WORKER_TO_PHARMACY:
            if not ratee_pharmacy or ratee_user is not None:
                raise serializers.ValidationError("WORKER_TO_PHARMACY requires ratee_pharmacy and no ratee_user.")
        else:
            raise serializers.ValidationError({"direction": "Unknown direction."})

        stars = attrs.get("stars")
        if stars is None or not (1 <= int(stars) <= 5):
            raise serializers.ValidationError({"stars": "Stars must be between 1 and 5."})
        return attrs


class RatingSummarySerializer(serializers.Serializer):
    """
    Read-only aggregate: average + count for a target.
    Used by GET /ratings/summary?target_type=...&target_id=...
    """
    average = serializers.FloatField()
    count = serializers.IntegerField()


class MyRatingSerializer(serializers.Serializer):
    """
    Read-only: current user's rating (if any) on a target.
    Used by GET /ratings/mine?target_type=...&target_id=...
    """
    id = serializers.IntegerField(allow_null=True)
    direction = serializers.CharField()
    stars = serializers.IntegerField(allow_null=True)
    comment = serializers.CharField(allow_blank=True, allow_null=True)


class PendingRatingsSerializer(serializers.Serializer):
    """
    Read-only: IDs the user can still rate.
    Used by GET /ratings/pending
    """
    workers_to_rate = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)
    pharmacies_to_rate = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)
