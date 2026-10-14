// The worker's Shift Centre sections (pharmacist and Pharmacy team): one header and segmented tabs across the
// Public, Community, Confirmed and History pages, matching the owner Shift Centre. Each section keeps its own route.
import { useLocation, useNavigate } from "react-router-dom";
import SegmentTabs, { type SegmentTab } from "../../../components/ui/SegmentTabs";

export type StaffSection = "public" | "community" | "confirmed" | "history";

export const STAFF_SECTION_COPY: Record<StaffSection, string> = {
  public: "Open shifts from pharmacies across ChemistTasker. Save the ones you like and show interest in one tap.",
  community: "Shifts shared by the pharmacies and teams you belong to.",
  confirmed: "Shifts you are booked for, with the pharmacy's details and your locked rate.",
  history: "Shifts you have worked. Raise an invoice and rate the pharmacy.",
};

// Labels only: four tabs must fit a phone without truncating.
const TABS: SegmentTab<StaffSection>[] = [
  { value: "public", label: "Public" },
  { value: "community", label: "Community" },
  { value: "confirmed", label: "Confirmed" },
  { value: "history", label: "History" },
];

export function StaffShiftCentreTabs({ value }: { value: StaffSection }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  // /dashboard/pharmacist/shifts/public -> /dashboard/pharmacist/shifts; keeps the workspace query (scope) as it is.
  const base = /^(\/dashboard\/[a-z-]+(?:\/\d+)?\/shifts)/.exec(pathname)?.[1] ?? pathname.replace(/\/[^/]*$/, "");
  return (
    <SegmentTabs label="Shift Centre sections" idPrefix="staff-shift-centre" tabs={TABS} value={value}
      onChange={next => navigate(`${base}/${next}${search}`)} />
  );
}
