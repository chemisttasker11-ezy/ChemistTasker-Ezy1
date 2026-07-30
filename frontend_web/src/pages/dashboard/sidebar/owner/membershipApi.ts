import apiClient from "../../../../utils/apiClient";
import type { MembershipDTO } from "./types";

const asList = (payload: any) => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.results)) {
    return payload.results;
  }
  return [];
};

export async function fetchMembershipsForPharmacy(pharmacyId: string | number): Promise<MembershipDTO[]> {
  const response = await apiClient.get("/client-profile/memberships/", {
    params: { pharmacy_id: pharmacyId, page_size: 500 },
  });
  const rows = asList(response.data);
  return rows.map((row: any) => ({
    ...row,
    id: row.id,
    pharmacy_id: row.pharmacy,
    pharmacy_name: row.pharmacy_detail?.name,
    user_details: row.user_details,
    invited_name: row.invited_name,
    employment_type: row.employment_type,
    job_title: row.job_title,
    status: row.status,
    is_active: row.is_active,
    is_pharmacy_owner: row.is_pharmacy_owner,
    is_pharmacy_admin: row.is_pharmacy_admin,
    admin_level: row.admin_level,
    admin_level_label: row.admin_level_label,
    admin_level_description: row.admin_level_description,
  }));
}
