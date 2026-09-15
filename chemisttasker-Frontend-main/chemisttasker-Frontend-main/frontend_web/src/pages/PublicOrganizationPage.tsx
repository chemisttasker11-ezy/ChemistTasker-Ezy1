import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import AuthLayout from "../layouts/AuthLayout";
import PublicLogoTopBar from "../components/PublicLogoTopBar";
import { getPublicOrganization } from "@chemisttasker/shared-core";
import NotFoundPage from "./NotFoundPage";
import { setCanonical, setPageMeta, setSocialMeta } from "../utils/seo";

type PublicOrganization = {
  id: number;
  name: string;
  slug: string;
  about?: string | null;
  cover_image_url?: string | null;
};

export default function PublicOrganizationPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [org, setOrg] = useState<PublicOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setError("Organization not specified.");
      setLoading(false);
      return;
    }
    setLoading(true);
    getPublicOrganization(slug)
      .then((data: any) => {
        setOrg(data as PublicOrganization);
        setError(null);
      })
      .catch((err: any) => {
        setError(err?.message || "Organization not found.");
        setOrg(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (loading) {
      const title = "Organization | ChemistTasker";
      const description =
        "Explore public organization profiles and open pharmacy shifts on ChemistTasker.";
      const origin = window.location.origin;
      const url = `${origin}/organization/${slug ?? ""}`.replace(/\/$/, "") || `${origin}/`;
      const image = `${origin}/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png`;
      setPageMeta(title, description);
      setCanonical(url);
      setSocialMeta({ title, description, url, image, type: "website" });
      return;
    }

    if (error) {
      const title = "Organization Not Found | ChemistTasker";
      const description =
        "This organization profile is unavailable. Browse public shifts on ChemistTasker.";
      const origin = window.location.origin;
      const url = `${origin}/organization/${slug ?? ""}`.replace(/\/$/, "") || `${origin}/`;
      const image = `${origin}/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png`;
      setPageMeta(title, description);
      setCanonical(url);
      setSocialMeta({ title, description, url, image, type: "website" });
      return;
    }

    if (org) {
      const summary = org.about ? org.about.replace(/\s+/g, " ").trim() : "";
      const description = summary
        ? `${summary.slice(0, 260)}${summary.length > 260 ? "..." : ""}`
        : `Explore open shifts posted by ${org.name} on ChemistTasker.`;
      const title = `${org.name} | ChemistTasker`;
      const origin = window.location.origin;
      const url = `${origin}/organization/${org.slug}`;
      const image = org.cover_image_url || `${origin}/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png`;
      setPageMeta(title, description);
      setCanonical(url);
      setSocialMeta({ title, description, url, image, type: "organization" });
    }
  }, [loading, error, org, slug]);

  const heroImage = useMemo(() => {
    return org?.cover_image_url ?? null;
  }, [org]);

  const handleViewJobs = () => {
    if (!org) return;
    navigate(`/shifts/public-board?organization=${org.id}`);
  };

  return (
    <>
      <PublicLogoTopBar />
      <AuthLayout
        title={org?.name || "Organization"}
        maxWidth="xl"
        noCard
        showTitle={false}
      >
        <Container
          maxWidth="xl"
          sx={{
            py: { xs: 5, md: 8 },
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Box sx={{ width: "100%", maxWidth: 1200, px: { xs: 2, md: 0 } }}>
        {loading ? (
          <Stack spacing={3}>
            <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 3 }} />
            <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 3 }} />
            <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 3 }} />
          </Stack>
        ) : error ? (
          <NotFoundPage />
        ) : org ? (
          <Stack spacing={3}>
            <Box
              sx={{
                position: "relative",
                borderRadius: 3,
                overflow: "hidden",
                height: { xs: 260, md: 360 },
                boxShadow: "0 24px 60px rgba(0,0,0,0.08)",
                background: heroImage
                  ? `linear-gradient(120deg, rgba(0,169,157,0.25), rgba(0,0,0,0.35)), url(${heroImage}) center/cover no-repeat`
                  : "linear-gradient(120deg, #00a99d 0%, #006f66 100%)",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.22), transparent 30%), radial-gradient(circle at 80% 0%, rgba(255,255,255,0.18), transparent 25%)",
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  p: { xs: 3, md: 4 },
                  color: "#fff",
                  textShadow: "0 4px 12px rgba(0,0,0,0.25)",
                }}
              >
                <Typography variant="overline" sx={{ letterSpacing: 2, opacity: 0.9 }}>
                  Organization
                </Typography>
                <Typography variant="h3" fontWeight={700}>
                  {org.name}
                </Typography>
              </Box>
              </Box>

            <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
              <Card
                sx={{
                  flex: 1,
                  borderRadius: 3,
                  boxShadow: "0 18px 40px rgba(0,0,0,0.08)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <CardContent>
                  <Typography variant="h5" gutterBottom>
                    About {org.name}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                    {org.about || "This organization will share more details soon."}
                  </Typography>
                </CardContent>
              </Card>

              <Card
                sx={{
                  flex: 1,
                  borderRadius: 3,
                  boxShadow: "0 18px 40px rgba(0,0,0,0.06)",
                  background: "linear-gradient(120deg, #00a99d 0%, #00877d 100%)",
                  color: "#fff",
                }}
              >
                <CardContent>
                  <Typography variant="h5" gutterBottom fontWeight={700}>
                    Work with {org.name}
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2, opacity: 0.9 }}>
                    Explore open shifts posted by {org.name} and its pharmacies.
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <Button variant="contained" color="inherit" onClick={handleViewJobs} sx={{ color: "#006f66" }}>
                      View Public Job Board
                    </Button>
                    <Button variant="outlined" color="inherit" component={RouterLink} to="/register">
                      Join ChemistTasker
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </Stack>
        ) : null}
          </Box>
        </Container>
      </AuthLayout>
    </>
  );
}
