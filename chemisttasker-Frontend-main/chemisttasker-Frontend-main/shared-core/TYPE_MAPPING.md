# Type Mapping Documentation

This document maps TypeScript types in `shared-core/src/types.ts` to Django serializers.

## Source: `backend/client_profile/serializers.py`

### Pharmacy Types (lines 2951-3025)

**Django Serializer Fields:**
```python
class PharmacySerializer(serializers.ModelSerializer):
    - id
    - name
    - street_address, suburb, state, postcode
    - phone_number, email
    - verified
    - organization, chain
    - file_url (generated)
    - hours (JSON)
    - rate_settings (JSON)
    - claim_metadata (JSON)
    - created_at, updated_at
```

**TypeScript Interface:**
```typescript
interface Pharmacy {
  id: number;
  name: string;
  street_address: string;
  suburb: string;
  state: string;
  postcode: string;
  phone_number?: string | null;
  email?: string | null;
  verified: boolean;
  organization?: number | null;
  chain?: number | null;
  file_url?: string | null;
  hours?: Record<string, any> | null;
  rate_settings?: Record<string, any> | null;
  claim_metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}
```

---

### Shift Types (lines 3537-3585)

**Django Serializer Fields:**
```python
class ShiftSerializer(serializers.ModelSerializer):
    - id
    - pharmacy, pharmacy_name
    - start_datetime, end_datetime
    - role, hourly_rate
    - status
    - description
    - applications_count
    - assigned_user
    - slot_data (JSON)
    - escalation_settings (JSON)
    - visibility_flags (JSON)
    - anonymized_pharmacy_details (JSON)
    - slot_assignments
    - single_user_only
    - created_at, updated_at
```

**TypeScript Interface:**
```typescript
interface Shift {
  id: number;
  pharmacy: number;
  pharmacy_name?: string;
  start_datetime: string;
  end_datetime: string;
  role: string;
  hourly_rate: string;
  status: ShiftStatus;
  description?: string | null;
  applications_count?: number;
  assigned_user?: number | null;
  slot_data?: Record<string, any> | null;
  escalation_settings?: Record<string, any> | null;
  visibility_flags?: Record<string, any> | null;
  anonymized_pharmacy_details?: Record<string, any> | null;
  slot_assignments?: any[];
  single_user_only?: boolean;
  created_at: string;
  updated_at: string;
}
```

---

### Hub Post Types (from `backend/client_profile/hub/api.py`)

**Django Serializer Fields:**
```python
class HubPostSerializer(serializers.ModelSerializer):
    - id
    - pharmacy, pharmacy_name
    - organization, organization_name
    - community_group, community_group_name
    - scope_type, scope_target_id
    - body
    - visibility ('NORMAL' | 'ANNOUNCEMENT')
    - allow_comments
    - created_at, updated_at, deleted_at
    - comment_count
    - reaction_summary (JSON)
    - viewer_reaction
    - can_manage
    - author (nested MembershipApi)
    - recent_comments (array)
    - attachments (array of AttachmentApi)
    - is_edited, is_pinned
    - pinned_at, pinned_by
    - original_body
    - edited_at, edited_by
    - viewer_is_admin
    - is_deleted
    - tagged_members (array)
```

**TypeScript Interface:**
```typescript
interface HubPost {
  id: number;
  pharmacy_id?: number | null;
  pharmacy_name?: string | null;
  organization_id?: number | null;
  organization_name?: string | null;
  community_group_id?: number | null;
  community_group_name?: string | null;
  scope_type: 'pharmacy' | 'group' | 'organization';
  scope_target_id?: number | null;
  body: string;
  visibility: 'NORMAL' | 'ANNOUNCEMENT';
  allow_comments: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  comment_count: number;
  reaction_summary: Record<string, number>;
  viewer_reaction?: string | null;
  can_manage: boolean;
  author: HubMembership;
  recent_comments: HubComment[];
  attachments: HubAttachment[];
  is_edited: boolean;
  is_pinned: boolean;
  pinned_at?: string | null;
  pinned_by?: HubUserSummary | null;
  original_body: string;
  edited_at?: string | null;
  edited_by?: HubUserSummary | null;
  viewer_is_admin: boolean;
  is_deleted: boolean;
  tagged_members: HubTaggedMember[];
}

interface HubAttachment {
  id: number;
  kind: 'IMAGE' | 'GIF' | 'FILE';
  url: string | null;
  filename: string | null;
  uploaded_at: string;
}

interface HubMembership {
  id: number;
  role: string;
  employment_type: string;
  job_title?: string | null;
  user: {
    id: number;
    first_name: string | null;
    last_name: string | null;
    email: string;
    profile_photo_url?: string | null;
  };
}

interface HubTaggedMember {
  membership_id: number;
  full_name: string;
  email: string | null;
  role: string | null;
  job_title?: string | null;
}
```

---

### Conversation/Room Types (from `backend/client_profile/views.py` lines 5854-6049)

**Django Serializer Fields:**
```python
class ConversationSerializer(serializers.ModelSerializer):
    - id
    - name
    - is_direct
    - participants (array of IDs)
    - unread_count
    - last_message_time
    - last_message
    - pinned
    - created_at
```

**TypeScript Interface:**
```typescript
interface Room {
  id: number;
  name?: string | null;
  is_direct: boolean;
  participants: number[];
  unread_count: number;
  last_message_time?: string | null;
  last_message?: string | null;
  pinned?: boolean;
  created_at: string;
}
```

---

## Validation Strategy

1. **Manual Review**: Compare each TypeScript interface against the corresponding Django serializer
2. **Runtime Validation**: Add Zod/Yup schemas for critical types
3. **OpenAPI Integration** (future): Generate types from OpenAPI spec if available
4. **Serializer Tests**: Backend tests should validate serializer output matches expected schema

## Missing Fields to Add

Based on serializer analysis, these fields should be added to types.ts:

### Pharmacy
- `file_url`, `hours`, `rate_settings`, `claim_metadata`

### Shift
- `slot_data`, `escalation_settings`, `visibility_flags`, `anonymized_pharmacy_details`, `slot_assignments`, `single_user_only`

### HubPost
- Full nested types for `author`, `attachments`, `tagged_members`
- Reaction and comment fields

### Room
- `pinned` field
