import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Typography,
} from "@mui/material";
import AuthLayout from "../layouts/AuthLayout";
import PublicLogoTopBar from "../components/PublicLogoTopBar";
import TalentBoard from "./dashboard/sidebar/TalentBoard";
import { getPublicTalentFeed, normalizePublicTalentPost } from "@chemisttasker/shared-core";
import { loadAllTalentPages } from "./dashboard/sidebar/TalentBoard/hooks/loadAllTalentPages";
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
      const res: any = await loadAllTalentPages((page) => getPublicTalentFeed({ page, page_size: 200 }));
      const list = Array.isArray(res) ? res : Array.isArray(res?.results) ? res.results : [];
      const mapped = list.map(normalizePublicTalentPost);
      // A shared QR reference opens only the matching published, public talent listing.
      const requestedRef = new URLSearchParams(window.location.search).get('reference_code');
      setPosts(requestedRef ? mapped.filter((post: any) => post.referenceCode === requestedRef) : mapped);
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
