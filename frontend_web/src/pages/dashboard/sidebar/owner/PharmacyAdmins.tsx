import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  IconButton,
  TextField,
  Tooltip,
  Typography,
  Snackbar,
  CircularProgress,
  Skeleton,
  Stack,
} from "@mui/material";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import SecurityIcon from "@mui/icons-material/Security";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { alpha, useTheme } from "@mui/material/styles";
import {
  AdminLevel,
  AdminStaffRole,
  ADMIN_LEVEL_HELPERS,
  ADMIN_LEVEL_LABELS,
  ADMIN_LEVEL_OPTIONS,
  PharmacyAdminDTO,
  STAFF_ROLE_LABELS,
  STAFF_ROLE_OPTIONS,
  UserPortalRole,
  formatUserPortalRole,
  surface,
} from "./types";
import type { MembershipDTO } from "@chemisttasker/shared-core";
import { ADMIN_CAPABILITY_MANAGE_ADMINS, type AdminCapability } from "../../../../constants/adminCapabilities";
import { useAuth } from "../../../../contexts/AuthContext";
import {
  fetchUserRoleByEmail,
  formatExistingUserRole,
  normalizeEmail,
} from "./inviteUtils";
import { createPharmacyAdminService, deletePharmacyAdminService } from "@chemisttasker/shared-core";
import { PendingDirectInvitationsPanel } from "./MembershipApplicationsPanel";

const DASHBOARD_FONT_FAMILY = '"DM Sans Variable", "DM Sans", "Barlow", Arial, sans-serif';
const DASHBOARD_INK = "#06123A";
const DASHBOARD_MUTED = "#5E6B8D";
const LIGHT_BORDER = "#E5ECF7";

const actionButtonSx = {
  minHeight: 48,
  px: 2.25,
  borderRadius: "14px",
  fontWeight: 900,
  textTransform: "none",
};

const adminCardSx = {
  borderRadius: { xs: "16px", md: "20px" },
  borderColor: LIGHT_BORDER,
  backgroundColor: "#FFFFFF",
  boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
  minWidth: 0,
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
  "&:hover": {
    transform: { xs: "none", md: "translateY(-4px)" },
    boxShadow: "0 18px 42px rgba(6, 18, 58, 0.12)",
  },
};

interface PharmacyAdminsProps {
  pharmacyId: string;
  admins: PharmacyAdminDTO[];
  pendingAdminMemberships?: MembershipDTO[];
  onAdminsChanged: () => void;
  loading?: boolean;
}

type InviteFormState = {
  invited_name: string;
  email: string;
  staff_role: AdminStaffRole;
  admin_level: AdminLevel;
  job_title: string;
};

const DEFAULT_INVITE_FORM: InviteFormState = {
  invited_name: "",
  email: "",
  staff_role: STAFF_ROLE_OPTIONS[0]?.value ?? "PHARMACIST",
  admin_level: "MANAGER",
  job_title: "",
};

