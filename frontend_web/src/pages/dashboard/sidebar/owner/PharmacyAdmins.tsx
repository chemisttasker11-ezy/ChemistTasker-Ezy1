import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { MessageCircle, Send, ShieldCheck, ShieldOff, ShieldPlus } from "lucide-react";
import { Pill } from "../../shiftCenter/ShiftCentreParts";
import {
  ConfirmDialog,
  EmptyTeam,
  MemberRow,
  TeamList,
  TeamListSkeleton,
  TeamSection,
  actionButtonSx,
  prettyCode,
} from "./teamUi";
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
} from "./types";
import type { MembershipDTO } from "@chemisttasker/shared-core";
import { ADMIN_CAPABILITY_MANAGE_ADMINS } from "../../../../constants/adminCapabilities";
import { useAuth } from "../../../../contexts/AuthContext";
import {
  fetchUserRoleByEmail,
  formatExistingUserRole,
  normalizeEmail,
} from "./inviteUtils";
import { createPharmacyAdminService, deletePharmacyAdminService } from "@chemisttasker/shared-core";
import { PendingDirectInvitationsPanel } from "./MembershipApplicationsPanel";

interface PharmacyAdminsProps {
  pharmacyId: string;
  admins: PharmacyAdminDTO[];
  pendingAdminMemberships?: MembershipDTO[];
  onAdminsChanged: () => void;
  loading?: boolean;
  inviteRequest?: number;
  chatPathFor?: (userId: number) => string;
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
  inviteRequest = 0,
  chatPathFor,
}: PharmacyAdminsProps) {
  const navigate = useNavigate();
  const { user: authUser, setUser, hasCapability } = useAuth();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState<InviteFormState>(DEFAULT_INVITE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [loadingId, setLoadingId] = useState<string | number | null>(null);
  const [toast, setToast] = useState<{ message: string; severity: "success" | "error" } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<PharmacyAdminDTO | null>(null);
  const [existingUserRole, setExistingUserRole] = useState<UserPortalRole | null | undefined>(undefined);
  const [checkingUserRole, setCheckingUserRole] = useState(false);

  useEffect(() => {
    if (inviteRequest > 0) setInviteOpen(true);
  }, [inviteRequest]);

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
  const isOwnerOfPharmacy = ownerPharmacyIds.has(numericPharmacyId);

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
      setToast({ message: "Enter a valid email address.", severity: "error" });
      return;
    }

    setSubmitting(true);
    try {
      await createPharmacyAdminService({
        pharmacy: numericPharmacyId,
        email: trimmedEmail,
        invited_name: form.invited_name?.trim() || undefined,
        admin_level: form.admin_level,
        staff_role: form.staff_role,
        job_title: form.job_title?.trim() || undefined,
      });
      setToast({ message: "Admin invitation sent. It shows under Invitations sent until accepted.", severity: "success" });
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
      setToast({ message: "Admin access removed.", severity: "success" });
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

  const levelOptions = ADMIN_LEVEL_OPTIONS.filter((opt) => opt.value !== "OWNER");

  return (
    <Box>
      <TeamSection
        title="Admins"
        count={showSkeleton ? undefined : visibleAdmins.length}
        tone="blue"
        description="People who help you run this pharmacy. Each level controls what they can change."
        actions={
          canManageAdmins ? (
            <Button variant="contained" startIcon={<ShieldPlus size={16} />} onClick={() => setInviteOpen(true)} sx={actionButtonSx}>
              Invite admin
            </Button>
          ) : null
        }
      >
        {showSkeleton ? (
          <TeamListSkeleton rows={2} label="Loading admins" />
        ) : visibleAdmins.length === 0 ? (
          <EmptyTeam
            icon={<ShieldCheck size={22} />}
            title="No admins yet"
            body="Admins can manage the roster, staff or team messages for you, so the pharmacy keeps running when you're away."
            action={canManageAdmins ? <Button variant="contained" startIcon={<ShieldPlus size={16} />} onClick={() => setInviteOpen(true)} sx={actionButtonSx}>Invite admin</Button> : undefined}
          />
        ) : (
          <TeamList label="Admins">
            {visibleAdmins.map((admin) => {
              const name = describeAdmin(admin) === "this admin" ? "Admin" : describeAdmin(admin);
              const email = admin.user_details?.email || admin.email;
              const adminLevel = ADMIN_LEVEL_LABELS[admin.admin_level] ?? admin.admin_level;
              const adminLevelHelper = ADMIN_LEVEL_HELPERS[admin.admin_level];
              const staffRoleLabel = admin.staff_role ? STAFF_ROLE_LABELS[admin.staff_role] : undefined;
              const removable = (admin.can_remove ?? canManageAdmins) && canManageAdmins;
              const userId = typeof admin.user === "number" ? admin.user : null;
              const caps = admin.capabilities || [];
              return (
                <MemberRow
                  key={admin.id}
                  name={name}
                  photoUrl={(admin.user_details as any)?.profile_photo_url || ""}
                  role={adminLevel}
                  tone="blue"
                  details={[
                    { label: "Access", value: adminLevelHelper },
                    { label: "Works as", value: staffRoleLabel },
                    { label: "Job title", value: admin.job_title },
                    {
                      label: "Can",
                      value: caps.length ? (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap component="span">
                          {caps.map((cap) => <Pill key={cap} label={CAPABILITY_LABELS[cap] ?? prettyCode(cap)} tone="blue" />)}
                        </Stack>
                      ) : "",
                    },
                    { label: "Email", value: email ? <Box component="a" href={`mailto:${email}`} sx={{ color: "var(--ct-accent-strong)" }}>{email}</Box> : "" },
                  ]}
                  actions={
                    userId && chatPathFor || removable ? (
                      <>
                        {userId && chatPathFor ? (
                          <Button variant="outlined" startIcon={<MessageCircle size={16} />} onClick={() => navigate(chatPathFor(userId))} sx={actionButtonSx}>
                            Message
                          </Button>
                        ) : null}
                        {removable ? (
                          <Button color="error" startIcon={<ShieldOff size={16} />} onClick={() => setConfirmRemove(admin)} disabled={loadingId === admin.id} sx={actionButtonSx}>
                            Remove admin access
                          </Button>
                        ) : null}
                      </>
                    ) : undefined
                  }
                />
              );
            })}
          </TeamList>
        )}
      </TeamSection>

      <PendingDirectInvitationsPanel memberships={pendingAdminMemberships} title="Invitations sent" />

      <ConfirmDialog
        open={Boolean(confirmRemove)}
        title={`Remove admin access for ${describeAdmin(confirmRemove)}?`}
        body="They lose admin rights at this pharmacy straight away. If they're also on the team, they stay on it as staff."
        confirmLabel="Remove access"
        busyLabel="Removing…"
        busy={Boolean(loadingId)}
        onConfirm={() => confirmRemove && handleRemove(confirmRemove)}
        onClose={() => setConfirmRemove(null)}
      />

      <Dialog open={inviteOpen} onClose={() => !submitting && resetForm()} fullWidth maxWidth="sm" aria-labelledby="invite-admin-title">
        <DialogTitle id="invite-admin-title" sx={{ fontWeight: 600 }}>Invite an admin</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2 }}>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, pt: 0.5 }}>
            <TextField label="Full name" value={form.invited_name} onChange={(e) => setForm((prev) => ({ ...prev, invited_name: e.target.value }))} fullWidth />
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
                  ? "Checking for an existing account…"
                  : formatExistingUserRole(existingUserRole) || (existingUserRole === null ? "No account yet. We'll create one when they accept." : undefined)
              }
            />
          </Box>
          <Box role="radiogroup" aria-label="Admin level">
            <Typography sx={{ fontWeight: 600, fontSize: 14, color: "var(--ct-text-primary)", mb: 1 }}>What can they do?</Typography>
            <Stack spacing={1}>
              {levelOptions.map((opt) => {
                const selected = form.admin_level === opt.value;
                return (
                  <ButtonBase
                    key={opt.value}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setForm((prev) => ({ ...prev, admin_level: opt.value }))}
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                      gap: 1.5,
                      p: 1.5,
                      textAlign: "left",
                      borderRadius: "12px",
                      border: "1px solid",
                      borderColor: selected ? "var(--ct-accent-strong)" : "var(--ct-border-color)",
                      bgcolor: selected ? "var(--ct-tone-violet-bg)" : "transparent",
                      "&.Mui-focusVisible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 2 },
                    }}
                  >
                    <Box
                      aria-hidden="true"
                      sx={{ mt: 0.25, width: 18, height: 18, flex: "0 0 18px", borderRadius: "50%", border: "2px solid", borderColor: selected ? "var(--ct-accent-strong)" : "var(--ct-text-muted)", display: "grid", placeItems: "center" }}
                    >
                      {selected ? <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "var(--ct-accent-strong)" }} /> : null}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 15, color: selected ? "var(--ct-tone-violet-fg)" : "var(--ct-text-primary)" }}>{opt.label}</Typography>
                      <Typography sx={{ fontSize: 13.5, color: selected ? "var(--ct-tone-violet-fg)" : "var(--ct-text-secondary)" }}>{ADMIN_LEVEL_HELPERS[opt.value]}</Typography>
                    </Box>
                  </ButtonBase>
                );
              })}
            </Stack>
          </Box>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField
              select
              label="Their role at the pharmacy"
              value={form.staff_role}
              onChange={(e) => setForm((prev) => ({ ...prev, staff_role: e.target.value as AdminStaffRole }))}
              fullWidth
            >
              {STAFF_ROLE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
            <TextField label="Job title (optional)" value={form.job_title} onChange={(e) => setForm((prev) => ({ ...prev, job_title: e.target.value }))} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={resetForm} disabled={submitting} sx={actionButtonSx}>Cancel</Button>
          <Button
            onClick={handleInvite}
            variant="contained"
            disabled={submitting || !form.email.trim()}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <Send size={16} />}
            sx={actionButtonSx}
          >
            {submitting ? "Sending…" : "Send invitation"}
          </Button>
        </DialogActions>
      </Dialog>

      {toast && (
        <Snackbar open autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: "100%" }}>
            {toast.message}
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
}

const CAPABILITY_LABELS: Record<string, string> = {
  MANAGE_ADMINS: "Manage admins",
  MANAGE_STAFF: "Manage staff",
  MANAGE_ROSTER: "Manage roster and shifts",
  MANAGE_COMMUNICATIONS: "Send team messages",
};
