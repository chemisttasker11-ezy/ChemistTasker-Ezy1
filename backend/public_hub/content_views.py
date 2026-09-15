import hashlib
import secrets
import uuid
from datetime import timedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from .editorial import audit, publish, validate_payload
from .models import (ContentAdministrator, ContentAssignment, ContentAudit, ContentDocument,
                     ContentInvitation, ContentRevision, Report, Comment, CommunityReport)
from .permissions import AREAS, ContentAccess, ContentAdmin, VerifiedMember, capabilities, can_publish
from .views import DiscussionThrottle


def check_keys(data, allowed):
    extra = set(data) - set(allowed)
    if extra:
        raise ValidationError({key: 'This field cannot be set here.' for key in extra})


def document_data(document):
    working = document.revisions.filter(status__in=['draft', 'submitted', 'scheduled']).first()
    revision = working or document.revisions.first()
    return {'id': document.pk, 'area': document.area, 'archived': document.archived,
            'created_by': document.created_by_id, 'article_id': document.article_id,
            'hub_post_id': document.hub_post_id,
            'revision': None if not revision else {'id': revision.pk, 'payload': revision.payload,
                'status': revision.status, 'version': revision.version, 'publish_at': revision.publish_at,
                'feedback': revision.feedback}}


def accessible(user):
    grants = capabilities(user)['areas']
    from django.db.models import Q
    publishers = [area for area, role in grants.items() if role == 'publisher']
    writers = [area for area, role in grants.items() if role == 'writer']
    return ContentDocument.objects.filter(Q(area__in=publishers) | Q(area__in=writers, created_by=user))


class ContentView(APIView):
    permission_classes = [ContentAccess]
    throttle_classes = [DiscussionThrottle]


class ContentMe(APIView):
    permission_classes = [VerifiedMember]

    def get(self, request):
        return Response({'user_id': request.user.pk, 'name': request.user.get_full_name(), **capabilities(request.user), 'area_labels': AREAS})


class Documents(ContentView):
    def get(self, request):
        from .views import HubPagination
        pagination = HubPagination()
        queryset = accessible(request.user).prefetch_related('revisions').order_by('-updated_at')
        if request.query_params.get('area'):
            queryset = queryset.filter(area=request.query_params['area'])
        rows = pagination.paginate_queryset(queryset, request, view=self)
        return pagination.get_paginated_response([document_data(doc) for doc in rows])

    @transaction.atomic
    def post(self, request):
        check_keys(request.data, ['area', 'payload'])
        area = request.data.get('area')
        if area not in capabilities(request.user)['areas']:
            raise PermissionDenied('Writing access is required for this area.')
        payload = validate_payload(area, request.data.get('payload', {}))
        doc = ContentDocument.objects.create(area=area, created_by=request.user)
        ContentRevision.objects.create(document=doc, payload=payload, status='draft', created_by=request.user)
        audit(request.user, 'create_draft', doc.pk, area=area)
        return Response(document_data(doc), status=201)


class DocumentDetail(ContentView):
    def get(self, request, pk):
        return Response(document_data(get_object_or_404(accessible(request.user), pk=pk)))

    @transaction.atomic
    def patch(self, request, pk):
        check_keys(request.data, ['payload', 'version'])
        doc = get_object_or_404(accessible(request.user).select_for_update(), pk=pk)
        revision = doc.revisions.first()
        if not revision or request.data.get('version') != revision.version:
            return Response({'detail': 'This draft changed. Reload before saving.'}, status=409)
        if revision.status in {'submitted', 'scheduled'}:
            raise ValidationError('Return this revision to draft before editing.')
        payload = validate_payload(doc.area, request.data.get('payload', {}))
        if doc.article_id and payload.get('slug') != doc.article.slug:
            raise ValidationError({'slug': 'Published URLs cannot change.'})
        if revision.status in {'published', 'superseded'}:
            revision = ContentRevision.objects.create(document=doc, payload=payload, status='draft', created_by=request.user, version=revision.version + 1)
        else:
            revision.payload = payload
            revision.version += 1
            revision.save()
        doc.save()
        audit(request.user, 'save_revision', doc.pk, revision=revision.pk)
        return Response(document_data(doc))


