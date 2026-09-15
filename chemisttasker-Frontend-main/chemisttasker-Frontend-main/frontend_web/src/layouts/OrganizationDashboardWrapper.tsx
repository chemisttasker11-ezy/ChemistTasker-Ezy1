import { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { ColorModeProvider } from "../theme/sleekTheme";
import { useAuth } from "../contexts/AuthContext";
import DashboardTopShell from "./DashboardTopShell";

export default function OrganizationDashboardWrapper() {
  const { user } = useAuth();

  const organizationName = useMemo(() => {
    const memberships = Array.isArray(user?.memberships) ? user!.memberships : [];
    for (const record of memberships) {
      if (!record || typeof record !== "object") {
        continue;
      }
      const role = String((record as any).role ?? "").toUpperCase();
      if (!["ORG_ADMIN", "ORG_OWNER", "ORG_STAFF", "CHIEF_ADMIN", "REGION_ADMIN"].includes(role)) {
        continue;
      }
      const name = (record as any).organization_name;
      if (typeof name === "string" && name.trim().length > 0) {
        return name.trim();
      }
    }
    if (typeof (user as any)?.organization_name === "string") {
      const name = (user as any).organization_name.trim();
      if (name) {
        return name;
      }
    }
    return null;
  }, [user]);

  const titleOverride = organizationName ?? "Organization Dashboard";

  return (
    <ColorModeProvider>
      <DashboardTopShell titleOverride={titleOverride}>
        <Outlet />
      </DashboardTopShell>
    </ColorModeProvider>
  );
}
