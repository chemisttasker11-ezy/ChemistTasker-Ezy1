import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
  Skeleton,
} from "@mui/material";
import FilterListIcon from "@mui/icons-material/FilterList";
import AddIcon from "@mui/icons-material/Add";
import LinkIcon from "@mui/icons-material/Link";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { alpha } from "@mui/material/styles";
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

const filterControlSx = {
  minWidth: { xs: "100%", sm: 220 },
  "& .MuiOutlinedInput-root": {
    borderRadius: "14px",
    bgcolor: "#FFFFFF",
    fontWeight: 800,
  },
};

const memberCardSx = {
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

const getRoleChipColor = (role: Role) => {
  switch (role) {
    case "PHARMACIST":
      return "success";
    case "TECHNICIAN":
      return "info";
    case "ASSISTANT":
      return "warning";
    case "INTERN":
      return "secondary";
    case "STUDENT":
      return "default";
    case "CONTACT":
      return "default";
    default:
      return "default";
  }
};

type Locum = {
  id: string | number;
  name: string;
  email?: string;
  role: Role;
  workType: WorkType;
};

type LocumManagerProps = {
  pharmacyId: string;
  memberships: MembershipDTO[];
  onMembershipsChanged: () => void;
  loading?: boolean;
  pharmacyName?: string;
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
}: LocumManagerProps) {
  const derivedLocums: Locum[] = useMemo(() => {
    return (memberships || []).filter(membershipIsAccepted).map((m) => {
      const fullName =
        m.invited_name ||
        m.name ||
        [m.user_details?.first_name, m.user_details?.last_name].filter(Boolean).join(" ") ||
        "Favourite";
      const email = m.user_details?.email || m.email;
      return {
        id: m.id,
        name: fullName,
        email,
        role: coerceRole(m.role),
        workType: coerceWorkType(m.employment_type),
      };
    });
  }, [memberships]);

  const [items, setItems] = useState<Locum[]>(derivedLocums);
  useEffect(() => setItems(derivedLocums), [derivedLocums]);

  const [sortBy, setSortBy] = useState<"name" | "workType">("name");
  const [filterRole, setFilterRole] = useState<Role | "ALL">("ALL");
  const [filterWork, setFilterWork] = useState<WorkType | "ALL">("ALL");

  const filteredLocums = useMemo(() => {
    const sorted = [...items].sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : -1));
    return sorted.filter(
      (locum) =>
        (filterRole === "ALL" || locum.role === filterRole) &&
        (filterWork === "ALL" || locum.workType === filterWork)
    );
  }, [items, sortBy, filterRole, filterWork]);

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
          setToast({ message: "Some invites were sent.", severity: "success" });
          onMembershipsChanged();
        }
        return;
      }
      setToast({ message: "Invites sent!", severity: "success" });
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
      setToast({ message: "Favourite removed", severity: "success" });
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
      const token = res?.token ?? res?.data?.token ?? res;
      const url = `${window.location.origin}/membership/apply/${token}`;
      setLinkValue(url);
      setToast({ message: "Favourite link generated", severity: "success" });
    } catch (error: any) {
      setToast({ message: error?.response?.data?.detail || "Failed to generate link.", severity: "error" });
    } finally {
      setLinkSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!linkValue) return;
    try {
      await navigator.clipboard.writeText(linkValue);
      setToast({ message: "Link copied to clipboard", severity: "success" });
      setLinkOpen(false);
    } catch {
      setToast({ message: "Unable to copy link.", severity: "error" });
    }
  };

  return (
    <Box sx={{ fontFamily: DASHBOARD_FONT_FAMILY }}>
      <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} sx={{ mb: 2.5, alignItems: { lg: "center" }, flexWrap: "wrap" }}>
        <Button
          variant="outlined"
          startIcon={<FilterListIcon />}
          onClick={() => setSortBy("name")}
          sx={{
            ...actionButtonSx,
            borderColor: alpha("#063BDA", 0.16),
            color: "#4C0DDE",
            "&:hover": { borderColor: "#063BDA", bgcolor: alpha("#063BDA", 0.04) },
          }}
        >
          Sort: Name
        </Button>
        <Button
          variant="outlined"
          startIcon={<FilterListIcon />}
          onClick={() => setSortBy("workType")}
          sx={{
            ...actionButtonSx,
            borderColor: alpha("#063BDA", 0.16),
            color: "#4C0DDE",
            "&:hover": { borderColor: "#063BDA", bgcolor: alpha("#063BDA", 0.04) },
          }}
        >
          Sort: Work Type
        </Button>
        <FormControl sx={filterControlSx}>
          <InputLabel id="role-filter">Filter role</InputLabel>
          <Select
            labelId="role-filter"
            label="Filter role"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as Role | "ALL")}
          >
            <MenuItem value="ALL">All roles</MenuItem>
            {ROLE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={filterControlSx}>
          <InputLabel id="work-type-filter">Filter work type</InputLabel>
          <Select
            labelId="work-type-filter"
            label="Filter work type"
            value={filterWork}
            onChange={(e) => setFilterWork(e.target.value as WorkType | "ALL")}
          >
            <MenuItem value="ALL">All types</MenuItem>
            {LOCUM_WORK_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {type.replace("_", " ")}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openInviteDialog}
          sx={{ ...actionButtonSx, boxShadow: "0 12px 28px rgba(20, 62, 234, 0.18)" }}
        >
          Invite Favourite
        </Button>
        <Button
          variant="outlined"
          startIcon={<LinkIcon />}
          onClick={openLinkDialog}
          sx={{
            ...actionButtonSx,
            borderColor: alpha("#063BDA", 0.16),
            color: "#4C0DDE",
            "&:hover": { borderColor: "#063BDA", bgcolor: alpha("#063BDA", 0.04) },
          }}
        >
          Generate Link
        </Button>
      </Stack>

      {showSkeleton ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
          {Array.from({ length: 3 }).map((_, index) => (
            <Card
              key={`locum-skeleton-${index}`}
              variant="outlined"
              sx={memberCardSx}
            >
              <CardContent sx={{ display: "flex", gap: 2, alignItems: "flex-start", p: { xs: 2, md: 2.5 } }}>
                <Skeleton variant="circular" width={40} height={40} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="80%" />
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="40%" />
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : filteredLocums.length === 0 ? (
        <Alert severity="info">No favourite locums yet. Use "Invite Favourite" to add people.</Alert>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
          {filteredLocums.map((locum) => (
            <Card
              key={locum.id}
              variant="outlined"
              sx={memberCardSx}
            >
              <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
                <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                    <Chip label={locum.role.replace("_", " ")} color={getRoleChipColor(locum.role)} sx={{ fontWeight: 800 }} />
                    <Chip label={locum.workType.replace("_", " ")} variant="outlined" sx={{ fontWeight: 800 }} />
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ minWidth: 0 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ color: DASHBOARD_INK, fontWeight: 950, fontSize: { xs: 20, md: 22 }, lineHeight: 1.2, overflowWrap: "anywhere" }}>
                        {locum.name}
                      </Typography>
                      {locum.email && (
                        <Typography sx={{ mt: 0.5, color: DASHBOARD_MUTED, fontWeight: 700, fontSize: 15, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                          {locum.email}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ flexShrink: 0 }}>
                      <Tooltip title="Remove favourite">
                        <span>
                          <IconButton
                            color="error"
                            onClick={() => setConfirmRemove(locum)}
                            disabled={deleteLoadingId === locum.id}
                            sx={{ border: `1px solid ${alpha("#EF4444", 0.18)}` }}
                          >
                            {deleteLoadingId === locum.id ? <CircularProgress size={16} /> : <DeleteOutlineIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Dialog
        open={Boolean(confirmRemove)}
        onClose={() => {
          if (!deleteLoadingId) setConfirmRemove(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Remove Favourite</DialogTitle>
        <DialogContent>
          <Typography>
            {confirmRemove
              ? `Remove ${confirmRemove.name} from your favourites? This action can't be undone.`
              : "This action can't be undone."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(null)} disabled={Boolean(deleteLoadingId)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => confirmRemove && handleRemoveMembership(confirmRemove.id)}
            disabled={Boolean(deleteLoadingId)}
          >
            {deleteLoadingId === confirmRemove?.id ? "Removing..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Invite Favourite Locums to {pharmacyName || pharmacyId}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          {inviteError ? <Alert severity="error">{inviteError}</Alert> : null}
          {inviteRows.map((row, idx) => (
            <Box
              key={idx}
              sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, pt: 1 }}
            >
              <TextField
                label="Full Name"
                value={row.invited_name}
                onChange={(e) => handleInviteFieldChange(idx, "invited_name", e.target.value)}
                fullWidth
                sx={inviteTextFieldSx}
              />
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
                <Select
                  labelId={`role-${idx}`}
                  label="Role"
                  value={row.role}
                  onChange={(e) => handleInviteFieldChange(idx, "role", e.target.value as Role)}
                >
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
              <Box sx={{ gridColumn: "span 2", minHeight: 20 }}>
                {row.checking ? (
                  <Typography variant="caption" color="text.secondary">
                    Checking existing account...
                  </Typography>
                ) : row.error ? (
                  <Typography variant="caption" color="error">
                    {row.error}
                  </Typography>
                ) : (
                  (() => {
                    const label = formatExistingUserRole(row.existingUserRole);
                    return label ? (
                      <Typography variant="caption" color="text.secondary">
                        {label}
                      </Typography>
                    ) : null;
                  })()
                )}
              </Box>
              <Box sx={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: 1 }}>
                {inviteRows.length > 1 && (
                  <Button color="error" onClick={() => removeInviteRow(idx)}>
                    Remove
                  </Button>
                )}
              </Box>
            </Box>
          ))}
          <Button onClick={addInviteRow}>Add another</Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSendInvites} disabled={inviteSubmitting}>
            {inviteSubmitting ? "Sending..." : "Send Invites"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Generate Favourite Link</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2, overflow: "visible" }}>
          <TextField
            label="Expiry (days)"
            type="number"
            value={linkExpiry}
            onChange={(e) => setLinkExpiry(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: 1, max: 90 }}
          />
          {linkValue && (
            <TextField label="Shareable link" value={linkValue} fullWidth InputProps={{ readOnly: true }} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkOpen(false)}>Close</Button>
          <Button onClick={handleGenerateLink} startIcon={<LinkIcon />} disabled={linkSubmitting}>
            {linkSubmitting ? "Generating..." : linkValue ? "Regenerate" : "Generate"}
          </Button>
          <Button onClick={handleCopyLink} startIcon={<ContentCopyIcon />} disabled={!linkValue}>
            Copy & Close
          </Button>
        </DialogActions>
      </Dialog>

      {toast && (
        <Snackbar
          open
          autoHideDuration={4000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: "100%" }}>
            {toast.message}
          </Alert>
        </Snackbar>
      )}

      <MembershipApplicationsPanel
        pharmacyId={pharmacyId}
        category="LOCUM_CASUAL"
        title="Pending Favourite Applications"
        allowedEmploymentTypes={Array.from(LOCUM_WORK_TYPES)}
        defaultEmploymentType="LOCUM"
        onApproved={onMembershipsChanged}
        onNotification={handleApplicationsNotification}
      />
      <PendingDirectInvitationsPanel
        memberships={memberships}
        title="Pending Favourite Invitations"
      />
    </Box>
  );
}
