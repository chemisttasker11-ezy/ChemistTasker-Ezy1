import { useState } from "react";
import { Box, Button, Menu, MenuItem, Typography, useTheme } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import StoreIcon from "@mui/icons-material/Store";
import PublicIcon from "@mui/icons-material/Public";
import { DNA } from "./shellModel";
import type { useDashboardWorkspaceScope } from "./useDashboardWorkspaceScope";

type Scope = ReturnType<typeof useDashboardWorkspaceScope>;
export default function DashboardPharmacySelector({ scope }: { scope: Scope }) {
  const { selectedPharmacy, pharmacies, selectedPharmacyId, isOrgUser, workspace, canUsePlatformWorkspace, canUseInternal, handleSelectPlatform, handleSelectPharmacy, handleSelectAllOrganizationPharmacies } = scope;
  const [workspaceAnchor, setWorkspaceAnchor] = useState<HTMLElement | null>(null);
  const isDark = useTheme().palette.mode === "dark";
  return (

            <>
              <Button
                onClick={(event) => setWorkspaceAnchor(event.currentTarget)}
                aria-label={`Select pharmacy workspace. ${selectedPharmacy?.name ?? "No pharmacy selected"}. ${pharmacies.length} locations available`}
                aria-expanded={Boolean(workspaceAnchor)}
                aria-haspopup="menu"
                startIcon={selectedPharmacy ? <StoreIcon /> : <PublicIcon />}
                endIcon={<KeyboardArrowDownIcon />}
                sx={{
                  height: { xs: 48, md: 58 },
                  minWidth: 0,
                  width: { xs: 176, sm: 220, md: 260, lg: 250, xl: 300 },
                  maxWidth: "100%",
                  flexShrink: 1,
                  justifyContent: "flex-start",
                  borderRadius: { xs: "14px", md: "18px" },
                  border: "1px solid var(--ct-border-color)",
                  bgcolor: "var(--ct-surface-bg)",
                  px: { xs: 1.25, md: 2 },
                  textTransform: "none",
                  boxShadow: "0 4px 16px rgba(6,18,58,0.05)",
                }}
              >
                <Box sx={{ minWidth: 0, textAlign: "left" }}>
                  <Typography noWrap title={selectedPharmacy?.name ?? undefined} sx={{ fontSize: { xs: 12, md: 14 }, fontWeight: 900, color: "var(--ct-text-primary)" }}>
                    {selectedPharmacy?.name ?? (isOrgUser && workspace === "internal" ? "All organization pharmacies" : "ChemistTasker Platform")}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: { xs: 10, md: 12 }, fontWeight: 700, color: "var(--ct-text-secondary)" }}>
                    {selectedPharmacy ? "Selected pharmacy scope" : isOrgUser && workspace === "internal" ? "Combined organization scope" : "Public platform workspace"}
                  </Typography>
                </Box>
              </Button>
              <Menu anchorEl={workspaceAnchor} open={Boolean(workspaceAnchor)} onClose={() => setWorkspaceAnchor(null)}
                MenuListProps={{ "aria-label": "Available pharmacy workspaces" }}
                slotProps={{ paper: { sx: { width: { xs: "min(94vw, 390px)", sm: 410 }, maxWidth: "94vw", maxHeight: "min(66dvh, 520px)", borderRadius: 2.5, boxShadow: "0 16px 40px rgba(6,18,58,.14)" } } }}>
                {isOrgUser && <MenuItem onClick={() => { handleSelectAllOrganizationPharmacies(); setWorkspaceAnchor(null); }}>
                  <StoreIcon sx={{ mr: 1.5, color: DNA.blue }} /> All organization pharmacies
                </MenuItem>}
                {canUsePlatformWorkspace && canUseInternal && (
                  <MenuItem onClick={() => { handleSelectPlatform(); setWorkspaceAnchor(null); }}>
                    <PublicIcon sx={{ mr: 1.5, color: isDark ? "#C8B5FF" : DNA.violet }} /> ChemistTasker Platform
                  </MenuItem>
                )}
                <Box component="li" role="presentation" sx={{ listStyle: "none", px: 2, pt: 1.25, pb: 0.5 }}>
                  <Typography sx={{ color: "#445474", fontWeight: 850, fontSize: 12, letterSpacing: ".04em" }}>
                    {pharmacies.length} {pharmacies.length === 1 ? "pharmacy" : "pharmacies"} available
                  </Typography>
                </Box>
                {pharmacies.map((pharmacy) => (
                  <MenuItem key={pharmacy.id} selected={selectedPharmacyId === pharmacy.id} onClick={() => { handleSelectPharmacy(pharmacy.id); setWorkspaceAnchor(null); }}
                    sx={{ gap: 1.5, py: 1.25, px: 2, whiteSpace: "normal", alignItems: "flex-start", borderRadius: 1, mx: 0.75, "&.Mui-selected": { bgcolor: "#F0ECFC" } }}>
                    <StoreIcon sx={{ flexShrink: 0, mt: 0.35, color: "#5222B8" }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontWeight: 800, color: "#06123A", fontSize: 14, overflowWrap: "anywhere" }}>{pharmacy.name}</Typography>
                      <Typography sx={{ fontSize: 12.5, color: "#445474" }}>{pharmacy.helper ?? "Accessible pharmacy"}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Menu>
            </>

  );
}
