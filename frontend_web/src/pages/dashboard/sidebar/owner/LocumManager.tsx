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
import { Link2, MessageCircle, Plus, Send, Star, StarOff, UserPlus } from "lucide-react";
import {
  ConfirmDialog,
  EmptyTeam,
  InviteLinkDialog,
  MemberRow,
  TeamList,
  TeamListSkeleton,
  TeamSection,
  TeamToolbar,
  actionButtonSx,
  employmentLabel,
  formatDate,
  membershipClassification,
  membershipPhoto,
  membershipUserId,
  roleLabel,
  roleTone,
} from "./teamUi";
import {
  createMembershipInviteLinkService,
  deleteMembershipService,
  bulkInviteMembersService,
} from "@chemisttasker/shared-core";
import {
  MembershipDTO,
  Role,
  WorkType,
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
import MembershipApplicationsPanel, { PendingDirectInvitationsPanel } from "./MembershipApplicationsPanel";

const LOCUM_WORK_TYPES = ["LOCUM", "SHIFT_HERO"] as const;

const deriveInviteEmploymentType = (role: Role): (typeof LOCUM_WORK_TYPES)[number] =>
  role === "PHARMACIST" ? "LOCUM" : "SHIFT_HERO";

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
  employment_type: (typeof LOCUM_WORK_TYPES)[number];
  existingUserRole?: UserPortalRole | null;
  checking?: boolean;
  error?: string | null;
};

const createInviteRow = (): InviteRowState => ({
  email: "",
  invited_name: "",
  role: "PHARMACIST",
  employment_type: "LOCUM",
  existingUserRole: undefined,
  checking: false,
  error: null,
});

type Locum = {
  id: string | number;
  name: string;
  email?: string;
  role: Role;
  workType: WorkType;
  membership: MembershipDTO;
};

type SortKey = "name" | "role" | "workType";

type LocumManagerProps = {
  pharmacyId: string;
  memberships: MembershipDTO[];
  onMembershipsChanged: () => void;
  loading?: boolean;
  pharmacyName?: string;
  inviteRequest?: number;
  onApplicationsCount?: (count: number) => void;
  chatPathFor?: (userId: number) => string;
};

const membershipStatus = (membership: MembershipDTO) =>
  String((membership as any).status || "").toUpperCase();

const membershipIsActive = (membership: MembershipDTO) =>
  ((membership as any).is_active ?? (membership as any).isActive) !== false;

const membershipIsAccepted = (membership: MembershipDTO) => {
  const status = membershipStatus(membership);
  return !["PENDING", "REJECTED", "LEFT"].includes(status) && membershipIsActive(membership);
};

