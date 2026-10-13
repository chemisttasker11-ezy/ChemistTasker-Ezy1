// The worker's Shift Centre: Confirmed. Shifts the worker is booked for, with the pharmacy's address and documents.
import { useEffect, useState } from "react";
import { Box, Snackbar } from "@mui/material";
import { fetchMyConfirmedShifts, type Shift } from "@chemisttasker/shared-core";
import PageHeader from "../../../components/ui/PageHeader";
import { STAFF_SECTION_COPY, StaffShiftCentreTabs } from "../shiftCenter/StaffShiftCentreTabs";
import { ACTION_ICONS, PharmacyDetailsDialog, WorkerBookedShiftBoard } from "../shiftCenter/WorkerBookedShifts";
import { RowAction } from "../shiftCenter/ShiftCentreParts";

export default function MyConfirmedShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pharmacy, setPharmacy] = useState<Shift["pharmacyDetail"] | null>(null);

  useEffect(() => {
    fetchMyConfirmedShifts()
      .then(setShifts)
      .catch(() => setError("We could not load your confirmed shifts. Try again in a moment."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <PageHeader title="Shift Centre" subtitle={STAFF_SECTION_COPY.confirmed}>
        <StaffShiftCentreTabs value="confirmed" />
      </PageHeader>
      <WorkerBookedShiftBoard mode="confirmed" shifts={shifts} loading={loading}
        actions={shift => (
          <RowAction kind="primary" startIcon={ACTION_ICONS.details} disabled={!shift.pharmacyDetail} onClick={() => setPharmacy(shift.pharmacyDetail)}>
            Pharmacy details
          </RowAction>
        )} />
      <PharmacyDetailsDialog pharmacy={pharmacy ?? null} onClose={() => setPharmacy(null)} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError("")} message={error} />
    </Box>
  );
}