export default function PharmacyAdmins({
  pharmacyId,
  admins,
  pendingAdminMemberships = [],
  onAdminsChanged,
  loading = false,
}: PharmacyAdminsProps) {
  const theme = useTheme();
  const tokens = surface(theme);
  const { user: authUser, setUser, hasCapability } = useAuth();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState<InviteFormState>(DEFAULT_INVITE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [loadingId, setLoadingId] = useState<string | number | null>(null);
  const [toast, setToast] = useState<{ message: string; severity: "success" | "error" } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<PharmacyAdminDTO | null>(null);
  const [existingUserRole, setExistingUserRole] = useState<UserPortalRole | null | undefined>(undefined);
  const [checkingUserRole, setCheckingUserRole] = useState(false);

  const numericPharmacyId = useMemo(() => Number(pharmacyId), [pharmacyId]);
  const ownerPharmacyIds = useMemo(() => {
    const collected = new Set<number>();
    const memberships = authUser?.memberships ?? [];
    memberships.forEach((membership) => {
      if (
        membership &&
        typeof membership === "object" &&
        "pharmacy_id" in membership &&
        "role" in membership &&
        membership.role === "OWNER"
      ) {
        const pid = Number(membership.pharmacy_id);
        if (!Number.isNaN(pid)) {
          collected.add(pid);
        }
      }
    });
    return collected;
  }, [authUser?.memberships]);
  const isOwnerOfPharmacy = ownerPharmacyIds.has(numericPharmacyId) || authUser?.role === "OWNER";

  const canManageAdmins =
    hasCapability(ADMIN_CAPABILITY_MANAGE_ADMINS, numericPharmacyId) || isOwnerOfPharmacy;

  const visibleAdmins = useMemo(
    () => admins.filter((admin) => admin.admin_level !== "OWNER" && (admin as any).is_active !== false),
    [admins]
  );

  const showSkeleton = loading && visibleAdmins.length === 0;

  const resetForm = () => {
    setForm(DEFAULT_INVITE_FORM);
    setInviteOpen(false);
    setExistingUserRole(undefined);
    setCheckingUserRole(false);
  };

  const handleEmailBlur = async () => {
    const normalized = normalizeEmail(form.email);
    if (!normalized || !normalized.includes("@")) {
      setExistingUserRole(undefined);
      return;
    }
    setCheckingUserRole(true);
    try {
      const role = await fetchUserRoleByEmail(normalized);
      setExistingUserRole(role);
    } catch {
      setExistingUserRole(undefined);
    } finally {
      setCheckingUserRole(false);
    }
  };

  const handleInvite = async () => {
    const trimmedEmail = normalizeEmail(form.email);
    if (!canManageAdmins) {
      setToast({ message: "You do not have permission to invite admins.", severity: "error" });
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setToast({ message: "Please provide an email address.", severity: "error" });
      return;
    }

    const expectedUserRole: UserPortalRole =
      form.admin_level === "OWNER"
        ? "OWNER"
        : form.staff_role === "PHARMACIST"
        ? "PHARMACIST"
        : "OTHER_STAFF";

    setSubmitting(true);
    try {
      let currentUserRole = existingUserRole;
      if (typeof currentUserRole === "undefined") {
        try {
          currentUserRole = await fetchUserRoleByEmail(trimmedEmail);
          setExistingUserRole(currentUserRole);
        } catch {
          currentUserRole = undefined;
          setExistingUserRole(undefined);
        }
      }

      if (currentUserRole && currentUserRole !== expectedUserRole) {
        setToast({
          message: `Existing account is ${formatUserPortalRole(
            currentUserRole
          )}, but this admin level requires ${formatUserPortalRole(expectedUserRole)}.`,
          severity: "error",
        });
        setSubmitting(false);
        return;
      }

      await createPharmacyAdminService({
        pharmacy: numericPharmacyId,
        email: trimmedEmail,
        invited_name: form.invited_name?.trim() || undefined,
        admin_level: form.admin_level,
        staff_role: form.staff_role,
        job_title: form.job_title?.trim() || undefined,
      });
      setToast({ message: "Admin invitation sent.", severity: "success" });
      resetForm();
      onAdminsChanged();
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message;
      setToast({ message: detail || "Failed to send invitation.", severity: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (admin: PharmacyAdminDTO) => {
    if (!admin.id) return;
    setLoadingId(admin.id);
    try {
      await deletePharmacyAdminService(admin.id);
      setToast({ message: "Admin removed.", severity: "success" });
      if (authUser) {
        setUser((prev) => {
          if (!prev) return prev;
          if (!prev.admin_assignments) return prev;
          const updatedAssignments = prev.admin_assignments.filter(
            (assignment) => assignment.id !== admin.id
          );
          return { ...prev, admin_assignments: updatedAssignments };
        });
      }
      onAdminsChanged();
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message;
      setToast({ message: detail || "Failed to remove admin.", severity: "error" });
    } finally {
      setLoadingId(null);
      setConfirmRemove(null);
    }
  };

  const describeAdmin = (admin: PharmacyAdminDTO | null) => {
    if (!admin) return "this admin";
    const name =
      admin.invited_name ||
      [admin.user_details?.first_name, admin.user_details?.last_name].filter(Boolean).join(" ") ||
      admin.email ||
      "this admin";
    return name;
  };

  return (
    <Box sx={{ fontFamily: DASHBOARD_FONT_FAMILY }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2.5 }}
      >
        <Typography sx={{ color: DASHBOARD_INK, fontSize: { xs: 24, md: 30 }, fontWeight: 950, lineHeight: 1.12 }}>
          Admins
        </Typography>
        {canManageAdmins ? (
          <Button
            variant="contained"
            startIcon={<ManageAccountsIcon />}
            onClick={() => setInviteOpen(true)}
            sx={{ ...actionButtonSx, boxShadow: "0 12px 28px rgba(20, 62, 234, 0.18)" }}
          >
            Invite Admin
          </Button>
        ) : null}
      </Stack>

        {showSkeleton ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
            {Array.from({ length: 2 }).map((_, idx) => (
              <Card key={idx} variant="outlined" sx={adminCardSx}>
                <CardContent sx={{ display: "flex", gap: 2 }}>
                  <Skeleton variant="circular" width={40} height={40} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="80%" />
                    <Skeleton variant="text" width="60%" />
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : visibleAdmins.length === 0 ? (
          <Alert severity="info">No admins yet. Use "Invite Admin" to add one.</Alert>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
            {visibleAdmins.map((admin) => {
              const name =
                admin.invited_name ||
                [admin.user_details?.first_name, admin.user_details?.last_name].filter(Boolean).join(" ") ||
                admin.email ||
                "Admin";
              const email = admin.user_details?.email || admin.email;
              const adminLevel = ADMIN_LEVEL_LABELS[admin.admin_level] ?? admin.admin_level;
              const adminLevelHelper = ADMIN_LEVEL_HELPERS[admin.admin_level];
              const staffRoleLabel = admin.staff_role ? STAFF_ROLE_LABELS[admin.staff_role] : undefined;
              const jobTitle = admin.job_title;
              const removable = (admin.can_remove ?? canManageAdmins) && canManageAdmins;

              return (
                <Card
                  key={admin.id}
                  variant="outlined"
                  sx={adminCardSx}
                >
                  <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
                    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                        <Tooltip title={adminLevelHelper || "Admin access level"}>
                          <Chip label={adminLevel} color="secondary" sx={{ fontWeight: 800 }} />
                        </Tooltip>
                        {staffRoleLabel && <Chip label={staffRoleLabel} variant="outlined" sx={{ fontWeight: 800 }} />}
                        {jobTitle && <Chip label={jobTitle} variant="outlined" sx={{ fontWeight: 800, maxWidth: "100%" }} />}
                      </Stack>
                      {adminLevelHelper && (
                        <Typography sx={{ color: DASHBOARD_MUTED, fontWeight: 700, fontSize: 14, lineHeight: 1.45 }}>
                          {adminLevelHelper}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ minWidth: 0 }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ color: DASHBOARD_INK, fontWeight: 950, fontSize: { xs: 20, md: 22 }, lineHeight: 1.2, overflowWrap: "anywhere" }}>
                            {name}
                          </Typography>
                          {email && (
                            <Typography sx={{ mt: 0.5, color: DASHBOARD_MUTED, fontWeight: 700, fontSize: 15, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                              {email}
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ flexShrink: 0, display: "flex", gap: 0.5 }}>
                          <Tooltip title={formatCapabilityTooltip(admin.capabilities)}>
                            <IconButton size="small" sx={{ border: `1px solid ${alpha("#063BDA", 0.16)}` }}>
                              <SecurityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {removable && (
                            <Tooltip title="Remove">
                              <span>
                                <IconButton
                                  color="error"
                                  onClick={() => setConfirmRemove(admin)}
                                  disabled={loadingId === admin.id}
                                  sx={{ border: `1px solid ${alpha("#EF4444", 0.18)}` }}
                                >
                                  {loadingId === admin.id ? (
                                    <CircularProgress size={16} />
                                  ) : (
                                    <DeleteOutlineIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        </Box>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
        <PendingDirectInvitationsPanel
          memberships={pendingAdminMemberships}
          title="Pending Admin Invitations"
        />
      <Dialog
        open={Boolean(confirmRemove)}
        onClose={() => {
          if (!loadingId) setConfirmRemove(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Remove Admin</DialogTitle>
        <DialogContent>
          <Typography>{`Remove ${describeAdmin(confirmRemove)}? This action can't be undone.`}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(null)} disabled={Boolean(loadingId)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => confirmRemove && handleRemove(confirmRemove)}
            disabled={Boolean(loadingId)}
          >
            {loadingId === confirmRemove?.id ? "Removing..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={inviteOpen} onClose={resetForm} fullWidth maxWidth="sm">
        <DialogTitle>Invite Admin</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField
            label="Full Name"
            value={form.invited_name}
            onChange={(e) => setForm((prev) => ({ ...prev, invited_name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Email"
            type="email"
            required
            value={form.email}
            onChange={(e) => {
              const nextEmail = e.target.value;
              setForm((prev) => ({ ...prev, email: nextEmail }));
              setExistingUserRole(undefined);
              setCheckingUserRole(false);
            }}
            onBlur={handleEmailBlur}
            fullWidth
            helperText={
              checkingUserRole
                ? "Checking account..."
                : (() => {
                    const message = formatExistingUserRole(existingUserRole);
                    if (message) return message;
                    if (existingUserRole === null) {
                      return "No existing account found. A new user will be created.";
                    }
                    return undefined;
                  })()
            }
          />
          <FormControl fullWidth>
            <InputLabel>Admin Level</InputLabel>
            <Select
              label="Admin Level"
              value={form.admin_level}
              onChange={(e) => {
                const nextLevel = e.target.value as AdminLevel;
                setForm((prev) => ({
                  ...prev,
                  admin_level: nextLevel,
                  staff_role: nextLevel === "OWNER" ? "PHARMACIST" : prev.staff_role,
                }));
              }}
            >
              {ADMIN_LEVEL_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  <Box sx={{ display: "flex", flexDirection: "column" }}>
                    <Typography variant="body2" fontWeight={600}>
                      {opt.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: tokens.textMuted }}>
                      {ADMIN_LEVEL_HELPERS[opt.value]}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Staff Role</InputLabel>
            <Select
              label="Staff Role"
              value={form.staff_role}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, staff_role: e.target.value as AdminStaffRole }))
              }
              disabled={form.admin_level === "OWNER"}
            >
              {STAFF_ROLE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Job Title (optional)"
            value={form.job_title}
            onChange={(e) => setForm((prev) => ({ ...prev, job_title: e.target.value }))}
            fullWidth
          />
          <Typography variant="caption" sx={{ color: tokens.textMuted }}>
            Admins inherit staff permissions based on level. Choose the level to control whether they
            can manage roster, staff, or other admins.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetForm}>Cancel</Button>
          <Button onClick={handleInvite} variant="contained" disabled={submitting}>
            {submitting ? "Sending..." : "Send Invitation"}
          </Button>
        </DialogActions>
      </Dialog>

      {toast && (
        <Snackbar open autoHideDuration={4000} onClose={() => setToast(null)}>
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: "100%" }}>
            {toast.message}
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
}

function formatCapabilityTooltip(capabilities?: AdminCapability[]) {
  if (!capabilities || capabilities.length === 0) {
    return "View capabilities";
  }
  return `Capabilities: ${capabilities
    .map((cap) => cap.replace(/_/g, " ").toLowerCase())
    .join(", ")}`;
}
