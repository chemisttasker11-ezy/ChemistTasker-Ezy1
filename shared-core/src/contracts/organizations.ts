/** Pharmacy wire contract shared with the established pharmacy editor. */
export type PharmacyApi = {
    id: number;
    can_edit?: boolean;
    owner: number;
    name: string;
    email: string | null;
    claimed?: boolean;
    claim_status?: string | null;
    organization?: {
        id: number;
        name?: string | null;
    } | number | null;
    organization_id?: number | null;
    street_address: string;
    suburb: string;
    postcode: string;
    google_place_id: string;
    latitude: number | null;
    longitude: number | null;
    state: string;
    chain: number | null;
    abn: string;
    abn_verified?: boolean | null;
    abn_entity_confirmed?: boolean | null;
    abn_entity_name?: string | null;
    abn_entity_type?: string | null;
    abn_status?: string | null;
    abn_gst_registered?: boolean | null;
    abn_gst_from?: string | null;
    abn_gst_to?: string | null;
    abn_last_checked?: string | null;
    abn_verification_note?: string | null;
    methadone_s8_protocols?: string;
    qld_sump_docs?: string;
    sops?: string;
    induction_guides?: string;
    employment_types?: string[];
    roles_needed?: string[];
    software?: string[];
  services?: string[];
  script_volume_weekday?: string;
  script_volume_weekend?: string;
    weekdays_start: string | null;
    weekdays_end: string | null;
    monday_start: string | null;
    monday_end: string | null;
    monday_closed?: boolean | null;
    tuesday_start: string | null;
    tuesday_end: string | null;
    tuesday_closed?: boolean | null;
    wednesday_start: string | null;
    wednesday_end: string | null;
    wednesday_closed?: boolean | null;
    thursday_start: string | null;
    thursday_end: string | null;
    thursday_closed?: boolean | null;
    friday_start: string | null;
    friday_end: string | null;
    friday_closed?: boolean | null;
    saturdays_start: string | null;
    saturdays_end: string | null;
    saturdays_closed?: boolean | null;
    sundays_start: string | null;
    sundays_end: string | null;
    sundays_closed?: boolean | null;
    public_holidays_start: string | null;
    public_holidays_end: string | null;
    public_holidays_closed?: boolean | null;
    default_rate_type: 'FIXED' | 'FLEXIBLE' | 'PHARMACIST_PROVIDED' | null;
    default_fixed_rate: string | null;
    rate_weekday?: string | null;
    rate_saturday?: string | null;
    rate_sunday?: string | null;
    rate_public_holiday?: string | null;
    rate_early_morning?: string | null;
    rate_late_night?: string | null;
    about: string;
    auto_publish_worker_requests?: boolean;
};
export interface OrganizationApi {
    id: number;
    name: string;
    slug?: string;
    about?: string | null;
    logo?: string | null;
}
export interface PharmacyAdminApi {
    id: number;
    pharmacy: number;
    user: number;
    admin_level: 'OWNER' | 'MANAGER' | 'ROSTER_MANAGER' | 'COMMUNICATION_MANAGER';
    is_active: boolean;
    invitation_status?: string;
    invited_email?: string;
}
export interface PharmacyClaimApi {
    id: number;
    status: string;
    pharmacy: number | {
        id: number;
        name: string;
        email?: string | null;
    };
    message?: string;
    response_message?: string;
}
export interface PharmacyAdminInvitationApi {
    id: number;
    membership_id: number;
    pharmacy_id: number;
    pharmacy_name: string;
    admin_level: string;
    staff_role?: string | null;
    job_title?: string;
    membership_status: string;
}
