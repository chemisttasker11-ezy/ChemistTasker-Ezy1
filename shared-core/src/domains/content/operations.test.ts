import { expect, it, vi } from 'vitest';
import { createContentOperations } from './operations';

it('owns the exact existing Content Workspace paths, verbs and bodies', async () => {
  const seen: unknown[] = [];
  const request = vi.fn(async (path: string, options?: {method?: string; body?: unknown}) => {
    seen.push({path, method: options?.method, body: options?.body});
    return { detail: 'ok' };
  });
  const sdk = createContentOperations({ contentManagement: {
    request: request as unknown as <T>(path: string, options?: { method?: string; body?: object }) => Promise<T>,
  } });
  const form = { title: 'Article' };
  const upload = new FormData();
  upload.set('file', new Blob(['bytes']), 'image.png');
  await sdk.currentUser();
  await sdk.documents('blog & news', 3);
  await sdk.saveDocument(null, {area:'news', payload:form});
  await sdk.saveDocument(7, {payload:form,version:2});
  await sdk.documentAction(7,'publish',{version:2,publish_at:'2026-10-21T04:00:00.000Z'});
  await sdk.uploadMedia(upload);
  await sdk.invitations(2);
  await sdk.teamMembers(1);
  await sdk.inviteContributor({email:'author@example.test',assignments:{blog:'writer'}});
  await sdk.resendInvitation(4);
  await sdk.revokeInvitation(5);
  await sdk.updateTeamMember(6,{assignments:{}});
  await sdk.reports();
  await sdk.moderateReport('talent_board',9,'hide');
  await sdk.acceptInvitation('token');
  expect(seen).toEqual([
    {path:'/content/me/',method:'GET',body:undefined},
    {path:'/content/documents/?area=blog%20%26%20news&page=3',method:'GET',body:undefined},
    {path:'/content/documents/',method:'POST',body:{area:'news',payload:form}},
    {path:'/content/documents/7/',method:'PATCH',body:{payload:form,version:2}},
    {path:'/content/documents/7/publish/',method:'POST',body:{version:2,publish_at:'2026-10-21T04:00:00.000Z'}},
    {path:'/content/media/',method:'POST',body:upload},
    {path:'/content/invitations/?page=2',method:'GET',body:undefined},
    {path:'/content/team/?page=1',method:'GET',body:undefined},
    {path:'/content/invitations/',method:'POST',body:{email:'author@example.test',assignments:{blog:'writer'}}},
    {path:'/content/invitations/4/resend/',method:'POST',body:{}},
    {path:'/content/invitations/5/revoke/',method:'POST',body:{}},
    {path:'/content/team/6/',method:'PUT',body:{assignments:{}}},
    {path:'/content/moderation/',method:'GET',body:undefined},
    {path:'/content/moderation/talent_board/9/',method:'POST',body:{action:'hide'}},
    {path:'/content/invitations/accept/',method:'POST',body:{token:'token'}},
  ]);
});
