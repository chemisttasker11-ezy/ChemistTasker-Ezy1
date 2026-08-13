/**
 * Shared-Core Type Definitions
 * Contains both raw API types (snake_case with Api suffix) and domain types (camelCase)
 */

// ============ TYPE UTILITIES ============

export type Primitive = string | number | boolean | null | undefined | symbol | bigint;

export type SnakeToCamelCase<S extends string> =
    S extends `${infer Head}_${infer Tail}`
    ? `${Lowercase<Head>}${Capitalize<SnakeToCamelCase<Tail>>}`
    : S;

export type CamelCasedPropertiesDeep<T> =
    T extends Primitive | Date | File | Blob | FormData
    ? T
    : T extends Array<infer U>
    ? Array<CamelCasedPropertiesDeep<U>>
    : {
        [K in keyof T as K extends string ? SnakeToCamelCase<K> : K]: CamelCasedPropertiesDeep<T[K]>;
    };

// ============ HUB - RAW API TYPES (snake_case) ============

export interface UserSummaryApi {
    id: number;
    username?: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    profile_photo_url?: string | null;
}

export interface MembershipApi {
    id: number;
    role: string;
    employment_type: string;
    job_title?: string | null;
    user_details: {
        id: number;
        username?: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string;
        profile_photo_url?: string | null;
    };
}

export interface AttachmentApi {
    id: number;
    kind: "IMAGE" | "GIF" | "FILE";
    url: string | null;
    filename: string | null;
    uploaded_at: string;
}

export interface CommentApi {
    id: number;
    post: number;
    body: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    can_edit: boolean;
    parent_comment: number | null;
    author: MembershipApi;
    is_edited: boolean;
    original_body: string;
    edited_at: string | null;
    edited_by: UserSummaryApi | null;
    is_deleted: boolean;
    reaction_summary?: Record<string, number>;
    viewer_reaction?: string | null;
}

export interface HubPostApi {
    id: number;
    pharmacy: number | null;
    pharmacy_name: string | null;
    community_group: number | null;
    community_group_name: string | null;
    organization: number | null;
    organization_name: string | null;
    scope_type: "pharmacy" | "group" | "organization";
    scope_target_id: number | null;
    body: string;
    visibility: "NORMAL" | "ANNOUNCEMENT";
    allow_comments: boolean;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    comment_count: number;
    reaction_summary: Record<string, number>;
    viewer_reaction: string | null;
    can_manage: boolean;
    author: MembershipApi;
    recent_comments: CommentApi[];
    attachments: AttachmentApi[];
    is_edited: boolean;
    is_pinned: boolean;
    pinned_at: string | null;
    pinned_by: UserSummaryApi | null;
    original_body: string;
    edited_at: string | null;
    edited_by: UserSummaryApi | null;
    viewer_is_admin: boolean;
    is_deleted: boolean;
    tagged_members: TaggedMemberApi[];
}

export interface TaggedMemberApi {
    membership_id: number;
    full_name: string;
    email: string | null;
    role: string | null;
    job_title?: string | null;
}

export interface PillRewardRuleApi {
    id: number;
    code: string;
    name: string;
    description: string;
    event_type: "EARN" | "SPEND";
    audience: "ANY" | "SHIFT_POSTER" | "WORKER";
    pill_amount: number;
    is_active: boolean;
    starts_at: string | null;
    ends_at: string | null;
    metadata: Record<string, unknown>;
}

export interface PillBalanceApi {
    balance: number;
    shift_post_cost: number;
}

export interface PillReferralCodeApi {
    code: string;
    is_active: boolean;
    created_at: string;
}

export interface PillReferralEventApi {
    id: number;
    referral_code: string;
    referral_type: "FRIEND" | "SHIFT";
    status: "PENDING" | "CLAIMED" | "AWARDED" | "CANCELLED";
    referrer_email: string;
    referred_user_email?: string | null;
    referred_email: string;
    shift_id?: number | null;
    claimed_at?: string | null;
    awarded_at?: string | null;
    created_at: string;
}

