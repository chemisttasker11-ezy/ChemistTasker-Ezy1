import { useAuth } from "../contexts/AuthContext";
import AdminDashboardWrapper from "./adminDashboard";
import ExplorerDashboardWrapper from "./explorerDashboard";
import OrganizationDashboardWrapper from "./OrganizationDashboardWrapper";
import OtherstaffDashboardWrapper from "./otherStaffDashboard";
import OwnerDashboardWrapper from "./ownerDashboard";
import PharmacistDashboardWrapper from "./pharmacistDashboard";

export default function HubDashboardWrapper() {
  const { user } = useAuth();

  const hasOrgRole = (() => {
    if (!user?.memberships || !Array.isArray(user.memberships)) {
      return false;
    }
    return user.memberships.some((m: any) => m?.role && ["ORG_ADMIN", "ORG_OWNER", "ORG_STAFF", "CHIEF_ADMIN", "REGION_ADMIN"].includes(m.role));
  })();

  if (hasOrgRole) {
    return <OrganizationDashboardWrapper />;
  }

  switch (user?.role) {
    case "OWNER":
      return <OwnerDashboardWrapper />;
    case "PHARMACIST":
      return <PharmacistDashboardWrapper />;
    case "OTHER_STAFF":
      return <OtherstaffDashboardWrapper />;
    case "EXPLORER":
      return <ExplorerDashboardWrapper />;
    case "PHARMACY_ADMIN":
      // Pharmacy Admins can have multiple assignments, so we use the Admin wrapper
      return <AdminDashboardWrapper />;
    default:
      // Fallback to a generic or default wrapper if needed.
      // Using OrganizationDashboardWrapper as a safe default for any unexpected roles.
      return <OrganizationDashboardWrapper />;
  }
}