"""Explicitly local fixtures: this command refuses all production settings."""
from datetime import timedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from public_hub.models import Article, Comment


class Command(BaseCommand):
    help = 'Seed sample articles and test users in the isolated public_hub.test_settings database only.'

    def handle(self, *args, **options):
        if settings.SETTINGS_MODULE != 'public_hub.test_settings' or not settings.DEBUG:
            raise CommandError('Preview fixtures are only allowed with public_hub.test_settings.')
        user, _ = get_user_model().objects.get_or_create(username='hub-preview', defaults={'email': 'reader@example.test', 'first_name': 'Alex', 'last_name': 'Preview'})
        user.set_password('Local-preview-2026!')
        user.save()
        editor, _ = get_user_model().objects.get_or_create(username='hub-editor', defaults={'email': 'editor@example.test', 'first_name': 'Editorial', 'last_name': 'Preview', 'is_staff': True, 'is_superuser': True})
        editor.set_password('Local-editor-2026!')
        editor.save()
        entries = [
            ('blog', 'practice', 'a-better-pharmacy-handover', 'A better handover starts with a better conversation.', 'Small habits that help your team share context, find clarity, and start the next shift with confidence.', True),
            ('blog', 'career', 'your-next-pharmacy-chapter', 'Making room for your next pharmacy chapter.', 'A moment to reflect on the work you enjoy, the skills you want to grow, and the possibilities ahead.', False),
            ('blog', 'practice', 'first-day-new-pharmacy', 'The little things that make a first day easier.', 'A practical conversation starter for welcoming a new colleague into your pharmacy team.', False),
            ('blog', 'community', 'sharing-what-works', 'Good ideas are better when we share them.', 'What has made your working day a little smoother? There is room for every perspective here.', False),
            ('blog', 'career', 'learning-in-everyday-work', 'Finding space to learn in everyday work.', 'Thoughtful questions and shared experience can make room for learning alongside a busy roster.', False),
            ('news', 'tga', 'reading-regulatory-updates', 'Keeping pharmacy updates in perspective.', 'A local sample of how a sourced regulatory update and its community discussion will appear.', True),
            ('news', 'career', 'career-news-conversations', 'New possibilities. A shared conversation.', 'A local example of the career announcements and learning opportunities your team can publish.', False),
            ('news', 'industry', 'industry-news-in-context', 'Making space for the bigger pharmacy picture.', 'A sample industry news story, with room for the original source and thoughtful professional discussion.', False),
            ('news', 'community', 'welcome-to-public-hub', 'Your voice belongs in the public hub.', 'A local preview of the space for pharmacy people to read, reflect, and connect.', False),
        ]
        for index, (kind, topic, slug, title, excerpt, featured) in enumerate(entries):
            body = ('This is sample content for the local design and functionality preview. It is not a published news report, regulatory update, or clinical recommendation.\n\n'
                    '## A little clarity goes a long way\n\n' + excerpt + '\n\n'
                    'Every pharmacy brings together people with different experiences. A useful conversation starts by making space for that experience and asking a clear question.\n\n'
                    '## Start with the conversation\n\nBefore the next handover, think about the context another person would find helpful. What is already understood? What still needs a conversation? Keep shared notes concise and avoid including private patient information in public discussions.\n\n'
                    '## Share your perspective\n\nWhat has worked in your team? Use the discussion below to try posting a comment, replying to a colleague, or adding a reaction. These actions are stored only in the local preview database.')
            article, _ = Article.objects.get_or_create(slug=slug, defaults={'title': title, 'kind': kind, 'topic': topic, 'excerpt': excerpt,
                'body': body, 'featured': featured, 'author_name': 'ChemistTasker Preview', 'status': 'published', 'published_at': timezone.now() - timedelta(days=index + 1), 'created_by': editor})
            if featured:
                root, _ = Comment.objects.get_or_create(article=article, author=user, parent=None, defaults={'body': 'Local preview: What helps your team keep a handover clear and useful?'})
                Comment.objects.get_or_create(article=article, author=editor, parent=root, defaults={'body': 'Local preview reply: A shared question is a good place to start. Try adding your own perspective below.'})
        self.stdout.write(self.style.SUCCESS('Local preview ready. Reader: reader@example.test / Local-preview-2026!'))
        self.stdout.write('Local admin: hub-editor / Local-editor-2026! (isolated test harness only)')
