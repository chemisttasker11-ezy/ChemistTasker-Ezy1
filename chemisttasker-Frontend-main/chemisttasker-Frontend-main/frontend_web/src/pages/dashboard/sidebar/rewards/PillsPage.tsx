import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Pagination,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useParams } from "react-router-dom";
import apiClient from "../../../../utils/apiClient";

type PillBalance = {
  balance: number;
  shift_post_cost: number;
};

type PillLedgerEntry = {
  id: number;
  entry_type: string;
  source: string;
  delta: number;
  balance_after: number;
  description: string;
  rule_code?: string | null;
  referral_type?: string | null;
  shift_id?: number | null;
  created_at: string;
};

type PillReferralEvent = {
  id: number;
  referral_type: string;
  status: string;
  referred_user_email?: string | null;
  referred_email?: string | null;
  shift_id?: number | null;
  created_at: string;
};

const formatSource = (source: string) =>
  source
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const ACTIVITY_PAGE_SIZE = 10;

export default function PillsPage() {
  const theme = useTheme();
  const { pharmacyId } = useParams<{ pharmacyId?: string }>();
  const primary = theme.palette.primary.main;
  const [balance, setBalance] = useState<PillBalance | null>(null);
  const [entries, setEntries] = useState<PillLedgerEntry[]>([]);
  const [referrals, setReferrals] = useState<PillReferralEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [activityPage, setActivityPage] = useState(1);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setHistoryLoading(true);
    setReferralsLoading(true);

    apiClient
      .get("/client-profile/pill-rewards/balance/")
      .then((balanceRes) => {
        if (!mounted) return;
        setBalance({
          balance: Number(balanceRes.data?.balance ?? 0),
          shift_post_cost: Number(balanceRes.data?.shift_post_cost ?? 0),
        });
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.response?.data?.detail || err?.message || "Failed to load pill balance.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    apiClient
      .get("/client-profile/pill-rewards/history/")
      .then((historyRes) => {
        if (!mounted) return;
        const rawEntries = Array.isArray(historyRes.data?.results)
          ? historyRes.data.results
          : Array.isArray(historyRes.data)
            ? historyRes.data
            : [];
        setEntries(rawEntries);
      })
      .catch((err) => {
        if (!mounted) return;
        setHistoryError(err?.response?.data?.detail || err?.message || "Failed to load pill activity.");
      })
      .finally(() => {
        if (mounted) setHistoryLoading(false);
      });

    apiClient
      .get("/client-profile/pill-rewards/referrals/")
      .then((referralRes) => {
        if (!mounted) return;
        const rawReferrals = Array.isArray(referralRes.data?.results)
          ? referralRes.data.results
          : Array.isArray(referralRes.data)
            ? referralRes.data
            : [];
        setReferrals(rawReferrals);
      })
      .finally(() => {
        if (mounted) setReferralsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const earned = useMemo(
    () => entries.filter((entry) => entry.delta > 0).reduce((sum, entry) => sum + entry.delta, 0),
    [entries]
  );
  const spent = useMemo(
    () => Math.abs(entries.filter((entry) => entry.delta < 0).reduce((sum, entry) => sum + entry.delta, 0)),
    [entries]
  );
  const pendingReferrals = useMemo(
    () => referrals.filter((event) => event.status === "CLAIMED"),
    [referrals]
  );
  const sharedReferralLinks = useMemo(
    () => referrals.filter((event) => event.status === "PENDING" && !event.referred_user_email),
    [referrals]
  );
  const sharedShiftLinks = useMemo(
    () => sharedReferralLinks.filter((event) => event.referral_type === "SHIFT"),
    [sharedReferralLinks]
  );
  const sharedFriendLinks = useMemo(
    () => sharedReferralLinks.filter((event) => event.referral_type === "FRIEND"),
    [sharedReferralLinks]
  );
  const awardedReferrals = useMemo(
    () => referrals.filter((event) => event.status === "AWARDED"),
    [referrals]
  );
  const latestSharedLink = sharedReferralLinks[0];
  const activityPageCount = Math.ceil(entries.length / ACTIVITY_PAGE_SIZE);
  const visibleEntries = useMemo(
    () => entries.slice((activityPage - 1) * ACTIVITY_PAGE_SIZE, activityPage * ACTIVITY_PAGE_SIZE),
    [activityPage, entries]
  );

  useEffect(() => {
    if (activityPage > Math.max(activityPageCount, 1)) {
      setActivityPage(1);
    }
  }, [activityPage, activityPageCount]);

  return (
    <Box
      sx={{
        width: "100%",
        mx: "auto",
        maxWidth: 1200,
        px: { xs: 2, md: 4 },
        py: { xs: 2, md: 4 },
      }}
    >
      <Paper
        sx={{
          p: { xs: 3, md: 4 },
          minHeight: { xs: 280, md: 255 },
          borderRadius: 4,
          color: "#fff",
          background: `linear-gradient(135deg, ${alpha(primary, 0.98)}, ${alpha("#2563eb", 0.92)} 48%, ${alpha("#0ea5e9", 0.88)})`,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Grid container spacing={3} alignItems="center" sx={{ width: "100%", position: "relative", zIndex: 1 }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={2}>
              <Typography variant="overline" sx={{ letterSpacing: ".12em", opacity: 0.78 }}>
                Pill rewards
              </Typography>
              <Typography variant="h2" fontWeight={900} lineHeight={0.95}>
                {loading && !balance ? "Loading..." : `${balance?.balance ?? 0} pills`}
              </Typography>
              <Typography sx={{ maxWidth: 620, opacity: 0.92, fontSize: { md: 18 } }}>
                Track every pill earned from referrals and every pill spent when rewards are used for shift posting actions.
              </Typography>
              {pharmacyId ? (
                <Typography sx={{ maxWidth: 620, opacity: 0.82 }}>
                  Admin pharmacy context: Pharmacy #{pharmacyId}
                </Typography>
              ) : null}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Chip label={`${earned} earned`} sx={{ bgcolor: alpha("#ffffff", 0.18), color: "#fff", fontWeight: 700 }} />
                <Chip label={`${spent} spent`} sx={{ bgcolor: alpha("#ffffff", 0.18), color: "#fff", fontWeight: 700 }} />
                <Chip
                  label={`${balance?.shift_post_cost ?? 0} pills per shift post`}
                  sx={{ bgcolor: alpha("#ffffff", 0.18), color: "#fff", fontWeight: 700 }}
                />
              </Stack>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Box
              component="img"
              src="/images/drugs.png"
              alt=""
              sx={{
                display: "block",
                ml: { md: "auto" },
                width: { xs: 170, md: 230 },
                height: { xs: 170, md: 230 },
                objectFit: "contain",
                filter: `contrast(1.08) saturate(1.08) drop-shadow(0 24px 38px ${alpha("#111827", 0.24)})`,
              }}
            />
          </Grid>
        </Grid>
      </Paper>

      {error ? <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert> : null}
      {historyError ? <Alert severity="warning" sx={{ mt: 3 }}>{historyError}</Alert> : null}

      <Paper sx={{ mt: 3, borderRadius: 3, p: 2.5 }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" fontWeight={800}>
            Referral Pipeline
          </Typography>
          <Typography variant="body2" color="text.secondary">
            A quick summary of shared links, registrations waiting for verification, and completed rewards.
          </Typography>
        </Box>
        {referralsLoading ? (
          <Stack alignItems="center" sx={{ p: 4 }}>
            <CircularProgress size={24} />
          </Stack>
        ) : (
          <Grid container spacing={1.5}>
            {[
              ["Shift links shared", sharedShiftLinks.length],
              ["Friend links shared", sharedFriendLinks.length],
              ["Waiting verification", pendingReferrals.length],
              ["Rewards awarded", awardedReferrals.length],
            ].map(([label, value]) => (
              <Grid key={label} size={{ xs: 12, sm: 6, md: 3 }}>
                <Box
                  sx={{
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 2,
                    p: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.035),
                  }}
                >
                  <Typography variant="h5" fontWeight={900}>
                    {value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {label}
                  </Typography>
                </Box>
              </Grid>
            ))}
            <Grid size={{ xs: 12 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {latestSharedLink
                  ? `Latest shared link: ${
                      latestSharedLink.referral_type === "SHIFT" ? "shift" : "friend"
                    } referral${
                      latestSharedLink.shift_id ? ` for Shift #${latestSharedLink.shift_id}` : ""
                    }, created ${new Date(latestSharedLink.created_at).toLocaleString()}.`
                  : "No referral links have been created yet."}
              </Typography>
            </Grid>
          </Grid>
        )}
      </Paper>

      <Paper sx={{ mt: 3, borderRadius: 3, overflow: "hidden" }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" fontWeight={800}>
            Pending Referrals
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Registered referrals waiting for profile verification.
          </Typography>
        </Box>
        <Divider />
        {referralsLoading ? (
          <Stack alignItems="center" sx={{ p: 4 }}>
            <CircularProgress size={24} />
          </Stack>
        ) : pendingReferrals.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Typography fontWeight={700}>No pending referrals.</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              No registered referrals are waiting for verification.
            </Typography>
          </Box>
        ) : (
          <Stack divider={<Divider />}>
            {pendingReferrals.map((event) => (
              <Stack
                key={event.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                justifyContent="space-between"
                sx={{ p: 2.5 }}
              >
                <Stack spacing={0.5}>
                  <Typography fontWeight={800}>
                    {event.referral_type === "SHIFT" ? "Shift referral" : "Friend referral"}
                    {event.shift_id ? ` - Shift #${event.shift_id}` : ""}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {event.referred_user_email || event.referred_email || "Registered user waiting for verification"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Created {new Date(event.created_at).toLocaleString()}
                  </Typography>
                </Stack>
                <Chip label="waiting for verification" />
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>

      <Paper sx={{ mt: 3, borderRadius: 3, overflow: "hidden" }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" fontWeight={800}>
            Pill Activity
          </Typography>
          <Typography variant="body2" color="text.secondary">
            A readable ledger of each action that changed your pill balance.
          </Typography>
        </Box>
        <Divider />
        {historyLoading ? (
          <Stack alignItems="center" sx={{ p: 5 }}>
            <CircularProgress />
          </Stack>
        ) : entries.length === 0 ? (
          <Box sx={{ p: 4 }}>
            <Typography fontWeight={700}>No pill activity yet.</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Referrals and future pill payments will appear here.
            </Typography>
          </Box>
        ) : (
          <Stack divider={<Divider />}>
            {visibleEntries.map((entry) => (
              <Stack
                key={entry.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                justifyContent="space-between"
                sx={{ p: 2.5 }}
              >
                <Stack spacing={0.5}>
                  <Typography fontWeight={800}>{entry.description || formatSource(entry.source)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatSource(entry.source)}
                    {entry.shift_id ? ` - Shift #${entry.shift_id}` : ""}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(entry.created_at).toLocaleString()}
                  </Typography>
                </Stack>
                <Stack alignItems={{ xs: "flex-start", sm: "flex-end" }} spacing={0.5}>
                  <Typography fontWeight={900} color={entry.delta >= 0 ? "success.main" : "error.main"}>
                    {entry.delta >= 0 ? "+" : ""}
                    {entry.delta} pills
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Balance after: {entry.balance_after}
                  </Typography>
                </Stack>
              </Stack>
            ))}
            {entries.length > ACTIVITY_PAGE_SIZE ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
                <Pagination
                  count={activityPageCount}
                  page={activityPage}
                  onChange={(_, page) => setActivityPage(page)}
                  color="primary"
                />
              </Box>
            ) : null}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
