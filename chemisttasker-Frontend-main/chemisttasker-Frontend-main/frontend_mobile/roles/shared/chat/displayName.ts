import type { ChatUserLite } from '@chemisttasker/shared-core';

export function displayNameFromUser(user?: Partial<ChatUserLite> | null): string {
  if (!user) return '';
  const first = (user as any).first_name || (user as any).firstName || '';
  const last = (user as any).last_name || (user as any).lastName || '';
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const name = (user as any).name || (user as any).username || '';
  if (name) return name;
  const email = (user as any).email || '';
  return email;
}