export default function LocumManager({
  pharmacyId,
  memberships,
  onMembershipsChanged,
  loading = false,
  pharmacyName,
  inviteRequest = 0,
  onApplicationsCount,
  chatPathFor,
}: LocumManagerProps) {
  const navigate = useNavigate();
  const derivedLocums: Locum[] = useMemo(() => {
    return (memberships || []).filter(membershipIsAccepted).map((m) => {
      const fullName =
        m.invited_name ||
        m.name ||
        [m.user_details?.first_name, m.user_details?.last_name].filter(Boolean).join(" ") ||
        "Favourite";
      const email = m.user_details?.email || m.email || undefined;
      return {
        id: m.id,
        name: fullName,
        email,
        role: coerceRole(m.role),
        workType: coerceWorkType(m.employment_type),
        membership: m,
      };
    });
  }, [memberships]);

  const [items, setItems] = useState<Locum[]>(derivedLocums);
  useEffect(() => setItems(derivedLocums), [derivedLocums]);

  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [query, setQuery] = useState("");
  const [filterRole, setFilterRole] = useState<Role | "ALL">("ALL");
  const [filterWork, setFilterWork] = useState<WorkType | "ALL">("ALL");

  const filteredLocums = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => String(a[sortBy]).localeCompare(String(b[sortBy])) || a.name.localeCompare(b.name));
    return sorted.filter(
      (locum) =>
        (!q || locum.name.toLowerCase().includes(q)) &&
        (filterRole === "ALL" || locum.role === filterRole) &&
        (filterWork === "ALL" || locum.workType === filterWork)
    );
  }, [items, sortBy, filterRole, filterWork, query]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | number | null>(null);
  const [toast, setToast] = useState<{ message: string; severity: "success" | "error" } | null>(null);
  const handleApplicationsNotification = useCallback(
    (message: string, severity: "success" | "error") => {
      setToast({ message, severity });
    },
    []
  );
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkExpiry, setLinkExpiry] = useState("14");
  const [linkValue, setLinkValue] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Locum | null>(null);
  const showSkeleton = loading && memberships.length === 0;

  const [inviteRows, setInviteRows] = useState<InviteRowState[]>([createInviteRow()]);

  const resetInviteRows = () => {
    setInviteRows([createInviteRow()]);
    setInviteError(null);
  };

  const handleInviteFieldChange = (
    idx: number,
    field: "email" | "invited_name" | "role" | "employment_type",
    value: string
  ) => {
    setInviteRows((prev) => {
      const next = [...prev];
      const row = next[idx];
      if (!row) {
        return prev;
      }
      const updated: InviteRowState = { ...row, [field]: value } as InviteRowState;
      if (field === "email") {
        updated.existingUserRole = undefined;
        updated.error = null;
      }
      if (field === "role") {
        updated.employment_type = deriveInviteEmploymentType(value as Role);
        updated.error = describeRoleMismatch(value as Role, updated.existingUserRole);
      }
      next[idx] = updated;
      return next;
    });
  };

  const refreshInviteRowUserRole = useCallback(
    async (idx: number) => {
      const row = inviteRows[idx];
      if (!row) {
        return;
      }
      const email = normalizeEmail(row.email);
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
        const current = next[idx];
        if (!current) {
          return prev;
        }
        next[idx] = { ...current, checking: true, error: null };
        return next;
      });

      try {
        const fetchedRole = await fetchUserRoleByEmail(email);
        setInviteRows((prev) => {
          const next = [...prev];
          const current = next[idx];
          if (!current || normalizeEmail(current.email) !== email) {
            return prev;
          }
          next[idx] = {
            ...current,
            checking: false,
            existingUserRole: fetchedRole,
            error: describeRoleMismatch(current.role, fetchedRole),
          };
          return next;
        });
      } catch {
        setInviteRows((prev) => {
          const next = [...prev];
          const current = next[idx];
          if (!current || normalizeEmail(current.email) !== email) {
            return prev;
          }
          next[idx] = {
            ...current,
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

  const addInviteRow = () => setInviteRows((prev) => [...prev, createInviteRow()]);

  const removeInviteRow = (idx: number) =>
    setInviteRows((prev) => {
      const next = prev.filter((_, rowIdx) => rowIdx !== idx);
      return next.length ? next : [createInviteRow()];
    });

  useEffect(() => {
    if (inviteRequest > 0) {
      setInviteRows([createInviteRow()]);
      setInviteError(null);
      setInviteOpen(true);
    }
  }, [inviteRequest]);

  const openInviteDialog = () => {
    resetInviteRows();
    setInviteOpen(true);
  };

  const handleSendInvites = async () => {
    let rows = inviteRows.map((row) => ({
      ...row,
      email: row.email.trim(),
    }));
    setInviteError(null);
    const rowsWithEmail = rows.filter((row) => row.email);
    if (!rowsWithEmail.length) {
      setInviteError("Please add at least one invite.");
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
        employment_type: deriveInviteEmploymentType(row.role),
        pharmacy: pharmacyId,
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
            (typeof entry === "string" ? entry : "Failed to send invites.");
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
          setToast({ message: "Some invitations were sent. Check the ones marked below.", severity: "success" });
          onMembershipsChanged();
        }
        return;
      }
      setToast({ message: "Invitations sent. They'll appear under Invitations sent until accepted.", severity: "success" });
      setInviteOpen(false);
      resetInviteRows();
      onMembershipsChanged();
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.errors?.[0]?.error ||
        error?.message;
      setInviteError(detail || "Failed to send invites.");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRemoveMembership = async (id: string | number) => {
    if (!id) return;
    setDeleteLoadingId(id);
    try {
      await deleteMembershipService(id);
      setToast({ message: "Removed from favourites.", severity: "success" });
      onMembershipsChanged();
    } catch (error: any) {
      setToast({ message: error?.response?.data?.detail || "Failed to remove favourite.", severity: "error" });
    } finally {
      setDeleteLoadingId(null);
      setConfirmRemove(null);
    }
  };

  const openLinkDialog = () => {
    setLinkExpiry("14");
    setLinkValue("");
    setLinkOpen(true);
  };

  const handleGenerateLink = async () => {
    setLinkSubmitting(true);
    try {
      const expires = Number(linkExpiry) || 14;
      const res = await createMembershipInviteLinkService({
        pharmacy: pharmacyId,
        category: "LOCUM_CASUAL",
        expires_in_days: expires,
      });
      const token = res.token;
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

  const rowDetails = (item: Locum) => {
    const m = item.membership;
    const since = formatDate((m as any).responded_at ?? (m as any).respondedAt) || formatDate((m as any).created_at ?? (m as any).createdAt);
    return [
      { label: "Works as", value: employmentLabel(item.workType) },
      { label: "Award classification", value: membershipClassification(m) },
      { label: "Favourite since", value: since },
      { label: "Email", value: item.email ? <Box component="a" href={`mailto:${item.email}`} sx={{ color: "var(--ct-accent-strong)" }}>{item.email}</Box> : "" },
    ];
  };

  return (
    <Box>
      <MembershipApplicationsPanel
        pharmacyId={pharmacyId}
        category="LOCUM_CASUAL"
        title="Applications to review"
        allowedEmploymentTypes={Array.from(LOCUM_WORK_TYPES)}
        defaultEmploymentType="LOCUM"
        onApproved={onMembershipsChanged}
        onNotification={handleApplicationsNotification}
        onCountChange={onApplicationsCount}
      />

      <TeamSection
        title="Favourite locums"
        count={showSkeleton ? undefined : items.length}
        tone="violet"
        description="Locums and Shift Heroes who see your shifts first."
        actions={
          <>
            <Button variant="outlined" startIcon={<Link2 size={16} />} onClick={openLinkDialog} sx={actionButtonSx}>
              Invite link
            </Button>
            <Button variant="contained" startIcon={<UserPlus size={16} />} onClick={openInviteDialog} sx={actionButtonSx}>
              Add favourite
            </Button>
          </>
        }
      >
        {items.length > 3 ? (
          <TeamToolbar
            search={query}
            onSearch={setQuery}
            searchLabel="Search favourites by name"
            filters={[
              { label: "Role", value: filterRole, onChange: (v) => setFilterRole(v as Role | "ALL"), options: [{ value: "ALL", label: "All roles" }, ...ROLE_OPTIONS] },
              { label: "Works as", value: filterWork, onChange: (v) => setFilterWork(v as WorkType | "ALL"), options: [{ value: "ALL", label: "All types" }, ...LOCUM_WORK_TYPES.map((t) => ({ value: t, label: employmentLabel(t) }))] },
              { label: "Sort by", value: sortBy, onChange: (v) => setSortBy(v as SortKey), options: [{ value: "name", label: "Name" }, { value: "role", label: "Role" }, { value: "workType", label: "Works as" }] },
            ]}
          />
        ) : null}
        {showSkeleton ? (
          <TeamListSkeleton label="Loading favourite locums" />
        ) : items.length === 0 ? (
          <EmptyTeam
            icon={<Star size={22} />}
            title="No favourite locums yet"
            body="Add the locums and Shift Heroes you trust. Your favourites are offered your shifts before anyone else."
            action={<Button variant="contained" startIcon={<UserPlus size={16} />} onClick={openInviteDialog} sx={actionButtonSx}>Add favourite</Button>}
          />
        ) : filteredLocums.length === 0 ? (
          <EmptyTeam
            icon={<Star size={22} />}
            title="No one matches"
            body="Try another name, role or type."
            action={<Button onClick={() => { setQuery(""); setFilterRole("ALL"); setFilterWork("ALL"); }} sx={actionButtonSx}>Clear filters</Button>}
          />
        ) : (
          <TeamList label="Favourite locums">
            {filteredLocums.map((locum) => {
              const userId = membershipUserId(locum.membership);
              return (
                <MemberRow
                  key={locum.id}
                  name={locum.name}
                  photoUrl={membershipPhoto(locum.membership)}
                  role={roleLabel(locum.role)}
                  tone={roleTone(locum.role)}
                  details={rowDetails(locum)}
                  actions={
                    <>
                      {userId && chatPathFor ? (
                        <Button variant="outlined" startIcon={<MessageCircle size={16} />} onClick={() => navigate(chatPathFor(userId))} sx={actionButtonSx}>
                          Message
                        </Button>
                      ) : null}
                      <Button color="error" startIcon={<StarOff size={16} />} onClick={() => setConfirmRemove(locum)} disabled={deleteLoadingId === locum.id} sx={actionButtonSx}>
                        Remove from favourites
                      </Button>
                    </>
                  }
                />
              );
            })}
          </TeamList>
        )}
      </TeamSection>

      <PendingDirectInvitationsPanel memberships={memberships} title="Invitations sent" />

      <ConfirmDialog
        open={Boolean(confirmRemove)}
        title={confirmRemove ? `Remove ${confirmRemove.name} from favourites?` : "Remove favourite?"}
        body="They'll stop seeing your shifts first. Shifts they've already accepted stay booked, and you can add them again later."
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={Boolean(deleteLoadingId)}
        onConfirm={() => confirmRemove && handleRemoveMembership(confirmRemove.id)}
        onClose={() => setConfirmRemove(null)}
      />

      <Dialog open={inviteOpen} onClose={() => !inviteSubmitting && setInviteOpen(false)} fullWidth maxWidth="sm" aria-labelledby="invite-locum-title">
        <DialogTitle id="invite-locum-title" sx={{ fontWeight: 600 }}>
          Add favourite locums to {pharmacyName || "this pharmacy"}
        </DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2 }}>
          <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14.5, lineHeight: 1.55 }}>
            Don't enter TFN or ABN details here. Each worker's private Payment Profile decides how every accepted shift is paid: TFN work goes to payroll and timesheets, verified ABN work goes to invoicing, and the agreed terms are locked on the shift.
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
                value={row.email}
                onChange={(e) => handleInviteFieldChange(idx, "email", e.target.value)}
                onBlur={() => void refreshInviteRowUserRole(idx)}
                fullWidth
                required
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
              <Box sx={{ display: "flex", alignItems: "center", px: 1.5, borderRadius: "12px", bgcolor: "var(--ct-subtle-bg)", minHeight: 56 }}>
                <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14 }}>
                  Joins as <Box component="strong" sx={{ color: "var(--ct-text-primary)", fontWeight: 600 }}>{employmentLabel(row.employment_type)}</Box>
                </Typography>
              </Box>
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
            variant="contained"
            onClick={handleSendInvites}
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
        title="Invite link for favourite locums"
        audience={`Share it with locums and Shift Heroes you'd like on ${pharmacyName || "this pharmacy"}'s favourites. You review every application first.`}
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
