export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ApiPage<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type PublicContentKind = 'blog' | 'news';

export interface ReactionSummary {
  counts: Record<string, number>;
  mine: string | null;
}

export interface PublicArticle {
  id: number;
  title: string;
  slug: string;
  kind: PublicContentKind;
  topic: string;
  excerpt: string;
  cover_url: string;
  cover_alt: string;
  source_name: string;
  source_url: string;
  author_name: string;
  published_at: string;
  updated_at: string;
  featured: boolean;
  comments_open: boolean;
  seo_title: string;
  seo_description: string;
  comment_count: number;
  read_minutes: number;
  reactions: ReactionSummary;
}

export interface PublicArticleDetail extends PublicArticle {
  body: string;
  body_document: JsonValue | null;
}

export interface PublicArticleComment {
  id: number;
  parent: number | null;
  body: string;
  author_name: string;
  created_at: string;
  deleted: boolean;
  can_delete: boolean;
  reply_count: number;
  reactions: ReactionSummary;
}

export interface PublicHubSummary {
  key: string;
  label: string;
  can_interact: boolean;
}

export interface PublicHubAttachment {
  id: number;
  kind: string;
  name: string;
  content_type: string;
  url: string;
}

export interface PublicHubPost {
  id: number;
  platform_hub: string;
  body: string;
  created_at: string;
  updated_at: string;
  allow_comments: boolean;
  is_pinned: boolean;
  author_name: string;
  attachments: PublicHubAttachment[];
  comment_count: number;
  reactions: Record<string, number>;
  can_interact: boolean;
  can_edit: boolean;
  editorial: { title: string; body_document: JsonValue } | null;
}

export interface PublicHubComment {
  id: number;
  body: string;
  parent_comment: number | null;
  created_at: string;
  author_name: string;
  can_edit: boolean;
  reactions: Record<string, number>;
}

export interface PublicHubPollOption {
  id: number;
  text: string;
  votes: number;
}

export interface PublicHubPoll {
  id: number;
  question: string;
  created_at: string;
  can_interact: boolean;
  is_closed: boolean;
  options: PublicHubPollOption[];
}

export type ContentResponsibility = 'writer' | 'publisher';
export type ContentAssignments = Record<string, ContentResponsibility>;

export interface ContentMe {
  user_id: number;
  name: string;
  administrator: boolean;
  areas: ContentAssignments;
  area_labels: Record<string, string>;
}

export interface ContentPayload {
  title: string;
  slug: string;
  excerpt: string;
  topic: string;
  body_document: JsonValue;
  author_name: string;
  cover_url: string;
  cover_alt: string;
  source_name: string;
  source_url: string;
  seo_title: string;
  seo_description: string;
  featured: boolean;
  comments_open: boolean;
}

export interface ContentRevision {
  id: number;
  payload: ContentPayload;
  status: 'draft' | 'submitted' | 'scheduled' | 'published' | 'superseded';
  version: number;
  publish_at: string | null;
  feedback: string;
}

export interface ContentDocument {
  id: number;
  area: string;
  archived: boolean;
  created_by: number;
  article_id: number | null;
  hub_post_id: number | null;
  revision: ContentRevision | null;
}

export interface ContentInvitation {
  id: number;
  email: string;
  assignments: ContentAssignments;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export interface ContentTeamMember {
  id: number;
  email: string;
  name: string;
  assignments: ContentAssignments;
}

export interface ContentModerationItem {
  id: number;
  type: 'article' | 'hub';
  area: string;
  reason: string;
  body: string;
}

export interface ContentAuditItem {
  id: number;
  action: string;
  target: string;
  details: Record<string, JsonValue>;
  created_at: string;
}

export interface DetailResponse {
  detail: string;
}

