"""Import reviewed, original launch guides without overwriting existing content."""
import json
from pathlib import Path
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from public_hub.editorial import audit, publish, validate_payload
from public_hub.models import Article, ContentDocument, ContentRevision
from public_hub.permissions import can_publish


class Command(BaseCommand):
    help = 'Import original editorial guides as drafts; --publish explicitly publishes them.'

    def add_arguments(self, parser):
        parser.add_argument('email')
        parser.add_argument('--publish', action='store_true')
        parser.add_argument('--site-url', default=settings.FRONTEND_BASE_URL)

    @transaction.atomic
    def handle(self, *args, **options):
        user = get_user_model().objects.filter(email__iexact=options['email']).first()
        if not user or not can_publish(user, 'blog'):
            raise CommandError('An existing verified blog publisher is required.')
        source = Path(__file__).resolve().parents[2] / 'editorial_content' / 'launch-guides.json'
        for guide in json.loads(source.read_text(encoding='utf-8')):
            payload = guide['payload']
            slug = payload['slug']
            if Article.objects.filter(slug=slug).exists() or ContentRevision.objects.filter(payload__slug=slug).exists():
                self.stdout.write(f'Already present: {slug}')
                continue
            payload['cover_url'] = options['site_url'].rstrip('/') + '/assets/' + guide['cover_asset']
            for node in payload['body_document']['content']:
                for text in node.get('content', []):
                    for mark in text.get('marks', []):
                        if mark.get('type') == 'link':
                            mark['attrs']['href'] = mark['attrs']['href'].replace('{site}', options['site_url'].rstrip('/'))
            payload = validate_payload('blog', payload)
            document = ContentDocument.objects.create(area='blog', created_by=user)
            revision = ContentRevision.objects.create(document=document, created_by=user, payload=payload, status='draft')
            audit(user, 'import_original_guide', document.pk, slug=slug, source_file=source.name)
            if options['publish']:
                publish(document, revision, user)
            self.stdout.write(f'{"Published" if options["publish"] else "Draft saved"}: {slug}')
