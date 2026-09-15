import React, { useRef } from "react";
import { Alert, Box, Button, CircularProgress, FormControlLabel, Switch, Typography } from "@mui/material";
import PeopleIcon from "@mui/icons-material/People";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import { useAuth } from '../../../../contexts/AuthContext';
import ListAltIcon from "@mui/icons-material/ListAlt";
import SettingsIcon from "@mui/icons-material/Settings";
import { MembershipDTO, PharmacyAdminDTO, PharmacyDTO, surface } from "./types";
import { alpha, useTheme } from "@mui/material/styles";
import StaffManager from "./StaffManager";
import LocumManager from "./LocumManager";
import PharmacyAdmins from "./PharmacyAdmins";
import { useNavigate } from "react-router-dom";

const DASHBOARD_FONT_FAMILY = '"DM Sans Variable", "DM Sans", "Barlow", Arial, sans-serif';
const DASHBOARD_INK = "#06123A";
const DASHBOARD_MUTED = "#5E6B8D";

function IconButtonCard({
  title,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const theme = useTheme();
  const tokens = surface(theme);
  return (
    <Box
      onClick={onClick}
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: { xs: "16px", md: "20px" },
        border: `1px solid #E5ECF7`,
        background: tokens.bg,
        cursor: onClick ? "pointer" : "default",
        boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
        ":hover": onClick
          ? {
              transform: { xs: "none", md: "translateY(-4px)" },
              boxShadow: "0 18px 42px rgba(6, 18, 58, 0.12)",
              borderColor: alpha("#063BDA", 0.18),
            }
          : undefined,
      }}
    >
      <Box sx={{ display: "flex", gap: { xs: 1.5, md: 2.25 }, alignItems: "flex-start", minWidth: 0 }}>
        <Box
          sx={{
            width: { xs: 52, md: 60 },
            height: { xs: 52, md: 60 },
            borderRadius: { xs: "14px", md: "18px" },
            bgcolor: "#ECE9FF",
            color: DASHBOARD_INK,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            "& svg": { fontSize: { xs: 28, md: 32 } },
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: DASHBOARD_INK, fontWeight: 950, fontSize: { xs: 20, md: 22 }, lineHeight: 1.12, overflowWrap: "anywhere" }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ mt: 0.75, color: DASHBOARD_MUTED, fontWeight: 800, lineHeight: 1.4, overflowWrap: "anywhere" }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

interface OwnerPharmacyDetailPageProps {
  pharmacy: PharmacyDTO;
  staffMemberships: MembershipDTO[];
  locumMemberships: MembershipDTO[];
  adminAssignments: PharmacyAdminDTO[];
  pendingAdminMemberships?: MembershipDTO[];
  onMembershipsChanged: () => void;
  onEditPharmacy?: (pharmacy: PharmacyDTO) => void;
  membershipsLoading?: boolean;
  autoPublishWorkerRequests?: boolean;
  onToggleAutoPublishWorkerRequests?: (nextValue: boolean) => Promise<void> | void;
  autoPublishSaving?: boolean;
  autoPublishError?: string;
}

export default function OwnerPharmacyDetailPage({
  pharmacy,
  staffMemberships,
  locumMemberships,
  adminAssignments,
  pendingAdminMemberships = [],
  onMembershipsChanged,
  onEditPharmacy,
  membershipsLoading = false,
  autoPublishWorkerRequests = false,
  onToggleAutoPublishWorkerRequests,
  autoPublishSaving = false,
  autoPublishError = "",
}: OwnerPharmacyDetailPageProps) {
  const theme = useTheme();
  const tokens = surface(theme);
  const navigate = useNavigate();
  const { activePersona, activeAdminPharmacyId } = useAuth();
  const scopedPharmacyId =
    activePersona === "admin" && typeof activeAdminPharmacyId === "number"
      ? activeAdminPharmacyId
      : null;
  const adminBasePath = scopedPharmacyId != null ? `/dashboard/admin/${scopedPharmacyId}` : null;
  const resolvePath = (suffix: string) =>
    adminBasePath ? `${adminBasePath}/${suffix}` : `/dashboard/owner/${suffix}`;
  const staffSectionRef = useRef<HTMLDivElement>(null);
  const locumSectionRef = useRef<HTMLDivElement>(null);
  const adminsSectionRef = useRef<HTMLDivElement>(null);

  const scrollTo = (ref: { current: HTMLElement | null }) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleManageStaff = () => scrollTo(staffSectionRef);
  const handleManageLocums = () => scrollTo(locumSectionRef);
  const handleManageAdmins = () => scrollTo(adminsSectionRef);
  const handleCheckShifts = () => navigate(resolvePath("shift-center"));
  const handlePostShift = () => navigate(resolvePath("post-shift"));
  const handleFavouriteLocums = () => handleManageLocums();
  const handleConfigurations = () => {
    if (onEditPharmacy) {
      onEditPharmacy(pharmacy);
      return;
    }
    navigate(resolvePath("manage-pharmacies/my-pharmacies"));
  };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: "none",
        mx: "auto",
        px: { xs: 0, sm: 1.5, md: 2, xl: 3 },
        py: { xs: 2, md: 3 },
        color: DASHBOARD_INK,
        fontFamily: DASHBOARD_FONT_FAMILY,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: { md: "flex-end" },
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: { xs: 30, md: 42 }, lineHeight: 1.04, fontWeight: 950, color: DASHBOARD_INK, overflowWrap: "anywhere" }}>
            {pharmacy.name}
          </Typography>
          <Typography sx={{ mt: 1, color: DASHBOARD_MUTED, fontSize: { xs: 16, md: 18 }, fontWeight: 800, lineHeight: 1.45, overflowWrap: "anywhere" }}>
            {[pharmacy.street_address, pharmacy.suburb, pharmacy.state, pharmacy.postcode].filter(Boolean).join(", ")}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, width: { xs: "100%", md: "auto" } }}>
          <Button
            variant="outlined"
            onClick={() => (onEditPharmacy ? onEditPharmacy(pharmacy) : navigate(resolvePath("manage-pharmacies/my-pharmacies")))}
            sx={{
              minHeight: 44,
              px: 2.25,
              borderRadius: "12px",
              borderColor: alpha("#063BDA", 0.16),
              color: "#4C0DDE",
              fontWeight: 900,
              "&:hover": {
                borderColor: "#063BDA",
                bgcolor: alpha("#063BDA", 0.04),
              },
            }}
          >
            Edit
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          mt: 3,
          display: "grid",
          gap: { xs: 1.5, md: 2 },
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" },
        }}
      >
        <IconButtonCard title="Manage Staff" subtitle="Add/remove team" icon={<PeopleIcon />} onClick={handleManageStaff} />
        <IconButtonCard title="Check Shifts" subtitle="Roster & history" icon={<CalendarMonthIcon />} onClick={handleCheckShifts} />
        <IconButtonCard title="Favourite Locums" subtitle="Quick-pick shortlist" icon={<StarOutlineIcon />} onClick={handleFavouriteLocums} />
        <IconButtonCard title="Admins" subtitle="Assign scoped admins" icon={<ManageAccountsIcon />} onClick={handleManageAdmins} />
        <IconButtonCard title="Post Shift" subtitle="Publish an open shift" icon={<ListAltIcon />} onClick={handlePostShift} />
        <IconButtonCard title="Configurations" subtitle="Hours, details, rates" icon={<SettingsIcon />} onClick={handleConfigurations} />
      </Box>

      <Box sx={{ mt: 3 }} ref={staffSectionRef}>
        <Box
          sx={{
            mb: 3,
            p: { xs: 2.25, md: 3 },
            borderRadius: { xs: "18px", md: "22px" },
            border: `1px solid #E5ECF7`,
            background: tokens.bg,
            boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: 2,
              alignItems: { md: "center" },
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography sx={{ mb: 0.75, color: DASHBOARD_INK, fontSize: { xs: 22, md: 26 }, fontWeight: 950, lineHeight: 1.12 }}>
                Staff Request Publishing
              </Typography>
              <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, maxWidth: 720, fontWeight: 800, fontSize: { xs: 15, md: 16 }, lineHeight: 1.45 }}>
                Allow pharmacy staff shift cover requests and swap requests to be published to your team automatically?
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {autoPublishSaving ? <CircularProgress size={20} /> : null}
              <FormControlLabel
                control={
                  <Switch
                    checked={autoPublishWorkerRequests}
                    onChange={(_, checked) => onToggleAutoPublishWorkerRequests?.(checked)}
                    disabled={!onToggleAutoPublishWorkerRequests || autoPublishSaving}
                  />
                }
                label={autoPublishWorkerRequests ? "Enabled" : "Disabled"}
                sx={{ m: 0 }}
              />
            </Box>
          </Box>
          {autoPublishError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {autoPublishError}
            </Alert>
          ) : null}
        </Box>

        <Typography sx={{ mb: 1.5, color: DASHBOARD_INK, fontSize: { xs: 24, md: 30 }, fontWeight: 950, lineHeight: 1.12 }}>
          Staff
        </Typography>
        <StaffManager
          pharmacyId={pharmacy.id}
          memberships={staffMemberships}
          onMembershipsChanged={onMembershipsChanged}
          pharmacyName={pharmacy.name}
          loading={membershipsLoading}
        />
      </Box>

      <Box sx={{ mt: 3 }} ref={locumSectionRef}>
        <Typography sx={{ mb: 1.5, color: DASHBOARD_INK, fontSize: { xs: 24, md: 30 }, fontWeight: 950, lineHeight: 1.12 }}>
          Favourite Locums
        </Typography>
        <LocumManager
          pharmacyId={pharmacy.id}
          memberships={locumMemberships}
          onMembershipsChanged={onMembershipsChanged}
          pharmacyName={pharmacy.name}
          loading={membershipsLoading}
        />
      </Box>

      <Box sx={{ mt: 3 }} ref={adminsSectionRef}>
        <PharmacyAdmins
          pharmacyId={pharmacy.id}
          admins={adminAssignments}
          pendingAdminMemberships={pendingAdminMemberships}
          onAdminsChanged={onMembershipsChanged}
          loading={membershipsLoading}
        />
      </Box>
    </Box>
  );
}


