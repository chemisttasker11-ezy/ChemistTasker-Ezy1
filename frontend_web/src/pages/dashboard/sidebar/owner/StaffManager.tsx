import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link2, MessageCircle, Plus, Send, UserMinus, UserPlus, Users } from "lucide-react";
import {
  Role,
  WorkType,
  MembershipDTO,
  coerceRole,
  coerceWorkType,
  requiredUserRoleForMembership,
  UserPortalRole,
} from "./types";
import {
  describeRoleMismatch,
  fetchUserRoleByEmail,
  formatExistingUserRole,
  normalizeEmail,
} from "./inviteUtils";
import {
  createMembershipInviteLinkService,
  deleteMembershipService,
  bulkInviteMembersService,
} from "@chemisttasker/shared-core";
import MembershipApplicationsPanel, { PendingDirectInvitationsPanel } from "./MembershipApplicationsPanel";
import { useAuth } from "../../../../contexts/AuthContext";
import { EmptyTeam, InviteLinkDialog, MemberRow, TeamList, TeamListSkeleton, TeamSection, TeamToolbar, actionButtonSx, employmentLabel, formatDate, membershipClassification, membershipPhoto, membershipUserId, roleLabel, roleTone } from "./teamUi";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";

const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CASUAL"] as const;
const employmentNeedsJobTitle = (value: string) =>
  value === "FULL_TIME" || value === "PART_TIME";

const inviteTextFieldSx = {
  "& .MuiInputLabel-root": {
    backgroundColor: "background.paper",
    px: 0.5,
  },
};
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "PHARMACIST", label: "Pharmacist" },
  { value: "INTERN", label: "Intern Pharmacist" },
  { value: "TECHNICIAN", label: "Dispensary Technician" },
  { value: "ASSISTANT", label: "Pharmacy Assistant" },
  { value: "STUDENT", label: "Pharmacy Student" },
];

type InviteRowState = {
  email: string;
  invited_name: string;
  role: Role;
  employment_type: (typeof EMPLOYMENT_TYPES)[number];
  job_title: string;
  existingUserRole?: UserPortalRole | null;
  checking?: boolean;
  error?: string | null;
};

const createInviteRow = (): InviteRowState => ({
  email: "",
  invited_name: "",
  role: "PHARMACIST",
  employment_type: "FULL_TIME",
  job_title: "",
  existingUserRole: undefined,
  checking: false,
  error: null,
});

const membershipStatus = (membership: MembershipDTO) =>
  String((membership as any).status || "").toUpperCase();

const membershipIsActive = (membership: MembershipDTO) =>
  ((membership as any).is_active ?? (membership as any).isActive) !== false;

const membershipIsAccepted = (membership: MembershipDTO) => {
  const status = membershipStatus(membership);
  return !["PENDING", "REJECTED", "LEFT"].includes(status) && membershipIsActive(membership);
};

type Staff = {
  id: string | number;
  name: string;
  email?: string;
  role: Role;
  workType: WorkType;
  jobTitle?: string | null;
  membership: MembershipDTO;
};

type SortKey = "name" | "role" | "workType";

type StaffManagerProps = {
  pharmacyId: string;
  memberships: MembershipDTO[];
  onMembershipsChanged: () => void;
  loading?: boolean;
  pharmacyName?: string;
  /** Bumped by the pharmacy page to open the invite dialog from elsewhere (e.g. Overview). */
  inviteRequest?: number;
  onApplicationsCount?: (count: number) => void;
  /** Route that opens a direct chat with a user; hides "Message" when absent. */
  chatPathFor?: (userId: number) => string;
};