class DocumentAction(ContentView):
    @transaction.atomic
    def post(self, request, pk, action):
        check_keys(request.data, ['version', 'publish_at', 'feedback'])
        doc = get_object_or_404(accessible(request.user).select_for_update(), pk=pk)
        rev = doc.revisions.first()
        if not rev or request.data.get('version') != rev.version:
            return Response({'detail': 'This revision changed. Reload before continuing.'}, status=409)
        if action not in {'submit', 'return', 'publish', 'archive'}:
            raise ValidationError('Unknown editorial action.')
        if action != 'submit' and not can_publish(request.user, doc.area):
            raise PermissionDenied('Publisher access is required.')
        if action == 'submit':
            if rev.status != 'draft':
                raise ValidationError('Only drafts can be submitted.')
            rev.status = 'submitted'
        elif action == 'return':
            if rev.status not in {'submitted', 'scheduled'}:
                raise ValidationError('Only submitted or scheduled revisions can return to draft.')
            rev.status, rev.feedback = 'draft', str(request.data.get('feedback', ''))[:3000]
            rev.publish_at = None
        elif action == 'publish':
            if rev.status not in {'draft', 'submitted'}:
                raise ValidationError('Only drafts or submitted revisions can be approved.')
            when = serializers.DateTimeField(allow_null=True).run_validation(request.data.get('publish_at'))
            if when and when > timezone.now():
                rev.status, rev.publish_at, rev.approved_by = 'scheduled', when, request.user
            else:
                publish(doc, rev, request.user)
                return Response(document_data(doc))
        elif action == 'archive':
            if doc.article_id:
                doc.article.status = 'archived'
                doc.article.save(update_fields=['status', 'updated_at'])
            if doc.hub_post_id:
                from client_profile.models import PharmacyHubPost
                PharmacyHubPost.objects.filter(pk=doc.hub_post_id, platform_hub=doc.area.removeprefix('hub:')).update(deleted_at=timezone.now())
            doc.archived = True
            if rev.status == 'scheduled':
                rev.status, rev.publish_at = 'draft', None
        rev.version += 1
        rev.save()
        doc.save()
        audit(request.user, action, doc.pk, revision=rev.pk)
        return Response(document_data(doc))


def assignment_input(value):
    if not isinstance(value, dict) or not value:
        raise ValidationError('Choose at least one publishing responsibility.')
    if any(area not in AREAS or role not in {'writer', 'publisher'} for area, role in value.items()):
        raise ValidationError('Invalid area or responsibility.')
    return value


def send_invitation(invitation, immediate=False):
    from core.task_queue import async_task
    token = secrets.token_urlsafe(32)
    invitation.token_hash = hashlib.sha256(token.encode()).hexdigest()
    invitation.expires_at = timezone.now() + timedelta(days=7)
    invitation.save()
    url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/content/invite/{token}"
    message = dict(subject='Your ChemistTasker publishing invitation', recipient_list=[invitation.email],
        template_name='emails/content_invitation.html', text_template='emails/content_invitation.txt',
        context={'accept_url': url})
    def deliver():
        if immediate:
            from users.tasks import send_email_now
            send_email_now(**message)
        else:
            async_task('users.tasks.send_async_email', **message, suppress_auto_notification=True)
    transaction.on_commit(deliver)


