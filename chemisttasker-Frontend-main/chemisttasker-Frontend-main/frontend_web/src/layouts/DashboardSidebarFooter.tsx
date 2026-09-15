import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { alpha, useTheme } from "@mui/material/styles";
import { SidebarFooterProps } from "@toolpad/core/DashboardLayout";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { getOnboarding } from "@chemisttasker/shared-core";
import { otherStaffRoleLabel } from "../utils/roleLabels";

type PersonaMenuOption =
  | {
      key: string;
      kind: "ROLE";
      role: "PHARMACIST" | "OTHER_STAFF";
      label: string;
      helper?: string;
    }
  | {
      key: string;
      kind: "ADMIN";
      assignmentId: number;
      label: string;
      helper?: string;
    };

const ADMIN_LEVEL_LABELS: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  ROSTER_MANAGER: "Roster Manager",
  COMMUNICATION_MANAGER: "Communications Manager",
};

const ADMIN_STAFF_ROLE_LABELS: Record<string, string> = {
  PHARMACIST: "Pharmacist",
  INTERN: "Intern Pharmacist",
  TECHNICIAN: "Dispensary Technician",
  ASSISTANT: "Pharmacy Assistant",
  STUDENT: "Pharmacy Student",
};

export default function DashboardSidebarFooter({ mini }: SidebarFooterProps) {
  const footerRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();
  const navigate = useNavigate();
  const {
    user,
    adminAssignments,
    activePersona,
    activeAdminAssignment,
    selectRolePersona,
    selectAdminPersona,
    isAdminUser,
  } = useAuth();
  const { workspace, setWorkspace, canUseInternal } = useWorkspace();
  const [personaAnchor, setPersonaAnchor] = useState<null | HTMLElement>(null);
  const [workspaceAnchor, setWorkspaceAnchor] = useState<null | HTMLElement>(null);
  const [otherStaffRoleType, setOtherStaffRoleType] = useState<string | null>(
    () => (user as any)?.other_staff_profile?.role_type ?? (user as any)?.otherStaffProfile?.roleType ?? null
  );

  useEffect(() => {
    if (user?.role !== "OTHER_STAFF") {
      setOtherStaffRoleType(null);
      return;
    }
    let cancelled = false;
    getOnboarding("other_staff")
      .then((profile: any) => {
        if (!cancelled) {
          setOtherStaffRoleType(profile?.data?.role_type ?? profile?.role_type ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOtherStaffRoleType(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const drawerElement = footerRef.current?.closest<HTMLElement>(".MuiDrawer-root");
    if (!drawerElement) {
      return undefined;
    }

    drawerElement.setAttribute("data-dashboard-shell-nav", "true");

    return () => {
      drawerElement.removeAttribute("data-dashboard-shell-nav");
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const drawerElement = footerRef.current?.closest<HTMLElement>(".MuiDrawer-root");
    const shellElement = footerRef.current?.closest<HTMLElement>("[data-dashboard-shell]");

    if (!drawerElement || !shellElement) {
      return undefined;
    }

    const { display } = window.getComputedStyle(drawerElement);
    if (display === "none") {
      return undefined;
    }

    shellElement.classList.toggle("dashboard-shell--collapsed", mini);

    return () => {
      shellElement.classList.remove("dashboard-shell--collapsed");
    };
  }, [mini]);

  const rawRole = (user?.role || "").trim().toLowerCase().replace(/\s/g, "_");
  const showWorkspaceSwitcher =
    canUseInternal &&
    activePersona === "staff" &&
    (rawRole === "pharmacist" || rawRole === "other_staff");

  const personaOptions = useMemo<PersonaMenuOption[]>(() => {
    if (user?.role === "OWNER") {
      return [];
    }

    const options: PersonaMenuOption[] = [];

    if (user?.role === "PHARMACIST" || user?.role === "OTHER_STAFF") {
      options.push({
        key: `ROLE:${user.role}`,
        kind: "ROLE",
        role: user.role,
        label: user.role === "OTHER_STAFF" ? otherStaffRoleLabel(otherStaffRoleType) : "Pharmacist",
        helper: "Staff dashboard",
      });
    }

    adminAssignments.forEach((assignment) => {
      if (!assignment || assignment.id == null || assignment.admin_level === "OWNER") {
        return;
      }

      const rawName =
        typeof assignment.pharmacy_name === "string" ? assignment.pharmacy_name.trim() : "";
      const pharmacyName = rawName || `Pharmacy #${assignment.pharmacy_id}`;
      const jobTitle = assignment.job_title?.trim();
      const levelLabel =
        (assignment.admin_level && ADMIN_LEVEL_LABELS[assignment.admin_level]) || "Admin";
      const helperParts: string[] = [pharmacyName];

      if (jobTitle) {
        helperParts.push(jobTitle);
      } else {
        const staffRole = assignment.staff_role?.trim().toUpperCase();
        if (staffRole) {
          helperParts.push(ADMIN_STAFF_ROLE_LABELS[staffRole] ?? staffRole.replace(/_/g, " "));
        }
      }

      options.push({
        key: `ADMIN:${assignment.id}`,
        kind: "ADMIN",
        assignmentId: assignment.id,
        label: levelLabel,
        helper: helperParts.filter(Boolean).join(" - ") || undefined,
      });
    });

    return options;
  }, [adminAssignments, otherStaffRoleType, user?.role]);

  const activePersonaKey = useMemo(() => {
    if (activePersona === "admin") {
      const activeId =
        activeAdminAssignment?.id ??
        adminAssignments.find((assignment) => assignment.id != null)?.id ??
        null;
      return activeId != null ? `ADMIN:${activeId}` : null;
    }
    if (
      activePersona === "staff" &&
      (user?.role === "PHARMACIST" || user?.role === "OTHER_STAFF")
    ) {
      return `ROLE:${user.role}`;
    }
    return null;
  }, [activeAdminAssignment?.id, activePersona, adminAssignments, user?.role]);

  const activePersonaOption =
    personaOptions.find((option) => option.key === activePersonaKey) ??
    personaOptions[0] ??
    null;

  const showPersonaSwitcher =
    personaOptions.length > 0 && (isAdminUser || personaOptions.length > 1);

  const handlePersonaSelect = (option: PersonaMenuOption) => {
    if (option.kind === "ROLE") {
      selectRolePersona(option.role);
      const targetPath =
        option.role === "PHARMACIST"
          ? "/dashboard/pharmacist/overview"
          : option.role === "OTHER_STAFF"
          ? "/dashboard/otherstaff/overview"
          : "/dashboard/explorer/overview";
      navigate(targetPath);
    } else {
      selectAdminPersona(option.assignmentId);
      const assignment = adminAssignments.find((item) => item.id === option.assignmentId);
      if (assignment?.pharmacy_id != null) {
        navigate(`/dashboard/admin/${assignment.pharmacy_id}/overview`, { replace: true });
      }
    }
    setPersonaAnchor(null);
  };

  if (mini) {
    return (
      <Box ref={footerRef} sx={{ px: 1, py: 1.25 }}>
        <Typography variant="caption" sx={{ whiteSpace: "nowrap", overflow: "hidden" }}>
          (c) CT
        </Typography>
      </Box>
    );
  }

  return (
    <Box ref={footerRef} sx={{ px: 0.75, pb: 0.75 }}>
      {(showWorkspaceSwitcher || showPersonaSwitcher) ? (
        <>
          <Divider sx={{ mb: 0.5, opacity: 0.8 }} />
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ px: 1, letterSpacing: 0.9, lineHeight: 1.1 }}
          >
            Settings
          </Typography>
        </>
      ) : null}

      {showWorkspaceSwitcher ? (
        <ListItemButton
          onClick={(event) => setWorkspaceAnchor(event.currentTarget)}
          sx={{
            borderRadius: 1.5,
            minHeight: 42,
            px: 1,
            py: 0.5,
            mt: 0.25,
          }}
        >
          <ListItemText
            primary="Workspace"
            secondary={workspace === "internal" ? "Internal" : "Platform"}
            primaryTypographyProps={{ variant: "body2", fontWeight: 600, noWrap: true }}
            secondaryTypographyProps={{
              variant: "caption",
              noWrap: true,
              sx: { textTransform: "capitalize" },
            }}
          />
          <KeyboardArrowDownIcon
            fontSize="small"
            sx={{ color: alpha(theme.palette.text.primary, 0.6), ml: 1 }}
          />
        </ListItemButton>
      ) : null}

      {showPersonaSwitcher ? (
        <ListItemButton
          onClick={(event) => setPersonaAnchor(event.currentTarget)}
          sx={{
            borderRadius: 1.5,
            minHeight: 42,
            px: 1,
            py: 0.5,
          }}
        >
          <ListItemText
            primary="Viewing As"
            secondary={activePersonaOption?.helper ? `${activePersonaOption.label} - ${activePersonaOption.helper}` : activePersonaOption?.label ?? "Select persona"}
            primaryTypographyProps={{ variant: "body2", fontWeight: 600, noWrap: true }}
            secondaryTypographyProps={{
              variant: "caption",
              noWrap: true,
              sx: { overflow: "hidden", textOverflow: "ellipsis" },
            }}
          />
          <KeyboardArrowDownIcon
            fontSize="small"
            sx={{ color: alpha(theme.palette.text.primary, 0.6), ml: 1 }}
          />
        </ListItemButton>
      ) : null}

      <Menu
        anchorEl={workspaceAnchor}
        open={Boolean(workspaceAnchor)}
        onClose={() => setWorkspaceAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        MenuListProps={{ dense: true }}
      >
        <MenuItem
          selected={workspace === "platform"}
          onClick={() => {
            setWorkspace("platform");
            setWorkspaceAnchor(null);
          }}
        >
          Platform
        </MenuItem>
        <MenuItem
          selected={workspace === "internal"}
          onClick={() => {
            setWorkspace("internal");
            setWorkspaceAnchor(null);
          }}
        >
          Internal
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={personaAnchor}
        open={Boolean(personaAnchor)}
        onClose={() => setPersonaAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        MenuListProps={{ dense: true }}
      >
        {personaOptions.map((option) => {
          const selected = option.key === activePersonaKey;
          return (
            <MenuItem
              key={option.key}
              selected={selected}
              onClick={() => handlePersonaSelect(option)}
              sx={{ minWidth: 240, alignItems: "flex-start", py: 1 }}
            >
              <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <Typography variant="body2" fontWeight={selected ? 700 : 500}>
                  {option.label}
                </Typography>
                {option.helper ? (
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                      maxWidth: 260,
                    }}
                  >
                    {option.helper}
                  </Typography>
                ) : null}
              </Box>
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
}
