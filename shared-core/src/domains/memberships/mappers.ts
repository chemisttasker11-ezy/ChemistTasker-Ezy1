import type { MembershipRecordApi } from '../../contracts/membershipRecords';
import type { MembershipApplicationApi } from '../../types';
/** Domain-owned operations extracted from the established shared API. */
import { camelCaseKeysDeep } from '../../utils/serialization';
export const mapMembershipSummary = (api: MembershipRecordApi) => {
    const rawUserDetails = api.user_details ? { ...api.user_details } : null;
    const rawPharmacyDetail = api.pharmacy_detail ? { ...api.pharmacy_detail } : null;
    const pharmacyId = api.pharmacy_id ?? (typeof api.pharmacy === 'object' ? api.pharmacy?.id : api.pharmacy) ?? null;
    const pharmacyName = api.pharmacy_name ?? rawPharmacyDetail?.name ?? null;
    return {
        // Preserve the raw serializer fields for the established Vite/mobile
        // authenticated flows while also exposing camelCase domain aliases.
        // This lets clients share one mapper without losing legacy behavior.
        ...api,
        id: Number(api.id),
        user: api.user ?? rawUserDetails?.id ?? null,
        pharmacy_id: pharmacyId,
        pharmacy_name: pharmacyName,
        pharmacyId,
        pharmacyName,
        pharmacy_detail: rawPharmacyDetail,
        pharmacyDetail: rawPharmacyDetail ? camelCaseKeysDeep(rawPharmacyDetail) : null,
        role: api.role ?? null,
        email: api.email ?? rawUserDetails?.email ?? null,
        name: api.name ?? null,
        invited_name: api.invited_name ?? null,
        invitedName: api.invited_name ?? null,
        user_details: rawUserDetails,
        userDetails: rawUserDetails ? camelCaseKeysDeep(rawUserDetails) : null,
        employment_type: api.employment_type ?? null,
        employmentType: api.employment_type ?? null,
        job_title: api.job_title ?? null,
        jobTitle: api.job_title ?? null,
        is_active: api.is_active ?? false,
        isActive: api.is_active ?? false,
        status: api.status ?? null,
        is_pharmacy_owner: api.is_pharmacy_owner ?? false,
        isPharmacyOwner: api.is_pharmacy_owner ?? false,
        is_pharmacy_admin: api.is_pharmacy_admin ?? false,
        isPharmacyAdmin: api.is_pharmacy_admin ?? false,
        admin_level: api.admin_level ?? null,
        adminLevel: api.admin_level ?? null,
        admin_level_label: api.admin_level_label ?? null,
        adminLevelLabel: api.admin_level_label ?? null,
        admin_level_description: api.admin_level_description ?? null,
        adminLevelDescription: api.admin_level_description ?? null,
    };
};
export const mapMembershipApplication = (api: MembershipApplicationApi) => camelCaseKeysDeep(api);
