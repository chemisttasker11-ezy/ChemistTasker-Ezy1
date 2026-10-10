import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link as RouterLink } from "@/public/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import { useAuth } from "../contexts/AuthContext";
import AuthLayout from "../layouts/AuthLayout";
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
  const { user } = useAuth();
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
    const origin = window.location.origin;
    const url = `${origin}/organization/${org?.slug ?? slug ?? ""}`.replace(/\/$/, "") || `${origin}/`;
    if (loading) {
      setPageMeta("Organization | ChemistTasker", "Explore public organization profiles and open pharmacy shifts on ChemistTasker.");
      setCanonical(url);
      return;
    }
    if (error) {
      setPageMeta("Organization Not Found | ChemistTasker", "This organization profile is unavailable. Browse public shifts on ChemistTasker.");
      setCanonical(url);
      return;
    }
    if (org) {
      const summary = org.about?.replace(/\s+/g, " ").trim() || "";
      const description = summary
        ? `${summary.slice(0, 260)}${summary.length > 260 ? "..." : ""}`
        : `Explore open shifts posted by ${org.name} on ChemistTasker.`;
      const image = org.cover_image_url || `${origin}/assets/pharmacist-rahul.jpg`;
      setPageMeta(`${org.name} | ChemistTasker`, description);
      setCanonical(url);
      setSocialMeta({ title: `${org.name} | ChemistTasker`, description, url, image, type: "organization" });
    }
  }, [loading, error, org, slug]);

  const heroImage = useMemo(() => org?.cover_image_url ?? null, [org]);

  const handleViewJobs = () => {
    if (org) navigate(`/shifts/public-board?organization=${org.id}`);
  };

  return (
    <AuthLayout title={org?.name || "Organization"} maxWidth={false} noCard showTitle={false}>
      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
        {loading ? (
          <Stack spacing={2.5} aria-label="Loading organization">
            <Skeleton variant="rounded" height={300} sx={{ borderRadius: 4 }} />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2.5 }}>
              <Skeleton variant="rounded" height={190} sx={{ borderRadius: 4 }} />
              <Skeleton variant="rounded" height={190} sx={{ borderRadius: 4 }} />
            </Box>
          </Stack>
        ) : error ? (
          <NotFoundPage />
        ) : org ? (
          <Stack spacing={2.5}>
            <Box
              sx={{
                position: "relative",
                minHeight: { xs: 280, md: 360 },
                borderRadius: 4,
                overflow: "hidden",
                display: "flex",
                alignItems: "flex-end",
                p: { xs: 3, md: 5 },
                color: "#fff",
                boxShadow: "0 24px 64px rgba(6,18,58,.12)",
                background: heroImage
                  ? `linear-gradient(105deg,rgba(6,18,58,.86) 0%,rgba(82,34,184,.58) 58%,rgba(0,189,210,.24) 100%),url("${heroImage}") center/cover no-repeat`
                  : "radial-gradient(circle at 82% 22%,rgba(0,189,210,.28),transparent 30%),linear-gradient(135deg,#061B54 0%,#5222B8 60%,#B20FA6 100%)",
              }}
            >
              <Box sx={{ maxWidth: 760, position: "relative" }}>
                <Chip
                  icon={<BusinessOutlinedIcon />}
                  label="Public organisation profile"
                  sx={{ bgcolor: "rgba(255,255,255,.14)", color: "#fff", "& .MuiChip-icon": { color: "#fff" } }}
                />
                <Typography variant="h2" component="h1" sx={{ mt: 2.25, color: "#fff", fontSize: { xs: 38, md: 56 } }}>
                  {org.name}
                </Typography>
                <Typography sx={{ mt: 1.5, color: "rgba(255,255,255,.82)", fontSize: { xs: 14.5, md: 16 }, lineHeight: 1.7 }}>
                  Explore this organisation and move directly to the public pharmacy opportunities it has chosen to publish.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mt: 3 }}>
                  <Button variant="contained" color="inherit" startIcon={<WorkOutlineIcon />} onClick={handleViewJobs} sx={{ color: "#5222B8" }}>
                    View this organisation&apos;s shifts
                  </Button>
                  <Button
                    variant="outlined"
                    color="inherit"
                    component={RouterLink}
                    to={user ? "/dashboard" : "/register"}
                    sx={{ color: "#fff", borderColor: "rgba(255,255,255,.45)" }}
                  >
                    {user ? "Open my dashboard" : "Join ChemistTasker"}
                  </Button>
                </Stack>
              </Box>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1.15fr) minmax(280px,.85fr)" }, gap: 2.5 }}>
              <Card>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h4">About {org.name}</Typography>
                  <Typography color="text.secondary" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.8, mt: 1.5 }}>
                    {org.about || "This organization will share more details soon."}
                  </Typography>
                </CardContent>
              </Card>

              <Card sx={{ bgcolor: "#F7F9FC" }}>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h5">Looking for work?</Typography>
                  <Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.7 }}>
                    The shift board keeps the full filter, availability and application journey in one place. This profile only narrows the board to opportunities from {org.name}.
                  </Typography>
                  <Button onClick={handleViewJobs} endIcon={<WorkOutlineIcon />} sx={{ mt: 2, px: 0 }}>
                    Browse matching public shifts
                  </Button>
                </CardContent>
              </Card>
            </Box>
          </Stack>
        ) : null}
      </Container>
    </AuthLayout>
  );
}
