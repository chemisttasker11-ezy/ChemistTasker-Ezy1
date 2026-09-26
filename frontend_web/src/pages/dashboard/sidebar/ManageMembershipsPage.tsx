import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import StoreIcon from "@mui/icons-material/Store";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import LogoutIcon from "@mui/icons-material/Logout";
import apiClient from "../../../utils/apiClient";
import { getPendingPharmacyAdminInvitations, respondToPharmacyAdminInvitation } from "@chemisttasker/shared-core";
import { useAuth } from "../../../contexts/AuthContext";

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

export default function ManageMembershipsPage() {
  const { setUser } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [adminInvitations, setAdminInvitations] = useState<AdminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [quitTarget, setQuitTarget] = useState<Membership | null>(null);

  const loadMemberships = async () => {
    setLoading(true);
    try {
      const [{ data }, invitations] = await Promise.all([
        apiClient.get("/client-profile/my-memberships/"),
        getPendingPharmacyAdminInvitations(),
      ]);
      setMemberships(Array.isArray(data) ? data : data?.results || []);
      setAdminInvitations(Array.isArray(invitations) ? invitations : []);
      setActionError(null);
    } catch (error: any) {
      setActionError(error?.response?.data?.detail || "Unable to load memberships.");
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
      await Promise.all([loadMemberships(), refreshUser()]);
    } catch (error: any) {
      setActionError(error?.response?.data?.detail || 'Unable to respond to this admin invitation.');
    } finally {
      setActingId(null);
    }
  };

  const runAction = async (membership: Membership, action: "accept" | "reject" | "quit") => {
    setActingId(membership.id);
    try {
      await apiClient.post(`/client-profile/my-memberships/${membership.id}/${action}/`);
      await Promise.all([loadMemberships(), refreshUser()]);
      setQuitTarget(null);
    } catch (error: any) {
      setActionError(error?.response?.data?.detail || `Unable to ${action} membership.`);
    } finally {
      setActingId(null);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 2.5 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 950, color: "var(--ct-dashboard-title)" }}>
          Manage Memberships
        </Typography>
        <Typography sx={{ mt: 0.5, color: "var(--ct-dashboard-muted)", fontWeight: 700 }}>
          Review pharmacy invitations and manage the pharmacies you belong to.
        </Typography>
      </Box>

      {actionError && <Alert severity="error">{actionError}</Alert>}

      {adminInvitations.map((invitation) => (
        <Paper key={`admin-${invitation.id}`} sx={{ p: 2.5, borderRadius: 3, border: '1px solid var(--ct-border-color)' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="h6" fontWeight={800}>{invitation.pharmacy_name}</Typography>
              <Typography color="text.secondary">
                {label(invitation.admin_level)} admin invitation{invitation.job_title ? ` · ${invitation.job_title}` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">{invitation.membership_status === 'ACCEPTED' ? 'Your current pharmacy membership stays active while you decide.' : 'Accepting grants both pharmacy membership and admin access.'}</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" disabled={actingId === invitation.id} onClick={() => respondToAdmin(invitation, true)}>Accept admin access</Button>
              <Button variant="outlined" color="error" disabled={actingId === invitation.id} onClick={() => respondToAdmin(invitation, false)}>Decline</Button>
            </Stack>
          </Stack>
        </Paper>
      ))}

      {loading ? (
        <Paper sx={{ p: 4, borderRadius: 3, textAlign: "center" }}>
          <CircularProgress />
        </Paper>
      ) : memberships.length === 0 ? (
        <Paper sx={{ p: 4, borderRadius: 3, border: "1px solid var(--ct-border-color)" }}>
          <Typography sx={{ fontWeight: 900 }}>No memberships yet</Typography>
          <Typography sx={{ color: "var(--ct-dashboard-muted)", mt: 0.5 }}>
            Pharmacy invitations will appear here when an owner or admin invites you.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {memberships.map((membership) => {
            const pharmacy = membership.pharmacy_detail;
            const isPending = membership.status === "PENDING";
            const isAccepted = membership.status === "ACCEPTED";
            const hasAdminInvitation = adminInvitations.some((invitation) => invitation.membership_id === membership.id);
            const capabilitiesText = adminCapabilitiesText(membership);
            return (
              <Paper
                key={membership.id}
                sx={{
                  p: { xs: 2, md: 2.5 },
                  borderRadius: 3,
                  border: "1px solid var(--ct-border-color)",
                  boxShadow: "var(--ct-dashboard-card-shadow)",
                }}
              >
                <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
                  <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
                    <Box sx={{ width: 46, height: 46, borderRadius: 2, bgcolor: "var(--ct-dashboard-soft)", display: "grid", placeItems: "center", color: "var(--ct-dashboard-accent)", flexShrink: 0 }}>
                      <StoreIcon />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="h6" sx={{ fontWeight: 950 }}>
                          {pharmacy?.name || "Pharmacy"}
                        </Typography>
                        <Chip size="small" label={label(membership.status)} color={isPending ? "warning" : isAccepted ? "success" : "default"} />
                      </Stack>
                      <Typography sx={{ color: "var(--ct-dashboard-muted)", fontWeight: 700, mt: 0.25 }}>
                        {membership.is_pharmacy_admin
                          ? `Admin · ${membership.admin_level_label || "Admin"}`
                          : `${label(membership.role)} · ${label(membership.employment_type)}`}
                        {membership.job_title ? ` · ${membership.job_title}` : ""}
                      </Typography>
                      {membership.is_pharmacy_admin && capabilitiesText ? (
                        <Typography sx={{ color: "var(--ct-dashboard-muted)", fontSize: 13, mt: 0.5 }}>
                          {capabilitiesText}
                        </Typography>
                      ) : null}
                      <Typography sx={{ color: "var(--ct-dashboard-muted)", fontSize: 13, mt: 0.5 }}>
                        {[pharmacy?.suburb, pharmacy?.state, pharmacy?.postcode].filter(Boolean).join(", ") || "Address details not provided"}
                      </Typography>
                      <Typography sx={{ color: "var(--ct-dashboard-muted)", fontSize: 13, mt: 0.5 }}>
                        Invited by {inviterName(membership)}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    {isPending && !hasAdminInvitation && (
                      <>
                        <Button variant="contained" startIcon={<CheckCircleIcon />} disabled={actingId === membership.id} onClick={() => runAction(membership, "accept")}>
                          Accept
                        </Button>
                        <Button variant="outlined" color="error" startIcon={<CancelIcon />} disabled={actingId === membership.id} onClick={() => runAction(membership, "reject")}>
                          Reject
                        </Button>
                      </>
                    )}
                    {isPending && hasAdminInvitation && <Typography variant="body2" color="text.secondary">Respond to the admin invitation above.</Typography>}
                    {isAccepted && membership.role !== "OWNER" && (
                      <Button variant="outlined" color="error" startIcon={<LogoutIcon />} disabled={actingId === membership.id} onClick={() => setQuitTarget(membership)}>
                        Quit membership
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Dialog open={Boolean(quitTarget)} onClose={() => setQuitTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Quit membership?</DialogTitle>
        <DialogContent>
          <Typography>
            This action cannot be undone. If you want to join this pharmacy again, the owner or admin will need to invite you all over again.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuitTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={!quitTarget || actingId === quitTarget.id} onClick={() => quitTarget && runAction(quitTarget, "quit")}>
            Quit membership
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
