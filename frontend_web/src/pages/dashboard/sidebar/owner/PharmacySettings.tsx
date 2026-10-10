import {
  Box,
  Button,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import {
  Pencil
} from "lucide-react";

import { SettingRow } from "./pharmacyDetailParts";

type SettingsProps = {
  hidden: boolean;
  autoPublishWorkerRequests: boolean; autoPublishSaving: boolean; autoPublishError: string; onToggleAutoPublishWorkerRequests?: (enabled: boolean) => void | Promise<void>;
  payrollEnabled: boolean; payrollReady: boolean; payrollLoadError: string; payrollSaving: boolean; payrollSaveError: string;
  handlePayrollToggle: (enabled: boolean) => Promise<void>; retryPayroll: () => void; editPharmacy: () => void;
};
export default function PharmacySettings({ hidden, autoPublishWorkerRequests, autoPublishSaving, autoPublishError, onToggleAutoPublishWorkerRequests, payrollEnabled, payrollReady, payrollLoadError, payrollSaving, payrollSaveError, handlePayrollToggle, retryPayroll, editPharmacy }: SettingsProps) {
  return (
      <Box hidden={hidden} role="tabpanel" id="pharmacy-tab-settings" aria-labelledby="pharmacy-tab-btn-settings">
        <Stack spacing={3}>
          {[
            {
              title: "Shift requests",
              text: "Decide whether staff cover and swap requests reach the team straight away.",
              body: (
                <SettingRow
                  title="Publish staff requests automatically"
                  description="When on, shift-cover and swap requests from your staff go to the team without waiting for you."
                  checked={autoPublishWorkerRequests}
                  busy={autoPublishSaving}
                  disabled={!onToggleAutoPublishWorkerRequests}
                  onChange={(next) => void onToggleAutoPublishWorkerRequests?.(next)}
                  note={autoPublishWorkerRequests ? "Requests go straight to the team. You still see every one in the Shift Centre." : "You approve each request before the team sees it."}
                  error={autoPublishError}
                />
              ),
            },
            {
              title: "Payroll",
              text: "Optional. Run pay through ChemistTasker, or keep your current payroll system.",
              body: (
                <SettingRow
                  title="Use ChemistTasker Payroll"
                  description="Keep it off while you use your current payroll system. Staff can still be invited, rostered, clocked and timesheeted without Award classifications or ChemistTasker pay rates."
                  checked={payrollEnabled}
                  loading={!payrollReady && !payrollLoadError}
                  busy={payrollSaving}
                  onChange={(next) => void handlePayrollToggle(next)}
                  note={
                    payrollEnabled
                      ? "Payroll needs dated employment terms for TFN staff: employment type, Award classification, Award or above-award rates, and agreed part-time hours where they apply. Workers also add their TFN and super fund before payroll runs. ABN workers keep invoicing."
                      : "Timesheet-only mode. Direct staff need no Award classification or pay rates here. Approved timesheets can go to your existing payroll."
                  }
                  error={payrollLoadError || payrollSaveError}
                  onRetry={payrollLoadError ? retryPayroll : undefined}
                />
              ),
            },
            {
              title: "Pharmacy details",
              text: "Address, opening hours, ABN, default rates and documents workers see.",
              body: (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} justifyContent="space-between" sx={{ p: 2.25 }}>
                  <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14 }}>Update these whenever your hours or rates change.</Typography>
                  <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={editPharmacy} sx={{ minHeight: 40, flexShrink: 0 }}>
                    Edit pharmacy details
                  </Button>
                </Stack>
              ),
            },
          ].map((group) => (
            <Box key={group.title} sx={{ display: "grid", gap: { xs: 1.25, md: 3 }, gridTemplateColumns: { xs: "1fr", md: "260px minmax(0, 1fr)" } }}>
              <Box>
                <Typography component="h2" sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 16 }}>{group.title}</Typography>
                <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14, mt: 0.5 }}>{group.text}</Typography>
              </Box>
              <Paper variant="outlined" sx={{ borderRadius: "var(--ct-card-radius)", borderColor: "var(--ct-border-color)", bgcolor: "var(--ct-surface-bg)", boxShadow: "none" }}>
                {group.body}
              </Paper>
            </Box>
          ))}
        </Stack>
      </Box>
  );
}
