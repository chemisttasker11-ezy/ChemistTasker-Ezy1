import { useState } from "react";
import { Box, Button, Menu, MenuItem, Stack, Typography } from "@mui/material";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PersonIcon from "@mui/icons-material/Person";
import StoreIcon from "@mui/icons-material/Store";
import { userRoleLabel } from "../../utils/roleLabels";
import { DNA, workerOverviewPath } from "./shellModel";
import type { useDashboardWorkspaceScope } from "./useDashboardWorkspaceScope";

export default function DashboardPersonaSwitcher({ scope }: { scope: ReturnType<typeof useDashboardWorkspaceScope> }) {
  const { user, activePersona, selectRolePersona, selectAdminPersona, setActivePersona, navigate, delegatedAdminAssignments, otherStaffRoleType } = scope;
  const [adminAnchor, setAdminAnchor] = useState<HTMLElement | null>(null);
  return (


            <Stack direction="row" alignItems="center" sx={{ height: { xs: 48, md: 58 }, border: "1px solid var(--ct-border-color)", bgcolor: "var(--ct-surface-bg)", borderRadius: 999, p: 0.5, flexShrink: 0 }}>
              <Button
                onClick={() => {
                  const role = String(user?.role).toUpperCase();
                  if (role === "PHARMACIST" || role === "OTHER_STAFF") selectRolePersona(role);
                  else setActivePersona("staff");
                  navigate(workerOverviewPath(role), { replace: true });
                }}
                sx={{
                  borderRadius: 999,
                  height: { xs: 38, md: 46 },
                  px: { xs: 1.25, md: 2 },
                  textTransform: "none",
                  fontSize: { xs: 11, md: 12 },
                  fontWeight: 900,
                  color: activePersona === "admin" ? "var(--ct-text-secondary)" : "var(--ct-dashboard-accent)",
                  bgcolor: activePersona === "admin" ? "transparent" : "var(--ct-soft-primary)",
                }}
              >
                <PersonIcon sx={{ fontSize: 16, mr: 0.75 }} /> {userRoleLabel(user?.role, otherStaffRoleType)}
              </Button>
              <Button
                onClick={(event) => setAdminAnchor(event.currentTarget)}
                sx={{
                  borderRadius: 999,
                  height: { xs: 38, md: 46 },
                  px: { xs: 1.25, md: 2 },
                  textTransform: "none",
                  fontSize: { xs: 11, md: 12 },
                  fontWeight: 900,
                  color: activePersona === "admin" ? "var(--ct-dashboard-accent)" : "var(--ct-text-secondary)",
                  bgcolor: activePersona === "admin" ? "var(--ct-soft-primary)" : "transparent",
                }}
              >
                <AdminPanelSettingsIcon sx={{ fontSize: 16, mr: 0.75 }} /> Admin
              </Button>
              <Menu anchorEl={adminAnchor} open={Boolean(adminAnchor)} onClose={() => setAdminAnchor(null)}>
                {delegatedAdminAssignments.map((assignment) => (
                  <MenuItem
                    key={assignment.id ?? assignment.pharmacy_id}
                    onClick={() => {
                      if (assignment.id != null) selectAdminPersona(assignment.id);
                      navigate(`/dashboard/admin/${assignment.pharmacy_id}/overview`);
                      setAdminAnchor(null);
                    }}
                  >
                    <StoreIcon sx={{ mr: 1.5, color: DNA.blue }} />
                    <Box>
                      <Typography sx={{ fontWeight: 800 }}>{assignment.pharmacy_name ?? `Pharmacy #${assignment.pharmacy_id}`}</Typography>
                      <Typography sx={{ fontSize: 12, color: DNA.muted }}>{assignment.admin_level}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Menu>
            </Stack>
  );
}