export default function StaffManager({
  pharmacyId,
  memberships,
  onMembershipsChanged,
  loading = false,
  pharmacyName,
  inviteRequest = 0,
  onApplicationsCount,
  chatPathFor,
}: StaffManagerProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const derivedStaff: Staff[] = useMemo(() => {
    const currentUserId = typeof user?.id === "number" ? user.id : null;
    const currentEmail = normalizeEmail(user?.email || "");
    return (memberships || [])
      .filter((m) => {
        if (m.is_pharmacy_owner) {
          return false;
        }
        if (Boolean((m as any).is_pharmacy_admin ?? (m as any).isPharmacyAdmin)) {
          return false;
        }
        if (!membershipIsAccepted(m)) {
          return false;
        }
        const membershipUserId = typeof m.user === "number" ? m.user : null;
        const membershipEmail = normalizeEmail(m.user_details?.email || m.email || "");
        const isSelf =
          (currentUserId !== null && membershipUserId === currentUserId) ||
          (!!currentEmail && currentEmail === membershipEmail);
        return !isSelf;
      })
      .map((m) => {
      const fullName =
        m.invited_name ||
        m.name ||
        [m.user_details?.first_name, m.user_details?.last_name].filter(Boolean).join(" ") ||
        "Team Member";
      const email = m.user_details?.email || m.email || undefined;
      return {
        id: m.id,
        name: fullName,
        email,
        role: coerceRole(m.role),
        workType: coerceWorkType(m.employment_type),
        jobTitle: m.job_title ?? null,
        membership: m,
      };
    });
  }, [memberships, user?.id, user?.email]);

  const [list, setList] = useState<Staff[]>(derivedStaff);
  useEffect(() => setList(derivedStaff), [derivedStaff]);

  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [query, setQuery] = useState("");
  const [filterRole, setFilterRole] = useState<Role | "ALL">("ALL");
  const [filterWork, setFilterWork] = useState<WorkType | "ALL">("ALL");
  const showSkeleton = loading && memberships.length === 0;

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    const copy = [...list];
    copy.sort((a, b) => String(a[sortBy]).localeCompare(String(b[sortBy])) || a.name.localeCompare(b.name));
    return copy.filter(
      (s) =>
        (!q || s.name.toLowerCase().includes(q)) &&
        (filterRole === "ALL" || s.role === filterRole) &&
        (filterWork === "ALL" || s.workType === filterWork)
    );
  }, [list, sortBy, filterRole, filterWork, query]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRows, setInviteRows] = useState<InviteRowState[]>([createInviteRow()]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; severity: "success" | "error" } | null>(null);
  const handleApplicationsNotification = useCallback(
    (message: string, severity: "success" | "error") => {
      setToast({ message, severity });
    },
    []
  );
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | number | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkExpiry, setLinkExpiry] = useState("14");
  const [linkValue, setLinkValue] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Staff | null>(null);

  useEffect(() => {
    if (inviteRequest > 0) setInviteOpen(true);
  }, [inviteRequest]);

  const resetInviteForm = () => {
    setInviteRows([createInviteRow()]);
    setInviteError(null);
  };

  const handleInviteFieldChange = (
    idx: number,
    field: "email" | "invited_name" | "role" | "employment_type" | "job_title",
    value: string
  ) => {
    setInviteRows((prev) => {
      const next = [...prev];
      const current = next[idx];
      if (!current) {
        return prev;
      }
      let updated: InviteRowState = { ...current, [field]: value } as InviteRowState;
      if (field === "email") {
        updated.existingUserRole = undefined;
        updated.error = null;
      }
      if (field === "role") {
        updated.error = describeRoleMismatch(value as Role, updated.existingUserRole);
      }
      if (field === "employment_type" && !employmentNeedsJobTitle(value)) {
        updated = { ...updated, job_title: "" };
      }
      next[idx] = updated;
      return next;
    });
  };

  const refreshInviteRowUserRole = useCallback(
    async (idx: number) => {
      const targetRow = inviteRows[idx];
      if (!targetRow) {
        return;
      }
      const email = normalizeEmail(targetRow.email);
      if (!email || !email.includes("@")) {
        setInviteRows((prev) => {
          const next = [...prev];
          if (!next[idx]) {
            return prev;
          }
          next[idx] = { ...next[idx], existingUserRole: null, checking: false, error: null };
          return next;
        });
        return;
      }

      setInviteRows((prev) => {
        const next = [...prev];
        const row = next[idx];
        if (!row) {
          return prev;
        }
        next[idx] = { ...row, checking: true, error: null };
        return next;
      });

      try {
        const fetchedRole = await fetchUserRoleByEmail(email);
        setInviteRows((prev) => {
          const next = [...prev];
          const row = next[idx];
          if (!row || normalizeEmail(row.email) !== email) {
            return prev;
          }
          next[idx] = {
            ...row,
            checking: false,
            existingUserRole: fetchedRole,
            error: describeRoleMismatch(row.role, fetchedRole),
          };
          return next;
        });
      } catch {
        setInviteRows((prev) => {
          const next = [...prev];
          const row = next[idx];
          if (!row || normalizeEmail(row.email) !== email) {
            return prev;
          }
          next[idx] = {
            ...row,
            checking: false,
            existingUserRole: null,
            error: null,
          };
          return next;
        });
      }
    },
    [inviteRows]
  );

  const addInviteRow = () => setInviteRows((rows) => [...rows, createInviteRow()]);
  const removeInviteRow = (idx: number) =>
    setInviteRows((rows) => {
      const next = rows.filter((_, i) => i !== idx);
      return next.length ? next : [createInviteRow()];
    });

  const openLinkDialog = () => {
    setLinkExpiry("14");
    setLinkValue("");
    setLinkOpen(true);
  };

  const handleGenerateLink = async () => {
    setLinkSubmitting(true);
    try {
      const expires = Number(linkExpiry) || 14;
      const response = await createMembershipInviteLinkService({
        pharmacy: pharmacyId,
        category: "FULL_PART_TIME",
        expires_in_days: expires,
      });
      const token = response.token;
      const url = `${window.location.origin}/membership/apply/${token}`;
      setLinkValue(url);
      
    } catch (error: any) {
      setToast({ message: error?.response?.data?.detail || "Failed to generate link.", severity: "error" });
    } finally {
      setLinkSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!linkValue) return false;
    try {
      await navigator.clipboard.writeText(linkValue);
      return true;
    } catch {
      setToast({ message: "Couldn't copy the link. Select it and copy it instead.", severity: "error" });
      return false;
    }
  };

  const handleSendInvites = async () => {
    let rows = inviteRows.map((row) => ({
      ...row,
      email: row.email.trim(),
    }));
    setInviteError(null);
    const rowsWithEmail = rows.filter((row) => row.email);
    if (!rowsWithEmail.length) {
      setInviteError("Please fill out at least one invite.");
      return;
    }

    setInviteSubmitting(true);
    let hasErrors = false;
    for (let idx = 0; idx < rows.length; idx += 1) {
      const row = rows[idx];
      if (!row.email) {
        continue;
      }

      const normalizedEmail = normalizeEmail(row.email);
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        rows[idx] = { ...row, error: "Please enter a valid email address.", checking: false };
        hasErrors = true;
        continue;
      }

      let userRole = row.existingUserRole;
      if (typeof userRole === "undefined") {
        try {
          userRole = await fetchUserRoleByEmail(normalizedEmail);
        } catch {
          userRole = null;
        }
      }

      const mismatch = describeRoleMismatch(row.role, userRole);
      if (mismatch) {
        hasErrors = true;
      }

      if (employmentNeedsJobTitle(row.employment_type) && !row.job_title.trim()) {
        rows[idx] = {
          ...row,
          checking: false,
          existingUserRole: userRole ?? null,
          error: "Job title is required for full or part-time staff.",
        };
        hasErrors = true;
        continue;
      }

      rows[idx] = {
        ...row,
        checking: false,
        existingUserRole: userRole ?? null,
        error: mismatch,
      };
    }

    setInviteRows(rows);
    if (hasErrors) {
      setInviteError("One or more invitations need attention before sending.");
      setInviteSubmitting(false);
      return;
    }

    const payload = rows
      .filter((row) => row.email)
      .map((row) => ({
        email: row.email,
        invited_name: row.invited_name,
        role: row.role,
        employment_type: row.employment_type,
        pharmacy: pharmacyId,
        job_title: employmentNeedsJobTitle(row.employment_type)
          ? row.job_title.trim()
          : undefined,
      }));

    try {
      const response = await bulkInviteMembersService({ invitations: payload });
      const errors = (response as any)?.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        const nextRows = [...rows];
        let fallbackError: string | null = null;

        errors.forEach((entry: any) => {
          const message =
            entry?.error ||
            entry?.detail ||
            (typeof entry === "string" ? entry : "Failed to send invitations.");
          const lineIndex =
            typeof entry?.line === "number" && entry.line > 0 ? entry.line - 1 : -1;
          if (lineIndex >= 0 && nextRows[lineIndex]) {
            nextRows[lineIndex] = {
              ...nextRows[lineIndex],
              error: message,
              checking: false,
            };
          } else if (!fallbackError) {
            fallbackError = message;
          }
        });

        setInviteRows(nextRows);
        setInviteError(fallbackError);
        if ((response as any)?.results?.length) {
          setToast({ message: "Some invitations were sent.", severity: "success" });
          onMembershipsChanged();
        }
      } else {
        setToast({ message: "Invitations sent. They'll appear under Invitations sent until accepted.", severity: "success" });
        setInviteOpen(false);
        resetInviteForm();
        onMembershipsChanged();
      }
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.errors?.[0]?.error ||
        error?.message;
      setInviteError(detail || "Failed to send invitations.");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRemoveMembership = async (id: string | number) => {
    if (!id) return;
    setDeleteLoadingId(id);
    try {
      await deleteMembershipService(String(id));
      setToast({ message: "Removed from the team.", severity: "success" });
      onMembershipsChanged();
    } catch (error: any) {
      setToast({ message: error?.response?.data?.detail || "Failed to remove", severity: "error" });
    } finally {
      setDeleteLoadingId(null);
      setConfirmRemove(null);
    }
  };

  const rowDetails = (item: Staff) => {
    const m = item.membership;
    const joined = formatDate((m as any).responded_at ?? (m as any).respondedAt) || formatDate((m as any).created_at ?? (m as any).createdAt);
    const invitedBy = (m as any).invited_by ?? (m as any).invitedBy;
    return [
      { label: "Employment", value: employmentLabel(item.workType) },
      { label: "Job title", value: item.jobTitle || "" },
      { label: "Award classification", value: membershipClassification(m) },
      { label: "Member since", value: joined },
      { label: "Invited by", value: typeof user?.id === "number" && invitedBy === user.id ? "You" : "" },
      { label: "Email", value: item.email ? <Box component="a" href={`mailto:${item.email}`} sx={{ color: "var(--ct-accent-strong)" }}>{item.email}</Box> : "" },
    ];
  };

  return (
    <Box>
      <MembershipApplicationsPanel
        pharmacyId={pharmacyId}
        category="FULL_PART_TIME"
        title="Applications to review"
        allowedEmploymentTypes={Array.from(EMPLOYMENT_TYPES)}
        defaultEmploymentType="CASUAL"
        onApproved={onMembershipsChanged}
        onNotification={handleApplicationsNotification}
        onCountChange={onApplicationsCount}
      />

      <TeamSection
        title="Team members"
        count={showSkeleton ? undefined : list.length}
        tone="magenta"
        description="Full-time, part-time and casual staff at this pharmacy."
        actions={
          <>
            <Button variant="outlined" startIcon={<Link2 size={16} />} onClick={openLinkDialog} sx={actionButtonSx}>
              Invite link
            </Button>
            <Button variant="contained" startIcon={<UserPlus size={16} />} onClick={() => setInviteOpen(true)} sx={actionButtonSx}>
              Invite staff
            </Button>
          </>
        }
      >
        {list.length > 3 ? (
          <TeamToolbar
            search={query}
            onSearch={setQuery}
            searchLabel="Search team by name"
            filters={[
              { label: "Role", value: filterRole, onChange: (v) => setFilterRole(v as Role | "ALL"), options: [{ value: "ALL", label: "All roles" }, ...ROLE_OPTIONS] },
              { label: "Employment", value: filterWork, onChange: (v) => setFilterWork(v as WorkType | "ALL"), options: [{ value: "ALL", label: "All types" }, ...EMPLOYMENT_TYPES.map((t) => ({ value: t, label: employmentLabel(t) }))] },
              { label: "Sort by", value: sortBy, onChange: (v) => setSortBy(v as SortKey), options: [{ value: "name", label: "Name" }, { value: "role", label: "Role" }, { value: "workType", label: "Employment" }] },
            ]}
          />
        ) : null}
        {showSkeleton ? (
          <TeamListSkeleton label="Loading team members" />
        ) : list.length === 0 ? (
          <EmptyTeam
            icon={<Users size={22} />}
            title="No team members yet"
            body="Invite your pharmacists, interns, technicians and assistants by email, or share an invite link they can apply through."
            action={<Button variant="contained" startIcon={<UserPlus size={16} />} onClick={() => setInviteOpen(true)} sx={actionButtonSx}>Invite staff</Button>}
          />
        ) : data.length === 0 ? (
          <EmptyTeam
            icon={<Users size={22} />}
            title="No one matches"
            body="Try another name, role or employment type."
            action={<Button onClick={() => { setQuery(""); setFilterRole("ALL"); setFilterWork("ALL"); }} sx={actionButtonSx}>Clear filters</Button>}
          />
        ) : (
          <TeamList label="Team members">
            {data.map((item) => {
              const userId = membershipUserId(item.membership);
              return (
                <MemberRow
                  key={item.id}
                  name={item.name}
                  photoUrl={membershipPhoto(item.membership)}
                  role={roleLabel(item.role)}
                  tone={roleTone(item.role)}
                  details={rowDetails(item)}
                  actions={
                    <>
                      {userId && chatPathFor ? (
                        <Button variant="outlined" startIcon={<MessageCircle size={16} />} onClick={() => navigate(chatPathFor(userId))} sx={actionButtonSx}>
                          Message
                        </Button>
                      ) : null}
                      <Button
                        color="error"
                        startIcon={<UserMinus size={16} />}
                        onClick={() => setConfirmRemove(item)}
                        disabled={deleteLoadingId === item.id}
                        sx={actionButtonSx}
                      >
                        Remove from pharmacy
                      </Button>
                    </>
                  }
                />
              );
            })}
          </TeamList>
        )}
      </TeamSection>

      <PendingDirectInvitationsPanel
        memberships={memberships.filter((m) => !Boolean((m as any).is_pharmacy_admin ?? (m as any).isPharmacyAdmin))}
        title="Invitations sent"
      />

      <ConfirmDialog
        open={Boolean(confirmRemove)}
        title={confirmRemove ? `Remove ${confirmRemove.name}?` : "Remove team member?"}
        body={
          <>
            They'll lose access to {pharmacyName || "this pharmacy"}'s roster, chat and hub. Their past shifts and timesheets stay on record. You can invite them again later.
          </>
        }
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={Boolean(deleteLoadingId)}
        onConfirm={() => confirmRemove && handleRemoveMembership(confirmRemove.id)}
        onClose={() => setConfirmRemove(null)}
      />

      <Dialog open={inviteOpen} onClose={() => !inviteSubmitting && setInviteOpen(false)} fullWidth maxWidth="sm" aria-labelledby="invite-staff-title">
        <DialogTitle id="invite-staff-title" sx={{ fontWeight: 600 }}>
          Invite staff to {pharmacyName || "this pharmacy"}
        </DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2 }}>
          <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14.5, lineHeight: 1.55 }}>
            Staff join on the TFN employee pathway. You set their role and employment type; they add their own DOB, TFN and super details privately, and the pharmacy never sees them.{" "}
            <Box
              component="button"
              type="button"
              onClick={() => navigate(`/dashboard/workforce/settings?pharmacy_id=${pharmacyId}`)}
              sx={{ display: "inline", p: 0, border: 0, bgcolor: "transparent", color: "var(--ct-accent-strong)", font: "inherit", fontWeight: 600, textAlign: "left", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Using ChemistTasker Payroll? Add their employment terms in Workforce & Payroll.
            </Box>
          </Typography>
          {inviteError ? <Alert severity="error">{inviteError}</Alert> : null}
          {inviteRows.map((row, idx) => (
            <Box
              key={idx}
              sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, p: 2, borderRadius: "14px", border: "1px solid", borderColor: row.error ? "error.main" : "var(--ct-border-color)" }}
            >
              {inviteRows.length > 1 ? (
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ gridColumn: "1 / -1" }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14, color: "var(--ct-text-secondary)" }}>Person {idx + 1}</Typography>
                  <Button color="error" size="small" onClick={() => removeInviteRow(idx)}>Remove</Button>
                </Stack>
              ) : null}
              <TextField label="Full name" value={row.invited_name} onChange={(e) => handleInviteFieldChange(idx, "invited_name", e.target.value)} fullWidth sx={inviteTextFieldSx} />
              <TextField
                label="Email"
                type="email"
                required
                value={row.email}
                onChange={(e) => handleInviteFieldChange(idx, "email", e.target.value)}
                onBlur={() => void refreshInviteRowUserRole(idx)}
                fullWidth
                sx={inviteTextFieldSx}
              />
              <FormControl fullWidth error={Boolean(row.error)}>
                <InputLabel id={`role-${idx}`}>Role</InputLabel>
                <Select labelId={`role-${idx}`} label="Role" value={row.role} onChange={(e) => handleInviteFieldChange(idx, "role", e.target.value as Role)}>
                  {ROLE_OPTIONS.map((opt) => {
                    const requiredRole = requiredUserRoleForMembership(opt.value);
                    const disableOption =
                      requiredRole !== null &&
                      row.existingUserRole !== undefined &&
                      row.existingUserRole !== null &&
                      row.existingUserRole !== requiredRole;
                    return (
                      <MenuItem key={opt.value} value={opt.value} disabled={disableOption}>
                        {opt.label}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id={`work-${idx}`}>Employment type</InputLabel>
                <Select labelId={`work-${idx}`} label="Employment type" value={row.employment_type} onChange={(e) => handleInviteFieldChange(idx, "employment_type", e.target.value)}>
                  {EMPLOYMENT_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {employmentLabel(type)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {employmentNeedsJobTitle(row.employment_type) && (
                <TextField
                  label="Job title"
                  value={row.job_title}
                  onChange={(e) => handleInviteFieldChange(idx, "job_title", e.target.value)}
                  required
                  fullWidth
                  helperText="Shown to the team, e.g. Dispensary lead"
                  sx={{ gridColumn: "1 / -1" }}
                />
              )}
              {row.checking || row.error || formatExistingUserRole(row.existingUserRole) ? (
                <Typography variant="body2" role={row.error ? "alert" : undefined} sx={{ gridColumn: "1 / -1", color: row.error ? "error.main" : "var(--ct-text-secondary)" }}>
                  {row.checking ? "Checking for an existing account…" : row.error || formatExistingUserRole(row.existingUserRole)}
                </Typography>
              ) : null}
            </Box>
          ))}
          <Button onClick={addInviteRow} startIcon={<Plus size={16} />} sx={{ justifySelf: "start", ...actionButtonSx }}>
            Add another person
          </Button>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setInviteOpen(false)} disabled={inviteSubmitting} sx={actionButtonSx}>Cancel</Button>
          <Button
            onClick={handleSendInvites}
            variant="contained"
            disabled={inviteSubmitting}
            startIcon={inviteSubmitting ? <CircularProgress size={16} color="inherit" /> : <Send size={16} />}
            sx={actionButtonSx}
          >
            {inviteSubmitting ? "Sending…" : inviteRows.length > 1 ? `Send ${inviteRows.length} invitations` : "Send invitation"}
          </Button>
        </DialogActions>
      </Dialog>

      <InviteLinkDialog
        open={linkOpen}
        title="Invite link for staff"
        audience={`Anyone with this link can apply to join ${pharmacyName || "this pharmacy"} as staff. You review every application before they join.`}
        expiry={linkExpiry}
        onExpiry={setLinkExpiry}
        link={linkValue}
        generating={linkSubmitting}
        onGenerate={handleGenerateLink}
        onCopy={handleCopyLink}
        onClose={() => setLinkOpen(false)}
      />

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