class Invitations(ContentView):
    permission_classes = [ContentAdmin]

    def get(self, request):
        from .views import HubPagination
        pager = HubPagination()
        rows = pager.paginate_queryset(ContentInvitation.objects.order_by('-id'), request, view=self)
        return pager.get_paginated_response([{'id': i.pk, 'email': i.email, 'assignments': i.assignments,
            'expires_at': i.expires_at, 'accepted_at': i.accepted_at, 'revoked_at': i.revoked_at} for i in rows])

    @transaction.atomic
    def post(self, request):
        check_keys(request.data, ['email', 'assignments'])
        email = serializers.EmailField().run_validation(request.data.get('email')).lower()
        grants = assignment_input(request.data.get('assignments'))
        ContentInvitation.objects.filter(email__iexact=email, accepted_at=None, revoked_at=None).update(revoked_at=timezone.now())
        invitation = ContentInvitation(email=email, assignments=grants, invited_by=request.user)
        send_invitation(invitation)
        audit(request.user, 'invite', invitation.pk, areas=grants)
        return Response({'id': invitation.pk, 'detail': 'Invitation queued.'}, status=201)


class InvitationAction(ContentView):
    permission_classes = [ContentAdmin]

    @transaction.atomic
    def post(self, request, pk, action):
        invitation = get_object_or_404(ContentInvitation.objects.select_for_update(), pk=pk)
        if invitation.accepted_at:
            raise ValidationError('This invitation has already been accepted.')
        if action == 'revoke':
            invitation.revoked_at = timezone.now()
            invitation.save()
        elif action == 'resend' and not invitation.revoked_at:
            send_invitation(invitation)
        else:
            raise ValidationError('This invitation cannot be resent.')
        audit(request.user, f'invitation_{action}', pk)
        return Response({'detail': 'Invitation updated.'})


class AcceptInvitation(APIView):
    permission_classes = [VerifiedMember]
    throttle_classes = [DiscussionThrottle]

    @transaction.atomic
    def post(self, request):
        token = serializers.CharField(max_length=100).run_validation(request.data.get('token'))
        invitation = get_object_or_404(ContentInvitation.objects.select_for_update(), token_hash=hashlib.sha256(token.encode()).hexdigest(), accepted_at=None, revoked_at=None, expires_at__gt=timezone.now())
        if request.user.email.casefold() != invitation.email.casefold():
            raise PermissionDenied('Sign in with the email address that received this invitation.')
        if invitation.bootstrap_administrator:
            ContentAdministrator.objects.update_or_create(user=request.user, defaults={'active': True})
        for area, role in invitation.assignments.items():
            ContentAssignment.objects.update_or_create(user=request.user, area=area, defaults={'role': role})
        invitation.accepted_at = timezone.now()
        invitation.save()
        audit(request.user, 'accept_invitation', invitation.pk)
        return Response({'detail': 'Your publishing access is ready.', **capabilities(request.user)})


class Team(ContentView):
    permission_classes = [ContentAdmin]

    def get(self, request):
        users = get_user_model().objects.filter(content_assignments__isnull=False).distinct().order_by('id')
        from .views import HubPagination
        pager = HubPagination()
        rows = pager.paginate_queryset(users, request, view=self)
        return pager.get_paginated_response([{'id': u.pk, 'email': u.email, 'name': u.get_full_name(), 'assignments': dict(u.content_assignments.values_list('area', 'role'))} for u in rows])

    @transaction.atomic
    def put(self, request, pk):
        check_keys(request.data, ['assignments'])
        user = get_object_or_404(get_user_model().objects.select_for_update(), pk=pk)
        grants = request.data.get('assignments')
        if grants != {}:
            grants = assignment_input(grants)
        ContentAssignment.objects.filter(user=user).delete()
        ContentAssignment.objects.bulk_create([ContentAssignment(user=user, area=a, role=r) for a, r in grants.items()])
        audit(request.user, 'assignments_changed', pk, assignments=grants)
        return Response({'detail': 'Responsibilities updated.'})


