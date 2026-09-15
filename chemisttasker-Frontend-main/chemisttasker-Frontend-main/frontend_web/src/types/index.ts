export interface OrgMembership {
    organization_id?: number;
    organization_name?: string;
    role?: string;
    role_label?: string;
    admin_level?: string;
    admin_level_label?: string;
    job_title?: string;
    region?: string | null;
    pharmacies?: { id: number; name: string }[];
    capabilities?: string[];
    pharmacy_id?: number;
    pharmacy_name?: string;
    pharmacy_role?: string;
  }
  
  export interface AuthUser {
    id: number;
    username: string;
    email: string;
    role: string;
    memberships?: OrgMembership[];
  }
  
