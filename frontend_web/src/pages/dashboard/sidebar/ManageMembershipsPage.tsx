import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Check, LogOut, ShieldCheck, Store, X } from "lucide-react";
import PageHeader from "../../../components/ui/PageHeader";
import IconTile from "../../../components/ui/IconTile";
import DashboardContentState from "../../../components/dashboard/DashboardContentState";
import { Pill } from "../../../components/ui/Pill";
import { type StatusTone } from "../../../components/ui/tone";
import apiClient from "../../../utils/apiClient";
import { getPendingPharmacyAdminInvitations, respondToPharmacyAdminInvitation } from "@chemisttasker/shared-core";
import { useAuth } from "../../../contexts/AuthContext";
import { useAhpra } from "../../../contexts/AhpraContext";

type AdminInvitation = {
  id: number;
  membership_id: number;
  pharmacy_name: string;
  admin_level: string;
  job_title?: string;
  membership_status: string;
};

type Membership = {
  id: number;
  role: string;
  employment_type: string;
  job_title?: string;
  staff_category?: string;
  is_pharmacy_owner?: boolean;
  is_pharmacy_admin?: boolean;
  admin_level_label?: string | null;
  admin_capabilities?: string[];
  capabilities?: string[];
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "LEFT";
  created_at: string;
  pharmacy_detail?: {
    id: number;
    name: string;
    email?: string | null;
    suburb?: string | null;
    state?: string | null;
    postcode?: string | null;
    organization?: { id: number; name: string } | null;
  };
  invited_by_details?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
};

function label(value?: string | null) {
  return value ? value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "Not set";
}

function inviterName(membership: Membership) {
  const user = membership.invited_by_details;
  const fullName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();
  return fullName || user?.email || "Pharmacy admin";
}

function adminCapabilitiesText(membership: Membership) {
  const capabilities = membership.admin_capabilities || membership.capabilities || [];
  if (!capabilities.length) return "";
  return `Capabilities: ${capabilities.map((capability) => capability.replace(/_/g, " ").toLowerCase()).join(", ")}`;
}

const STATUS: Record<Membership["status"], { label: string; tone: StatusTone; hint: string; order: number }> = {
  PENDING: { label: "Waiting for you", tone: "amber", hint: "Accept to join this pharmacy's team.", order: 0 },
  ACCEPTED: { label: "Active", tone: "green", hint: "You're a member of this pharmacy.", order: 1 },
  REJECTED: { label: "Declined", tone: "neutral", hint: "You declined this invitation.", order: 2 },
  LEFT: { label: "Left", tone: "neutral", hint: "You left this pharmacy.", order: 3 },
};

const cardSx = { p: { xs: 2, md: 2.5 }, borderRadius: "var(--ct-card-radius)", border: "1px solid var(--ct-border-color)", boxShadow: "none" };
const nameSx = { fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 19, lineHeight: 1.25, color: "var(--ct-text-primary)", overflowWrap: "anywhere" } as const;
const metaSx = { color: "text.secondary", fontSize: 13.5, mt: 0.5 } as const;
const busyIcon = (busy: boolean, icon: ReactNode) => (busy ? <CircularProgress size={16} color="inherit" /> : icon);

