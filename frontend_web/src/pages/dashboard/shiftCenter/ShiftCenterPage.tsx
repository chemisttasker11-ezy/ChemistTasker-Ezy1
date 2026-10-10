import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box } from "@mui/material";
import { CircleCheck, History, Play } from "lucide-react";
import PageHeader from "../../../components/ui/PageHeader";
import SegmentTabs, { tabPanelProps } from "../../../components/ui/SegmentTabs";
import ActiveShiftsPage from "../sidebar/ActiveShiftsPage";
import ConfirmedShiftsPage from "../sidebar/ConfirmedShiftsPage";
import HistoryShiftsPage from "../sidebar/HistoryShiftsPage";
import AdminActiveShiftsPage from "../admin/AdminActiveShiftsPage";
import AdminConfirmedShiftsPage from "../admin/AdminConfirmedShiftsPage";
import AdminHistoryShiftsPage from "../admin/AdminHistoryShiftsPage";

type Section = "active" | "confirmed" | "history";
const ALL_SECTIONS: Section[] = ["active", "confirmed", "history"];

type Scope = "owner" | "organization" | "admin";

type BaseProps = {
  scope: Scope;
  basePath: string;
  title: string;
  subtitle: string;
};

function ShiftCenterLayout({ scope, basePath, title, subtitle }: BaseProps) {
  const navigate = useNavigate();
  const params = useParams<{ section?: string }>();

  const currentSection: Section = useMemo(() => {
    if (params.section && ALL_SECTIONS.includes(params.section as Section)) {
      return params.section as Section;
    }
    return "active";
  }, [params.section]);

  useEffect(() => {
    if (!params.section || !ALL_SECTIONS.includes(params.section as Section)) {
      navigate(`${basePath}/active`, { replace: true });
    }
  }, [params.section, basePath, navigate]);

  const handleTabChange = (value: Section) => {
    if (value === currentSection) {
      return;
    }
    navigate(`${basePath}/${value}`);
  };

  const SectionComponent = useMemo(() => {
    if (scope === "admin") {
      switch (currentSection) {
        case "confirmed":
          return AdminConfirmedShiftsPage;
        case "history":
          return AdminHistoryShiftsPage;
        case "active":
        default:
          return AdminActiveShiftsPage;
      }
    }
    switch (currentSection) {
      case "confirmed":
        return ConfirmedShiftsPage;
      case "history":
        return HistoryShiftsPage;
      case "active":
      default:
        return ActiveShiftsPage;
    }
  }, [scope, currentSection]);

  const tabItems = useMemo(() => [
    {
      value: "active" as Section,
      label: "Active",
      icon: <Play />,
    },
    {
      value: "confirmed" as Section,
      label: "Confirmed",
      icon: <CircleCheck />,
    },
    {
      value: "history" as Section,
      label: "History",
      icon: <History />,
    },
  ], []);

  return (
    <Box sx={{ width: "100%", maxWidth: 1600, minWidth: 0, mx: "auto", overflowX: "hidden" }}>
      <PageHeader title={title} subtitle={subtitle}>
        <SegmentTabs label="Shift Centre sections" idPrefix="shift-centre" tabs={tabItems} value={currentSection} onChange={handleTabChange} />
      </PageHeader>
      <Box {...tabPanelProps("shift-centre", currentSection)} sx={{ minWidth: 0, maxWidth: "100%", "&:focus-visible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 4, borderRadius: 2 } }}>
        <SectionComponent />
      </Box>
    </Box>
  );
}

export function OwnerShiftCenterPage() {
  return (
    <ShiftCenterLayout
      scope="owner"
      basePath="/dashboard/owner/shift-center"
      title="Shift Centre"
      subtitle="Fill open shifts, check who is booked and look back at past shifts across your pharmacies."
    />
  );
}

export function OrganizationShiftCenterPage() {
  return (
    <ShiftCenterLayout
      scope="organization"
      basePath="/dashboard/organization/shift-center"
      title="Shift Centre"
      subtitle="Fill open shifts and check coverage across your organisation's pharmacies."
    />
  );
}

export function AdminShiftCenterPage() {
  const params = useParams<{ pharmacyId: string; section?: string }>();
  const pharmacyId = params.pharmacyId;

  if (!pharmacyId) {
    return null;
  }

  const basePath = `/dashboard/admin/${pharmacyId}/shift-center`;

  return (
    <ShiftCenterLayout
      scope="admin"
      basePath={basePath}
      title="Shift Centre"
      subtitle="Fill open shifts and check who is booked at this pharmacy."
    />
  );
}

