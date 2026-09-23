import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Box,
  Button,
  Typography,
} from "@mui/material";
import AuthLayout from "../layouts/AuthLayout";
import PublicLogoTopBar from "../components/PublicLogoTopBar";
import TalentBoard from "./dashboard/sidebar/TalentBoard";
import { getPublicTalentFeed } from "@chemisttasker/shared-core";
import { setCanonical, setPageMeta, setSocialMeta } from "../utils/seo";

export default function PublicTalentBoardPage() {
  const [posts, setPosts] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginReason, setLoginReason] = useState<"like" | "calendar" | "booking" | null>(null);

  useEffect(() => {
    const title = "Find Talent | ChemistTasker";
    const description = "Browse pharmacist and pharmacy staff talent profiles on ChemistTasker.";
    const origin = window.location.origin;
    const canonicalUrl = `${origin}/talent/public-board`;
    const image = `${origin}/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png`;

    setPageMeta(title, description);
    setCanonical(canonicalUrl);
    setSocialMeta({
      title,
      description,
      url: canonicalUrl,
      image,
      type: "website",
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await getPublicTalentFeed({ page: 1, page_size: 200 });
      const list = Array.isArray(res) ? res : Array.isArray(res?.results) ? res.results : [];
      const mapped = list.map((post: any) => ({
        ...post,
        authorUserId: post.author_user_id ?? post.authorUserId ?? null,
        roleTitle: post.role_title ?? post.roleTitle ?? null,
        roleCategory: post.role_category ?? post.roleCategory ?? null,
        workTypes: post.work_types ?? post.workTypes ?? null,
        postKind: post.post_kind ?? post.postKind ?? null,
        coverageRadiusKm: post.coverage_radius_km ?? post.coverageRadiusKm ?? null,
        openToTravel: post.open_to_travel ?? post.openToTravel ?? null,
        availabilityMode: post.availability_mode ?? post.availabilityMode ?? null,
        availabilitySummary: post.availability_summary ?? post.availabilitySummary ?? null,
        availabilityDays: post.availability_days ?? post.availabilityDays ?? null,
        availabilityNotice: post.availability_notice ?? post.availabilityNotice ?? null,
        locationState: post.location_state ?? post.locationState ?? null,
        locationSuburb: post.location_suburb ?? post.locationSuburb ?? null,
        locationPostcode: post.location_postcode ?? post.locationPostcode ?? null,
        referenceCode: post.reference_code ?? post.referenceCode ?? null,
        explorerRoleType: post.explorer_role_type ?? post.explorerRoleType ?? null,
        explorerUserId: post.explorer_user_id ?? post.explorerUserId ?? null,
        explorerProfileId: post.explorer_profile ?? post.explorerProfile ?? null,
        ratingAverage: post.rating_average ?? post.ratingAverage ?? null,
        ratingCount: post.rating_count ?? post.ratingCount ?? null,
      }));
      setPosts(mapped);
    } catch (err: any) {
      setError(err?.message || "Failed to load talent feed.");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openLoginDialog = useCallback((reason?: "like" | "calendar" | "booking") => {
    setLoginReason(reason || null);
    setLoginDialogOpen(true);
  }, []);

  const closeLoginDialog = useCallback(() => {
    setLoginDialogOpen(false);
    setLoginReason(null);
  }, []);

  const dialogTitle =
    loginReason === "like"
      ? "Log in to like talent"
      : loginReason === "calendar" || loginReason === "booking"
        ? "Log in to view availability"
        : "Log in to continue";

  const dialogMessage =
    loginReason === "like"
      ? "You need an account to like profiles and keep track of candidates."
      : loginReason === "calendar" || loginReason === "booking"
        ? "You need an account to view candidate availability and request bookings."
        : "You need an account to contact talent, view profiles, or save preferences.";

  return (
    <>
      <PublicLogoTopBar />
      <AuthLayout title="Find Talent" maxWidth={false} noCard showTitle={false}>
        <Box sx={{ px: { xs: 2, lg: 3 }, pt: 3 }}>
          <Box
            component="section"
            aria-labelledby="public-talent-board-title"
            sx={{
              maxWidth: 1440,
              mx: 'auto',
              mb: { xs: 2.5, md: 3.5 },
              p: { xs: 2.5, sm: 3.5, md: 4.5 },
              borderRadius: { xs: 3, md: 4 },
              color: '#fff',
              background: 'linear-gradient(135deg, #04142E 0%, #06214A 58%, #0D3F78 100%)',
              boxShadow: '0 18px 46px rgba(6,33,74,0.16)',
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: '.14em', opacity: .78 }}>
              OWNER · DEEP NAVY
            </Typography>
            <Typography id="public-talent-board-title" component="h1" sx={{ mt: 1, fontSize: { xs: 30, md: 44 }, lineHeight: 1.08, fontWeight: 900 }}>
              Find pharmacy people, not another pile of CVs.
            </Typography>
            <Typography sx={{ mt: 1.5, maxWidth: 780, fontSize: { xs: 15, md: 17 }, lineHeight: 1.55, color: 'rgba(255,255,255,.9)' }}>
              Browse pharmacy talent by professional role, location and availability, then move into the ChemistTasker workflow when there is a fit.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2.5 }}>
              {['Profession', 'Location', 'Availability', 'Work preferences'].map((label) => (
                <Box key={label} component="span" sx={{ px: 1.25, py: .7, borderRadius: 999, bgcolor: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', fontSize: 12, fontWeight: 800 }}>
                  {label}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
        <TalentBoard
          publicMode
          externalPosts={posts}
          externalLoading={loading}
          externalError={error}
          onRequireLogin={openLoginDialog}
        />

        <Dialog open={loginDialogOpen} onClose={closeLoginDialog}>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" color="text.secondary">
              {dialogMessage}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeLoginDialog}>Cancel</Button>
            <Button component={RouterLink} to="/register" variant="outlined">
              Create account
            </Button>
            <Button component={RouterLink} to="/login" variant="contained">
              Log in
            </Button>
          </DialogActions>
        </Dialog>
      </AuthLayout>
    </>
  );
}
