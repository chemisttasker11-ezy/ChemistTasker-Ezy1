// src/pages/dashboard/sidebar/owner/OwnerPharmaciesPage.tsx
import { Box, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import DomainIcon from "@mui/icons-material/Domain";
import { PharmacyDTO, surface } from "./types";
import { alpha, useTheme } from "@mui/material/styles";

export default function OwnerPharmaciesPage({
  pharmacies,
  staffCounts,
  onOpenPharmacy,
  onOpenAdmins: _onOpenAdmins,
  onEditPharmacy,
  onDeletePharmacy,
}: {
  pharmacies: PharmacyDTO[];
  staffCounts: Record<string, number>;
  onOpenPharmacy: (pharmacyId: string) => void;
  onOpenAdmins?: (pharmacyId: string) => void;
  onEditPharmacy?: (pharmacy: PharmacyDTO) => void;
  onDeletePharmacy?: (pharmacyId: string) => void;
}) {
  const t = useTheme();
  const s = surface(t);

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: "none",
        mx: "auto",
        px: { xs: 0, sm: 1.5, md: 2, xl: 3 },
        py: { xs: 2, md: 3 },
        fontFamily: '"DM Sans Variable", "DM Sans", "Barlow", Arial, sans-serif',
      }}
    >
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: { xs: 1.5, md: 2.25 } }}>
        {pharmacies.map((p) => {
          const address = [p.street_address, p.suburb].filter(Boolean).join(", ");
          return (
            <Card
              key={p.id}
              variant="outlined"
              sx={{
                minWidth: 0,
                background: s.bg,
                borderColor: alpha("#E5ECF7", 0.95),
                borderRadius: { xs: "16px", md: "20px" },
                boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
                "&:hover": {
                  transform: { xs: "none", md: "translateY(-4px)" },
                  boxShadow: "0 18px 42px rgba(6, 18, 58, 0.12)",
                  borderColor: alpha(t.palette.primary.main, 0.18),
                },
              }}
            >
              <CardContent
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "auto minmax(0, 1fr)", md: "auto minmax(0, 1fr) auto" },
                  gap: 2,
                  alignItems: "flex-start",
                  p: { xs: 2, md: 3 },
                  "&:last-child": {
                    pb: { xs: 2, md: 3 },
                  },
                }}
              >
                <Box
                  sx={{
                    width: { xs: 52, md: 60 },
                    height: { xs: 52, md: 60 },
                    borderRadius: { xs: "14px", md: "18px" },
                    bgcolor: "#E7F0FF",
                    color: "#063BDA",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    boxShadow: `inset 0 1px 0 ${alpha("#FFFFFF", 0.8)}`,
                    "& svg": {
                      fontSize: { xs: 28, md: 32 },
                    },
                  }}
                >
                  <DomainIcon />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ color: "#06123A", fontWeight: 950, fontSize: { xs: 20, md: 22 }, lineHeight: 1.12, overflowWrap: "anywhere" }}>
                    {p.name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#5E6B8D", fontWeight: 800, mt: 0.75, lineHeight: 1.45 }}>
                    {address}, {p.state} {p.postcode}
                  </Typography>
                  {!!staffCounts[p.id] && (
                    <Typography variant="caption" sx={{ display: "block", color: "#5E6B8D", fontWeight: 800, mt: 1 }}>
                      Staff: {staffCounts[p.id]}
                    </Typography>
                  )}
                </Box>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  flexWrap="wrap"
                  sx={{
                    gridColumn: { xs: "1 / -1", md: "auto" },
                    justifyContent: { xs: "flex-end", md: "flex-start" },
                  }}
                >
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => onOpenPharmacy(p.id)}
                    sx={{
                      minHeight: 38,
                      px: 1.75,
                      borderRadius: 999,
                      borderColor: alpha("#063BDA", 0.2),
                      color: "#063BDA",
                      fontWeight: 900,
                      "&:hover": {
                        borderColor: "#063BDA",
                        bgcolor: alpha("#063BDA", 0.04),
                      },
                    }}
                  >
                    Open
                  </Button>
                  {onEditPharmacy && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onEditPharmacy(p)}
                      sx={{
                        minHeight: 38,
                        px: 1.75,
                        borderRadius: 999,
                        borderColor: alpha("#6D28D9", 0.2),
                        color: "#6D28D9",
                        fontWeight: 900,
                        "&:hover": {
                          borderColor: "#6D28D9",
                          bgcolor: alpha("#6D28D9", 0.04),
                        },
                      }}
                    >
                      Edit
                    </Button>
                  )}
                  {onDeletePharmacy && (
                    <Button
                      color="error"
                      size="small"
                      onClick={() => onDeletePharmacy(p.id)}
                      sx={{ minHeight: 38, px: 1.25, borderRadius: 999, fontWeight: 900 }}
                    >
                      Delete
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}
