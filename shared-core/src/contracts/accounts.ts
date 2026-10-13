/** Existing users/account and role-onboarding wire fields consumed by shared clients. */
export interface CurrentUserApi {
    id: number;
    username: string;
    email: string;
    role: string;
    first_name?: string | null;
    last_name?: string | null;
    public_community_enabled?: boolean;
    is_pharmacy_admin?: boolean;
    is_mobile_verified?: boolean;
    /** New to pharmacy (overseas) skipped the mobile check. */
    mobile_check_skipped?: boolean;
    profile_photo_url?: string | null;
    billing_active?: boolean;
    in_free_trial?: boolean;
}
export interface OnboardingApi {
    id?: number;
    first_name?: string | null;
    last_name?: string | null;
    abn?: string | null;
    bank_account_name?: string | null;
    bsb?: string | null;
    account_number?: string | null;
    super_fund_name?: string | null;
    super_usi?: string | null;
    super_member_number?: string | null;
    super_rate_snapshot?: number | string | null;
    gst_registered?: boolean;
    payment_preference?: string;
}