class Media(ContentView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        from django.core.files.storage import default_storage
        from PIL import Image, UnidentifiedImageError
        upload = request.FILES.get('file')
        if not upload or upload.size > 5 * 1024 * 1024:
            raise ValidationError('Upload an image no larger than 5 MB.')
        try:
            image = Image.open(upload)
            if image.format not in {'JPEG', 'PNG', 'WEBP'} or image.width * image.height > 25000000:
                raise ValidationError('Use a JPEG, PNG, or WebP image up to 25 megapixels.')
            extension = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}[image.format]
            image.verify()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise ValidationError('The image is invalid.')
        upload.seek(0)
        path = default_storage.save(f'public_content/{uuid.uuid4().hex}.{extension}', upload)
        from .models import ContentMedia
        media = ContentMedia.objects.create(file=path, uploaded_by=request.user)
        audit(request.user, 'upload_media', media.pk)
        return Response({'url': f'{settings.FRONTEND_BASE_URL.rstrip("/")}/api/hub/media/{media.pk}/'}, status=201)


class AuditLog(ContentView):
    permission_classes = [ContentAdmin]

    def get(self, request):
        from .views import HubPagination
        pager = HubPagination()
        rows = pager.paginate_queryset(ContentAudit.objects.order_by('-id'), request, view=self)
        return pager.get_paginated_response([{'id': row.pk, 'action': row.action, 'target': row.target, 'details': row.details, 'created_at': row.created_at} for row in rows])


class Moderation(ContentView):
    def get(self, request):
        from client_profile.models import PharmacyHubPost
        areas = [area for area, role in capabilities(request.user)['areas'].items() if role == 'publisher']
        result = [{'id': r.pk, 'type': 'article', 'area': r.comment.article.kind,
                   'reason': r.reason, 'body': r.comment.body}
                  for r in Report.objects.filter(resolved=False, comment__article__kind__in=areas).select_related('comment__article').order_by('created_at')[:100]]
        hubs = [area.removeprefix('hub:') for area in areas if area.startswith('hub:')]
        eligible = PharmacyHubPost.objects.filter(platform_hub__in=hubs, pharmacy=None, organization=None, community_group=None)
        for report in CommunityReport.objects.filter(resolved=False, post_id__in=eligible.values('pk')).order_by('created_at')[:100]:
            post = eligible.get(pk=report.post_id)
            comment = post.comments.filter(pk=report.comment_id).first() if report.comment_id else None
            result.append({'id': report.pk, 'type': 'hub', 'area': f'hub:{post.platform_hub}',
                           'reason': report.reason, 'body': comment.body if comment else post.body})
        return Response(result)

    @transaction.atomic
    def post(self, request, kind, pk):
        action = request.data.get('action')
        if action not in {'resolve', 'hide'}:
            raise ValidationError('Choose resolve or hide.')
        if kind == 'article':
            report = get_object_or_404(Report.objects.select_for_update(), pk=pk)
            area = report.comment.article.kind
            if not can_publish(request.user, area):
                raise PermissionDenied('Publisher access is required.')
            if action == 'hide':
                report.comment.hidden = True
                report.comment.save(update_fields=['hidden', 'updated_at'])
        elif kind == 'hub':
            from client_profile.models import PharmacyHubPost
            report = get_object_or_404(CommunityReport.objects.select_for_update(), pk=pk)
            post = get_object_or_404(PharmacyHubPost, pk=report.post_id, pharmacy=None, organization=None, community_group=None, platform_hub__isnull=False)
            area = f'hub:{post.platform_hub}'
            if not can_publish(request.user, area):
                raise PermissionDenied('Publisher access is required.')
            if action == 'hide':
                if report.comment_id:
                    get_object_or_404(post.comments, pk=report.comment_id).soft_delete()
                    post.recompute_comment_count()
                else:
                    post.soft_delete()
        else:
            raise ValidationError('Unknown report type.')
        report.resolved = True
        report.save(update_fields=['resolved'])
        audit(request.user, f'moderation_{action}', f'{kind}:{pk}', area=area)
        return Response({'detail': 'Report resolved.'})
