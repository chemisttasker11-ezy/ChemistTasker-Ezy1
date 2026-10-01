"""Django admin for the ratings app (moved from client_profile/admin.py)."""
from django.contrib import admin
from ratings.models import Rating


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'direction',
        'rater_user',
        'ratee_user',
        'ratee_pharmacy',
        'stars',
        'updated_at',
    )
    list_filter = (
        'direction',
        'stars',
        'created_at',
        'updated_at',
    )
    search_fields = (
        'rater_user__email',
        'rater_user__username',
        'ratee_user__email',
        'ratee_user__username',
        'ratee_pharmacy__name',
        'comment',
    )
    autocomplete_fields = (
        'rater_user',
        'ratee_user',
        'ratee_pharmacy',
    )
    readonly_fields = (
        'created_at',
        'updated_at',
    )
    fieldsets = (
        (
            'Rating',
            {
                'fields': (
                    'direction',
                    'stars',
                    'comment',
                )
            },
        ),
        (
            'People',
            {
                'fields': (
                    'rater_user',
                    'ratee_user',
                    'ratee_pharmacy',
                )
            },
        ),
        (
            'Audit',
            {
                'fields': (
                    'created_at',
                    'updated_at',
                )
            },
        ),
    )