export default function ManageMembershipsPage() {
  const { setUser } = useAuth();
  const { refresh: refreshAhpra } = useAhpra();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [adminInvitations, setAdminInvitations] = useState<AdminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [quitTarget, setQuitTarget] = useState<Membership | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadMemberships = async () => {
    setLoading(true);
    try {
      const [{ data }, invitations] = await Promise.all([
        apiClient.get("/my-memberships/"),
        getPendingPharmacyAdminInvitations(),
      ]);
      setMemberships(Array.isArray(data) ? data : data?.results || []);
      setAdminInvitations(Array.isArray(invitations) ? invitations : []);
      setActionError(null);
      setLoadFailed(false);
    } catch (error: any) {
      setActionError(error?.response?.data?.detail || "Unable to load memberships.");
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMemberships();
  }, []);

  const refreshUser = async () => {
    const { data } = await apiClient.get('/users/me/');
    setUser(data);
  };

  const respondToAdmin = async (invitation: AdminInvitation, accept: boolean) => {
    setActingId(invitation.id);
    try {
      await respondToPharmacyAdminInvitation(invitation.id, accept);
      await Promise.all([loadMemberships(), refreshUser(), refreshAhpra()]);
    } catch (error: any) {
      setActionError(error?.response?.data?.detail || 'Unable to respond to this admin invitation.');
    } finally {
      setActingId(null);
    }
  };

  const runAction = async (membership: Membership, action: "accept" | "reject" | "quit") => {
    setActingId(membership.id);
    try {
      await apiClient.post(`/my-memberships/${membership.id}/${action}/`);
      await Promise.all([loadMemberships(), refreshUser(), refreshAhpra()]);
      setQuitTarget(null);
    } catch (error: any) {
      setActionError(error?.response?.data?.detail || `Unable to ${action} membership.`);
    } finally {
      setActingId(null);
    }
  };

  const sorted = [...memberships].sort((a, b) => STATUS[a.status].order - STATUS[b.status].order);
  const waitingCount = memberships.filter((m) => m.status === "PENDING").length + adminInvitations.filter((i) => !memberships.some((m) => m.id === i.membership_id && m.status === "PENDING")).length;
  const showLoadError = loadFailed && memberships.length === 0 && adminInvitations.length === 0;

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <PageHeader title="Memberships" subtitle="Answer pharmacy invitations and manage the pharmacies you belong to.">
        {!loading && !showLoadError && waitingCount > 0 && (
          <Pill tone="amber" label={`${waitingCount} waiting for your answer`} />
        )}
      </PageHeader>

      {actionError && !showLoadError && (
        <Alert severity="error" onClose={() => setActionError(null)}>{actionError}</Alert>
      )}

      {adminInvitations.map((invitation) => {
        const busy = actingId === invitation.id;
        return (
          <Paper key={`admin-${invitation.id}`} sx={{ ...cardSx, borderColor: "var(--ct-status-amber-fg)" }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} justifyContent="space-between">
              <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
                <IconTile icon={<ShieldCheck size={22} />} />
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography component="h2" sx={nameSx}>{invitation.pharmacy_name}</Typography>
                    <Pill tone="amber" label="Admin invitation" title="Accepting gives you admin access to this pharmacy." />
                  </Stack>
                  <Typography sx={{ ...metaSx, color: "text.primary" }}>
                    {label(invitation.admin_level)} admin{invitation.job_title ? ` · ${invitation.job_title}` : ""}
                  </Typography>
                  <Typography sx={metaSx}>
                    {invitation.membership_status === "ACCEPTED" ? "Your current membership stays active while you decide." : "Accepting gives you both membership and admin access."}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} flexShrink={0}>
                <Button variant="contained" disabled={busy} startIcon={busyIcon(busy, <Check size={18} />)} onClick={() => respondToAdmin(invitation, true)} sx={{ minHeight: 44 }}>
                  Accept admin access
                </Button>
                <Button variant="outlined" color="error" disabled={busy} startIcon={<X size={18} />} onClick={() => respondToAdmin(invitation, false)} sx={{ minHeight: 44 }}>
                  Decline
                </Button>
              </Stack>
            </Stack>
          </Paper>
        );
      })}

      {loading && memberships.length === 0 ? (
        <DashboardContentState kind="loading" title="Loading your memberships…" />
      ) : showLoadError ? (
        <DashboardContentState
          kind="error"
          title="We couldn't load your memberships"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void loadMemberships()}
        />
      ) : memberships.length === 0 ? (
        <DashboardContentState
          kind="empty"
          icon={<Store size={26} />}
          title="No memberships yet"
          description="When a pharmacy owner or admin invites you, the invitation appears here for you to accept."
        />
      ) : (
        <Stack spacing={1.5} aria-busy={loading}>
          {sorted.map((membership) => {
            const pharmacy = membership.pharmacy_detail;
            const status = STATUS[membership.status] ?? STATUS.LEFT;
            const isPending = membership.status === "PENDING";
            const isAccepted = membership.status === "ACCEPTED";
            const busy = actingId === membership.id;
            const hasAdminInvitation = adminInvitations.some((invitation) => invitation.membership_id === membership.id);
            const capabilitiesText = adminCapabilitiesText(membership);
            return (
              <Paper key={membership.id} sx={{ ...cardSx, ...(isPending ? { borderColor: "var(--ct-status-amber-fg)" } : {}) }}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
                  <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
                    <IconTile icon={<Store size={22} />} />
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography component="h2" sx={nameSx}>{pharmacy?.name || "Pharmacy"}</Typography>
                        <Pill tone={status.tone} label={status.label} title={status.hint} />
                      </Stack>
                      <Typography sx={{ ...metaSx, color: "text.primary" }}>
                        {membership.is_pharmacy_admin
                          ? `Admin · ${membership.admin_level_label || "Admin"}`
                          : `${label(membership.role)} · ${label(membership.employment_type)}`}
                        {membership.job_title ? ` · ${membership.job_title}` : ""}
                      </Typography>
                      {membership.is_pharmacy_admin && capabilitiesText ? <Typography sx={metaSx}>{capabilitiesText}</Typography> : null}
                      <Typography sx={metaSx}>
                        {[pharmacy?.suburb, pharmacy?.state, pharmacy?.postcode].filter(Boolean).join(", ") || "Address not provided"}
                        {" · "}Invited by {inviterName(membership)}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap flexShrink={0}>
                    {isPending && !hasAdminInvitation && (
                      <>
                        <Button variant="contained" startIcon={busyIcon(busy, <Check size={18} />)} disabled={busy} onClick={() => runAction(membership, "accept")} sx={{ minHeight: 44 }}>
                          Accept
                        </Button>
                        <Button variant="outlined" color="error" startIcon={<X size={18} />} disabled={busy} onClick={() => runAction(membership, "reject")} sx={{ minHeight: 44 }}>
                          Decline
                        </Button>
                      </>
                    )}
                    {isPending && hasAdminInvitation && <Typography variant="body2" color="text.secondary">Answer the admin invitation above.</Typography>}
                    {isAccepted && !membership.is_pharmacy_owner && membership.role !== "OWNER" && (
                      <Button variant="outlined" color="error" startIcon={<LogOut size={18} />} disabled={busy} onClick={() => setQuitTarget(membership)} sx={{ minHeight: 44 }}>
                        Leave pharmacy
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Dialog open={Boolean(quitTarget)} onClose={quitTarget && actingId === quitTarget.id ? undefined : () => setQuitTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Leave {quitTarget?.pharmacy_detail?.name || "this pharmacy"}?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            You can't undo this. To join again, the owner or an admin will need to invite you again.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuitTarget(null)} disabled={Boolean(quitTarget && actingId === quitTarget.id)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={!quitTarget || actingId === quitTarget.id}
            startIcon={quitTarget && actingId === quitTarget.id ? <CircularProgress size={16} color="inherit" /> : undefined}
            onClick={() => quitTarget && runAction(quitTarget, "quit")}
          >
            Leave pharmacy
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
