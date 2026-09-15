import type { ChatRoom, ChatMessage, ChatReaction, ChatUserLite } from "@chemisttasker/shared-core";

export type { ChatRoom, ChatMessage };
export type Reaction = ChatReaction;
export type UserLite = ChatUserLite;

export type CachedMember = {
  details: UserLite;
  role: string;
  employment_type: string;
  invited_name?: string;
  is_admin?: boolean;
};

export type MemberCache = Record<number, Record<number, CachedMember>>;

export type PharmacyRef = {
  id: number;
  name: string;
};