export interface PillLedgerEntryApi {
    id: number;
    entry_type: "EARN" | "SPEND" | "ADJUSTMENT" | "REVERSAL";
    source: "FRIEND_REFERRAL" | "SHIFT_REFERRAL" | "SHIFT_POST" | "PAYMENT_CREDIT" | "MANUAL";
    delta: number;
    balance_after: number;
    description: string;
    rule_code?: string | null;
    referral_type?: string | null;
    shift_id?: number | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface PollOptionApi {
    id: number;
    label: string;
    vote_count: number;
    percentage: number;
    position: number;
}

export interface HubPollApi {
    id: number;
    question: string;
    pharmacy: number | null;
    organization: number | null;
    community_group: number | null;
    platform_hub?: string | null;
    scope_type: "pharmacy" | "group" | "organization" | null;
    scope_target_id: number | string | null;
    author?: MembershipApi | null;
    created_by?: MembershipApi | null;
    created_at: string;
    updated_at: string;
    closes_at: string | null;
    is_closed: boolean;
    options: PollOptionApi[];
    total_votes: number;
    has_voted: boolean;
    selected_option_id: number | null;
    can_vote: boolean;
    can_manage?: boolean;
    comment_count?: number;
    reaction_summary?: Record<string, number>;
    viewer_reaction?: string | null;
    recent_comments?: PollCommentApi[];
}

export interface GroupMemberApi {
    membership_id: number;
    member: MembershipApi;
    is_admin: boolean;
    joined_at: string;
    pharmacy_id?: number | null;
    pharmacy_name?: string | null;
    job_title?: string | null;
}

export interface HubGroupApi {
    id: number;
    pharmacy: number;
    pharmacy_name: string;
    organization_id: number | null;
    name: string;
    description: string | null;
    member_count: number;
    is_admin: boolean;
    is_member: boolean;
    is_creator?: boolean;
    members?: GroupMemberApi[];
}

export interface PharmacyContextApi {
    id: number;
    name: string;
    about: string | null;
    cover_image: string | null;
    cover_image_url: string | null;
    organization_id: number | null;
    organization_name: string | null;
    can_manage_profile: boolean;
    can_create_group: boolean;
    can_create_post: boolean;
}

export interface OrganizationContextApi {
    id: number;
    name: string;
    about: string | null;
    cover_image: string | null;
    cover_image_url: string | null;
    can_manage_profile: boolean;
    is_org_admin?: boolean;
    member_count?: number;
}

export interface HubContextApi {
    pharmacies: PharmacyContextApi[];
    organizations: OrganizationContextApi[];
    community_groups: HubGroupApi[];
    organization_groups: HubGroupApi[];
    chemisttasker_hubs?: HubChemistTaskerHubApi[];
    default_pharmacy_id: number | null;
    default_organization_id: number | null;
}

export interface PollCommentApi {
    id: number;
    poll: number;
    body: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    can_edit: boolean;
    author: MembershipApi;
    is_edited: boolean;
    original_body: string;
    edited_at: string | null;
    edited_by: UserSummaryApi | null;
    is_deleted: boolean;
}

export interface HubChemistTaskerHubApi {
    key: string;
    label: string;
    audience_type: string;
}

// ============ HUB - DOMAIN TYPES (camelCase) ============

export type HubReactionType =
    | "LIKE"
    | "CELEBRATE"
    | "SUPPORT"
    | "INSIGHTFUL"
    | "LOVE";

export type HubUserSummary = {
    id: number;
    username?: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    profilePhotoUrl?: string | null;
};

export type HubAttachment = {
    id: number;
    kind: "IMAGE" | "GIF" | "FILE";
    url: string | null;
    filename: string | null;
    uploadedAt: string;
};

export type HubMembership = {
    id: number;
    role: string;
    employmentType: string;
    jobTitle?: string | null;
    userDetails: {
        id: number;
        username?: string | null;
        firstName: string | null;
        lastName: string | null;
        email: string;
        profilePhotoUrl?: string | null;
    };
    user: HubUserSummary;
};

export type HubComment = {
    id: number;
    postId: number;
    body: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    canEdit: boolean;
    parentCommentId: number | null;
    author: HubMembership;
    isEdited: boolean;
    originalBody: string;
    editedAt: string | null;
    editedBy: HubUserSummary | null;
    isDeleted: boolean;
    reactionSummary?: Record<string, number>;
    viewerReaction: HubReactionType | null;
};

export type HubPost = {
    id: number;
    pharmacyId: number | null;
    pharmacyName: string | null;
    communityGroupId: number | null;
    communityGroupName: string | null;
    organizationId: number | null;
    organizationName: string | null;
    platformHub: string | null;
    scopeType: HubScopeType;
    scopeTargetId: number | string | null;
    body: string;
    visibility: "NORMAL" | "ANNOUNCEMENT";
    allowComments: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    commentCount: number;
    reactionSummary: Record<string, number>;
    viewerReaction: HubReactionType | null;
    author: HubMembership;
    recentComments: HubComment[];
    attachments: HubAttachment[];
    isEdited: boolean;
    isPinned: boolean;
    pinnedAt: string | null;
    pinnedBy: HubUserSummary | null;
    originalBody: string;
    editedAt: string | null;
    editedBy: HubUserSummary | null;
    viewerIsAdmin: boolean;
    isDeleted: boolean;
    taggedMembers: HubTaggedMember[];
    canManage: boolean;
};

export type HubPollOption = {
    id: number;
    label: string;
    voteCount: number;
    percentage: number;
    position: number;
};

export type HubPoll = {
    id: number;
    question: string;
    pharmacyId: number | null;
    organizationId: number | null;
    communityGroupId: number | null;
    platformHub: string | null;
    scopeType: HubScopeType;
    options: HubPollOption[];
    totalVotes: number;
    hasVoted: boolean;
    selectedOptionId: number | null;
    canVote: boolean;
    canManage?: boolean;
    author: HubMembership;
    commentCount: number;
    reactionSummary: Record<string, number>;
    viewerReaction: HubReactionType | null;
    recentComments: HubComment[];
    createdAt: string;
    updatedAt: string;
    closesAt: string | null;
    isClosed: boolean;
};

export type HubPharmacy = {
    id: number;
    name: string;
    about: string | null;
    coverImageUrl: string | null;
    organizationId: number | null;
    organizationName: string | null;
    canManageProfile: boolean;
    canCreateGroup: boolean;
    canCreatePost: boolean;
};

export type HubOrganization = {
    id: number;
    name: string;
    about: string | null;
    coverImageUrl: string | null;
    canManageProfile: boolean;
    isOrgAdmin?: boolean;
};

export type HubGroup = {
    id: number;
    pharmacyId: number;
    pharmacyName: string;
    organizationId: number | null;
    name: string;
    description: string | null;
    memberCount: number;
    isAdmin: boolean;
    isMember: boolean;
    isCreator?: boolean;
    members?: HubGroupMember[];
};

export type HubContext = {
    pharmacies: HubPharmacy[];
    organizations: HubOrganization[];
    communityGroups: HubGroup[];
    organizationGroups: HubGroup[];
    chemisttaskerHubs: HubChemistTaskerHub[];
    defaultPharmacyId: number | null;
    defaultOrganizationId: number | null;
};

export type HubChemistTaskerHub = {
    key: string;
    label: string;
    audienceType: string;
};

export type HubScopeType = "pharmacy" | "group" | "organization" | "platform";

export type HubScopeSelection = {
    type: HubScopeType;
    id: number | string;
};

export type HubTaggedMember = {
    membershipId: number;
    fullName: string;
    email: string | null;
    role: string | null;
    jobTitle: string | null;
};

export type HubGroupMember = {
    membershipId: number;
    member: HubMembership;
    isAdmin: boolean;
    joinedAt: string;
    pharmacyId?: number | null;
    pharmacyName?: string | null;
    jobTitle?: string | null;
};

export type HubGroupMemberOption = {
    membershipId: number;
    userId: number | null;
    fullName: string;
    email: string | null;
    role: string;
    employmentType: string | null;
    pharmacyId: number | null;
    pharmacyName: string | null;
    jobTitle: string | null;
    profilePhotoUrl: string | null;
};

// ============ HUB - PAYLOAD TYPES ============

export type HubPollPayload = {
    question: string;
    options: string[];
};

export type HubPostPayload = {
    body: string;
    visibility?: HubPost["visibility"];
    allowComments?: boolean;
    attachments?: File[];
    removeAttachmentIds?: number[];
    taggedMemberIds?: number[];
};

export type HubCommentPayload = {
    body: string;
    parentComment?: number | null;
};

export type HubGroupPayload = {
    pharmacyId: number;
    name: string;
    organizationId?: number | null;
    description?: string | null;
    memberIds?: number[];
};

export type HubProfilePayload = {
    about?: string | null;
    coverImage?: File | null;
};

// ============ COMMON TYPES ============

export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

// ============ EXPLORER / TALENT POSTS ============

export interface ExplorerPostApi {
    id: number;
    explorer_profile?: number | null;
    author_user_id?: number | null;
    headline: string;
    body: string;
    role_category?: "EXPLORER" | "PHARMACIST" | "OTHER_STAFF" | null;
    role_title?: string | null;
    work_types?: Array<"FULL_TIME" | "PART_TIME" | "CASUAL" | "VOLUNTEERING" | "PLACEMENT"> | null;
    post_kind?: "FULL_TIME_APPLICATION" | "AVAILABILITY" | null;
    coverage_radius_km?: number | null;
    open_to_travel?: boolean;
    travel_states?: string[] | null;
    ahpra_years_since_first_registration?: number | null;
    years_experience?: string | null;
    availability_mode?: "FULL_TIME_NOTICE" | "PART_TIME_DAYS" | "CASUAL_CALENDAR" | null;
    availability_summary?: string | null;
    availability_days?: Array<string | number | Record<string, unknown>> | null;
    availability_notice?: string | null;
    location_suburb?: string | null;
    location_state?: string | null;
    location_postcode?: string | null;
    skills?: string[] | null;
    software?: string[] | null;
    reference_code?: string | null;
    is_anonymous?: boolean;
    view_count: number;
    like_count: number;
    reply_count?: number;
    created_at: string;
    updated_at: string;
    explorer_name?: string | null;
    explorer_user_id?: number | null;
    explorer_role_type?: string | null;
    is_liked_by_me?: boolean;
}

export type ExplorerPost = CamelCasedPropertiesDeep<ExplorerPostApi>;

export interface ExplorerPostPayload {
    explorer_profile?: number | null;
    headline?: string | null;
    body?: string | null;
    role_category?: "EXPLORER" | "PHARMACIST" | "OTHER_STAFF" | null;
    role_title?: string | null;
    work_types?: Array<"FULL_TIME" | "PART_TIME" | "CASUAL" | "VOLUNTEERING" | "PLACEMENT"> | null;
    post_kind?: "FULL_TIME_APPLICATION" | "AVAILABILITY" | null;
    coverage_radius_km?: number | null;
    open_to_travel?: boolean;
    availability_mode?: "FULL_TIME_NOTICE" | "PART_TIME_DAYS" | "CASUAL_CALENDAR" | null;
    availability_summary?: string | null;
    availability_days?: Array<string | number | Record<string, unknown>> | null;
    availability_notice?: string | null;
    location_suburb?: string | null;
    location_state?: string | null;
    location_postcode?: string | null;
    skills?: string[] | null;
    software?: string[] | null;
    reference_code?: string | null;
    is_anonymous?: boolean;
}

// ============ OTHER DOMAIN TYPES ============

export interface Pharmacy {
    id: number;
    name: string;
    street_address: string;
    suburb: string;
    state: string;
    postcode: string;
    verified: boolean;
}

export type ShiftStatus =
    | "OPEN"
    | "FILLED"
    | "CANCELLED"
    | "COMPLETED"
    | "CONFIRMED"
    | "PENDING"
    | (string & {});

export type EscalationLevelKey =
    | "FULL_PART_TIME"
    | "LOCUM_CASUAL"
    | "OWNER_CHAIN"
    | "ORG_CHAIN"
    | "PLATFORM"
    | (string & {});

export interface RatePreferenceApi {
    weekday: string;
    saturday: string;
    sunday: string;
    public_holiday: string;
    early_morning: string;
    late_night: string;
}

export interface ShiftPayBandsApi {
    min_hourly_rate?: string | null;
    max_hourly_rate?: string | null;
    min_annual_salary?: string | null;
    max_annual_salary?: string | null;
    super_percent?: string | null;
}

export interface ShiftSlotApi {
    id: number;
    date: string;
    start_time: string;
    end_time: string;
    rate?: string | number | null;
    start_hour?: number | null;
    is_recurring?: boolean;
    recurring_days?: number[];
    recurring_end_date?: string | null;
    timezone?: string | null;
    duration_minutes?: number | null;
}

export interface ShiftUserApi {
    id: number;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone_number?: string | null;
    short_bio?: string | null;
    resume?: string | null;
    rate_preference?: RatePreferenceApi | null;
}

export type ShiftUser = CamelCasedPropertiesDeep<ShiftUserApi>;

export interface ShiftAssignmentApi {
    slot_id: number;
    user_id: number;
    slot?: ShiftSlotApi | null;
    user?: ShiftUserApi | null;
}

export interface ShiftPharmacyDetailApi {
    id: number;
    name: string;
    street_address?: string | null;
    suburb?: string | null;
    postcode?: string | null;
    state?: string | null;
    phone_number?: string | null;
    email?: string | null;
    methadone_s8_protocols?: string | null;
    qld_sump_docs?: string | null;
    sops?: string | null;
    induction_guides?: string | null;
    claim_status?: string | null;
    organization?: { id: number; name?: string | null } | number | null;
    owner?: {
        id: number;
        user?: {
            id: number;
            email?: string | null;
            first_name?: string | null;
            last_name?: string | null;
        } | null;
    } | null;
}

export interface ShiftMemberStatusApi {
    user_id: number;
    name: string;
    employment_type: string;
    role: string;
    status: "no_response" | "interested" | "rejected" | "accepted";
    is_member: boolean;
    membership_id?: number;
    pharmacy_id?: number | null;
    pharmacy_name?: string | null;
    organization_id?: number | null;
    organization_name?: string | null;
    visibility_level?: string | null;
    average_rating?: number | null;
    rating?: number | null;
    user_first_name?: string | null;
    user_last_name?: string | null;
}

export interface ShiftInterestApi {
    id: number;
    shift: number;
    slot: number | null;
    slot_time?: string | null;
    user_id?: number;
    revealed?: boolean;
    user?: ShiftUserApi | string | null;
    user_name?: string | null;
    user_first_name?: string | null;
    user_last_name?: string | null;
    average_rating?: number | null;
    rating?: number | null;
}

export interface ShiftShareLinkApi {
    url: string;
    token: string;
    expires_at: string | null;
    share_token?: string | null;
}

export interface ShiftRatingSummaryApi {
    average: number;
    count: number;
}

export interface ShiftRatingCommentApi {
    id: number;
    comment: string | null;
    stars: number;
    created_at?: string | null;
    user?: ShiftUserApi | null;
}

export interface ShiftApi {
    id: number;
    role_needed: string;
    role_label?: string | null;
    employment_type?: string | null;
    description?: string | null;
    pharmacy?: number | null;
    pharmacy_id?: number | null;
    pharmacy_name?: string | null;
    pharmacy_detail?: ShiftPharmacyDetailApi | null;
    organization_id?: number | null;
    organization_name?: string | null;
    visibility: EscalationLevelKey;
    escalation_level?: number;
    allowed_escalation_levels?: EscalationLevelKey[];
    escalate_to_locum_casual?: string | null;
    escalate_to_owner_chain?: string | null;
    escalate_to_org_chain?: string | null;
    escalate_to_platform?: string | null;
    slots?: ShiftSlotApi[];
    slot_assignments?: ShiftAssignmentApi[];
    pending_payment_slot_ids?: number[];
    single_user_only?: boolean;
    post_anonymously?: boolean;
    has_travel?: boolean;
    has_accommodation?: boolean;
    is_urgent?: boolean;
    ui_is_negotiable?: boolean;
    ui_is_flexible_time?: boolean;
    ui_allow_partial?: boolean;
    ui_location_city?: string | null;
    ui_location_state?: string | null;
    ui_address_line?: string | null;
    ui_distance_km?: number | null;
    ui_is_urgent?: boolean;
    created_at?: string;
    created_by?: number | null;
    status?: ShiftStatus;
    hourly_rate?: string | null;
    owner_adjusted_rate?: string | null;
    rate_type?: "FIXED" | "FLEXIBLE" | "PHARMACIST_PROVIDED" | null;
    fixed_rate?: string | null;
    flexible_timing?: boolean;
    min_hourly_rate?: string | null;
    max_hourly_rate?: string | null;
    min_annual_salary?: string | null;
    max_annual_salary?: string | null;
    super_percent?: string | null;
    payment_preference?: string | null;
    payment_status?: string | null;
    workload_tags?: string[];
    must_have?: string[];
    nice_to_have?: string[];
    allowed_shift_types?: string[];
    applications_count?: number;
    comment_count?: number;
    platform_applications?: number;
    platform_interests?: number;
    interested_members?: ShiftMemberStatusApi[];
    rejected_members?: ShiftMemberStatusApi[];
    assigned_members?: ShiftMemberStatusApi[];
    no_response_members?: ShiftMemberStatusApi[];
    share_token?: string | null;
}

export interface ShiftCounterOfferSlotApi {
    id?: number;
    slot_id?: number;
    slot?: ShiftSlotApi | null;
    slot_date?: string | null;
    proposed_start_time: string;
    proposed_end_time: string;
    proposed_rate?: string | number | null;
}

export interface ShiftCounterOfferApi {
    id: number;
    shift: number;
    user: number;
    request_travel?: boolean;
    status?: "PENDING" | "ACCEPTED" | "REJECTED";
    slots?: ShiftCounterOfferSlotApi[];
    created_at?: string | null;
    updated_at?: string | null;
}

export interface ShiftCounterOfferSlotPayload {
    slotId?: number;
    slotDate?: string;
    proposedStartTime: string;
    proposedEndTime: string;
    proposedRate?: number | null;
}

export interface ShiftCounterOfferPayload {
    shiftId: number;
    requestTravel?: boolean;
    travelOrigin?: string;
    travel_origin?: string;
    slots: ShiftCounterOfferSlotPayload[];
}

export interface ShiftCounterOfferDecisionPayload {
    shiftId: number;
    offerId: number;
}

export interface ShiftSaved {
    id: number;
    shift: number;
    createdAt: string;
}

export interface ShiftOfferApi {
    id: number;
    shift: number;
    shift_detail?: ShiftApi;
    slot?: number | null;
    slot_detail?: ShiftSlotApi | null;
    user: number;
    status?: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
    expires_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export type ShiftSlot = CamelCasedPropertiesDeep<ShiftSlotApi>;
export type ShiftAssignment = CamelCasedPropertiesDeep<ShiftAssignmentApi>;
export type ShiftPharmacyDetail = CamelCasedPropertiesDeep<ShiftPharmacyDetailApi>;
export type ShiftMemberStatus = CamelCasedPropertiesDeep<ShiftMemberStatusApi> & {
    displayName: string;
    averageRating: number | null;
    rating: number | null;
};

export type ShiftInterest = CamelCasedPropertiesDeep<ShiftInterestApi> & {
    displayName: string;
    averageRating: number | null;
    rating: number | null;
    slotId: number | null;
    user: string;
};
export type ShiftShareLink = CamelCasedPropertiesDeep<ShiftShareLinkApi>;
export type ShiftRatingSummary = CamelCasedPropertiesDeep<ShiftRatingSummaryApi>;
export type ShiftRatingComment = CamelCasedPropertiesDeep<ShiftRatingCommentApi>;
export type Shift = CamelCasedPropertiesDeep<ShiftApi>;
export type ShiftCounterOfferSlot = CamelCasedPropertiesDeep<ShiftCounterOfferSlotApi>;
export type ShiftCounterOffer = CamelCasedPropertiesDeep<ShiftCounterOfferApi>;
export type ShiftOffer = CamelCasedPropertiesDeep<ShiftOfferApi>;

export interface NotificationApi {
    id: number;
    type: string;
    title: string;
    body: string;
    action_url: string | null;
    payload: Record<string, unknown>;
    created_at: string;
    read_at: string | null;
}

export type Notification = {
    id: number;
    type: string;
    title: string;
    body: string;
    actionUrl: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
    readAt: string | null;
};

export type NotificationFeed = PaginatedResponse<Notification> & {
    unread?: number;
    countUnread?: number;
};

export interface Room {
    id: number;
    last_message_time: string | null;
    unread_count: number;
}

export interface ChatUserApi {
    id: number;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    profile_photo_url?: string | null;
}

export interface ChatMessageApi {
    id: number;
    conversation: number;
    sender: {
        id: number;
        user_details: ChatUserApi;
        pharmacy: number | null;
    };
    body: string;
    attachment_url: string | null;
    created_at: string;
    is_deleted?: boolean;
    is_edited?: boolean;
    original_body?: string | null;
    reactions?: {
        reaction: string;
        user_id: number;
    }[];
    attachment_filename?: string | null;
    is_pinned?: boolean;
}

export interface ChatRoomApi {
    id: number;
    type: 'GROUP' | 'DM';
    title: string;
    pharmacy?: number | null;
    unread_count?: number;
    updated_at?: string;
    last_message?: {
        id: number;
        body: string;
        created_at: string;
        sender: number;
    } | null;
    my_last_read_at?: string | null;
    participant_ids: number[];
    my_membership_id?: number | null;
    is_pinned: boolean;
    pinned_message: ChatMessageApi | null;
}

export type ChatUserLite = {
    id: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    profile_photo_url?: string | null;
};

export type ChatLastMessage = {
    id: number;
    body: string;
    created_at: string;
    sender: number;
};

export type ChatReaction = {
    reaction: string;
    user_id: number;
};

export type ChatMessage = {
    id: number;
    conversation: number;
    sender: {
        id: number;
        user_details: ChatUserLite;
        pharmacy: number | null;
    };
    body: string;
    attachment_url: string | null;
    created_at: string;
    is_deleted?: boolean;
    is_edited?: boolean;
    original_body?: string | null;
    reactions?: ChatReaction[];
    attachment_filename?: string | null;
    is_pinned?: boolean;
};

export type ChatRoom = {
    id: number;
    type: 'GROUP' | 'DM';
    title: string;
    pharmacy?: number | null;
    unread_count?: number;
    updated_at?: string;
    last_message?: ChatLastMessage | null;
    my_last_read_at?: string | null;
    participant_ids: number[];
    my_membership_id?: number | null;
    is_pinned: boolean;
    pinned_message: ChatMessage | null;
    latest_message?: Record<string, any> | null;
    most_recent_message?: Record<string, any> | null;
    recent_message?: Record<string, any> | null;
    display_name?: string;
    name?: string;
    conversation_title?: string;
};

export type ChatParticipant = {
    id: number;
    userDetails: ChatUserLite;
    role?: string;
    employmentType?: string;
    invitedName?: string;
    isAdmin?: boolean;
};

export type PharmacySummary = {
    id: number;
    name: string;
    email?: string | null;
    hasChain?: boolean;
    claimed?: boolean;
    claimStatus?: string | null;
    streetAddress?: string | null;
    suburb?: string | null;
    state?: string | null;
    postcode?: string | null;
    weekdaysStart?: string | null;
    weekdaysEnd?: string | null;
    mondayStart?: string | null;
    mondayEnd?: string | null;
    mondayClosed?: boolean | null;
    tuesdayStart?: string | null;
    tuesdayEnd?: string | null;
    tuesdayClosed?: boolean | null;
    wednesdayStart?: string | null;
    wednesdayEnd?: string | null;
    wednesdayClosed?: boolean | null;
    thursdayStart?: string | null;
    thursdayEnd?: string | null;
    thursdayClosed?: boolean | null;
    fridayStart?: string | null;
    fridayEnd?: string | null;
    fridayClosed?: boolean | null;
    saturdaysStart?: string | null;
    saturdaysEnd?: string | null;
    saturdaysClosed?: boolean | null;
    sundaysStart?: string | null;
    sundaysEnd?: string | null;
    sundaysClosed?: boolean | null;
    publicHolidaysStart?: string | null;
    publicHolidaysEnd?: string | null;
    publicHolidaysClosed?: boolean | null;
    publicHolidayDates?: string[];
};

export interface ChainApi {
    id: number;
    name: string;
    primary_contact_email?: string | null;
    logo?: string | null;
}

export type Chain = CamelCasedPropertiesDeep<ChainApi>;

export type MembershipSummary = {
    id: number;
    pharmacyId?: number | null;
    pharmacyName?: string | null;
    pharmacyDetail?: PharmacySummary | null;
    role?: string | null;
    employmentType?: string | null;
    userDetails?: ChatUserLite | null;
    invitedName?: string | null;
    isPharmacyOwner?: boolean;
};

export interface MembershipApplicationApi {
    id: number;
    pharmacy: number | string;
    category: 'FULL_PART_TIME' | 'LOCUM_CASUAL';
    role: string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    mobile_number?: string | null;
    job_title?: string | null;
    submitted_at?: string | null;
    pharmacist_award_level?: string | null;
    otherstaff_classification_level?: string | null;
    intern_half?: string | null;
    student_year?: string | null;
}

export type MembershipApplication = CamelCasedPropertiesDeep<MembershipApplicationApi>;

export interface Invoice {
    id: number;
    status: "DRAFT" | "SENT" | "PAID" | "OVERDUE";
    subtotal: string;
    gst_amount: string;
    super_amount: string;
    total: string;
}

export interface RosterShift {
    id: number;
    start_datetime: string;
    end_datetime: string;
    assigned_user: number | null;
}

export interface RosterUserDetailApi {
    id: number;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    role?: string | null;
    employment_type?: string | null;
}

export type RosterUserDetail = CamelCasedPropertiesDeep<RosterUserDetailApi>;

export interface RosterSlotDetailApi {
    id: number;
    date: string;
    start_time: string;
    end_time: string;
}

export type RosterSlotDetail = CamelCasedPropertiesDeep<RosterSlotDetailApi>;

export interface RosterShiftDetailApi {
    id: number;
    pharmacy_name?: string | null;
    role_needed?: string | null;
    visibility?: string | null;
    allowed_escalation_levels?: string[];
}

export type RosterShiftDetail = CamelCasedPropertiesDeep<RosterShiftDetailApi>;

export interface LeaveRequestApi {
    id: number;
    leave_type: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    note?: string | null;
    requester_name?: string | null;
}

export type LeaveRequest = CamelCasedPropertiesDeep<LeaveRequestApi>;

export interface WorkerShiftRequestApi {
    id: number;
    pharmacy: number | null;
    requester_name?: string | null;
    role: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    note?: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_PUBLISHED';
}

export type WorkerShiftRequest = CamelCasedPropertiesDeep<WorkerShiftRequestApi>;

export interface RosterAssignmentApi {
    id: number;
    slot_date: string;
    user: number | null;
    slot?: number | null;
    shift?: number | null;
    user_detail: RosterUserDetailApi;
    slot_detail: RosterSlotDetailApi;
    shift_detail: RosterShiftDetailApi;
    leave_request?: LeaveRequestApi | null;
    swap_request?: WorkerShiftRequestApi | null;
    origin?: {
        type: string;
        label: string;
        organization_name?: string | null;
    } | null;
}

export type RosterAssignment = CamelCasedPropertiesDeep<RosterAssignmentApi>;

export interface OpenShiftApi {
    id: number;
    pharmacy: number;
    role_needed: string;
    visibility?: string;
    allowed_escalation_levels?: string[];
    slots: RosterSlotDetailApi[];
    description?: string | null;
}

export type OpenShift = CamelCasedPropertiesDeep<OpenShiftApi>;

export interface RosterPharmacyMemberApi {
    id: number;
    user: number;
    role?: string | null;
    employment_type?: string | null;
    invited_name?: string | null;
    user_details?: {
        id: number;
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
    } | null;
}

export type RosterPharmacyMember = CamelCasedPropertiesDeep<RosterPharmacyMemberApi>;

export interface UserAvailabilityApi {
    id: number;
    date: string;
    start_time: string;
    end_time: string;
    is_all_day: boolean;
    is_recurring: boolean;
    recurring_days: number[];
    recurring_end_date?: string | null;
    notify_new_shifts?: boolean;
    notes?: string | null;
}

export type UserAvailability = CamelCasedPropertiesDeep<UserAvailabilityApi>;

export interface UserAvailabilityPayload {
    date: string;
    start_time: string;
    end_time: string;
    is_all_day: boolean;
    is_recurring: boolean;
    recurring_days: number[];
    recurring_end_date?: string | null;
    notify_new_shifts?: boolean;
    notes?: string | null;
}

export interface ShiftApplicationApi {
    id: number;
    pharmacist_name: string;
    pharmacist_email?: string | null;
    pharmacist_phone?: string | null;
    ahpra_number?: string | null;
    experience_years?: number | null;
    rating?: number | null;
    cover_letter?: string | null;
    applied_date: string;
    status: string;
}

export type ShiftApplication = CamelCasedPropertiesDeep<ShiftApplicationApi>;

export interface OwnerShiftSummaryApi {
    id: number;
    pharmacy_name: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    role: string;
    hourly_rate: number | string;
    assigned_user?: {
        name?: string | null;
        initials?: string | null;
    } | null;
    status: string;
}

export type OwnerShiftSummary = CamelCasedPropertiesDeep<OwnerShiftSummaryApi>;

export interface OwnerShiftDetailApi {
    id: number;
    pharmacy_name: string;
    pharmacy_address?: string | null;
    shift_date: string;
    start_time: string;
    end_time: string;
    role: string;
    hourly_rate: number | string;
    description?: string | null;
    applications_count?: number | null;
    status: string;
}

export type OwnerShiftDetail = CamelCasedPropertiesDeep<OwnerShiftDetailApi>;
