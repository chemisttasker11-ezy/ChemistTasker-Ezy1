import {
  Box,
  Button,
  Stack,
  Typography
} from "@mui/material";
import {
  Mail,
  Pencil
} from "lucide-react";
import React from "react";
import { Pill } from "../../../../components/ui/Pill";
import SectionCard from "../../../../components/ui/SectionCard";

/** Optional extras the pharmacy record carries (hours, ABN, rates). Every field is optional. */
export type PharmacyProfileExtras = Partial<{
  email: string | null;
  abn: string;
  abn_verified: boolean | null;
  abn_entity_name: string | null;
  default_rate_type: string | null;
  default_fixed_rate: string | null;
  [key: string]: unknown;
}>;

const DAYS: { key: string; label: string; fallback?: string }[] = [
  { key: "monday", label: "Mon", fallback: "weekdays" },
  { key: "tuesday", label: "Tue", fallback: "weekdays" },
  { key: "wednesday", label: "Wed", fallback: "weekdays" },
  { key: "thursday", label: "Thu", fallback: "weekdays" },
  { key: "friday", label: "Fri", fallback: "weekdays" },
  { key: "saturdays", label: "Sat" },
  { key: "sundays", label: "Sun" },
  { key: "public_holidays", label: "Public holidays" },
];
const fmtTime = (value: unknown) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return "";
  const h = Number(match[1]);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return match[2] === "00" ? `${hour} ${suffix}` : `${hour}:${match[2]} ${suffix}`;
};
const hoursFor = (p: PharmacyProfileExtras | undefined, day: (typeof DAYS)[number]) => {
  if (!p) return "";
  if (p[`${day.key}_closed`]) return "Closed";
  let start = fmtTime(p[`${day.key}_start`]);
  let end = fmtTime(p[`${day.key}_end`]);
  if ((!start || !end) && day.fallback) {
    start = fmtTime(p[`${day.fallback}_start`]);
    end = fmtTime(p[`${day.fallback}_end`]);
  }
  return start && end ? `${start} – ${end}` : "";
};
const RATE_LABELS: Record<string, string> = {
  FIXED: "Fixed rate",
  FLEXIBLE: "Flexible rate",
  PHARMACIST_PROVIDED: "Pharmacist sets the rate",
};


export default function PharmacyProfileCard({ profile, editPharmacy }: { profile?: PharmacyProfileExtras; editPharmacy: () => void }) {
  const abnVerified = Boolean(profile?.abn_verified);
  const rateLabel = profile?.default_rate_type ? RATE_LABELS[String(profile.default_rate_type)] ?? "" : "";
  const fixedRate = profile?.default_rate_type === "FIXED" && profile?.default_fixed_rate ? `$${profile.default_fixed_rate}/hr` : "";
  const weekHours = DAYS.map((d) => ({ ...d, hours: hoursFor(profile, d) })).filter((d) => d.hours);

  return (<Box sx={{ gridArea: "profile", minWidth: 0 }}>
            <SectionCard dense title="Pharmacy profile" action={<Button size="small" startIcon={<Pencil size={14} />} onClick={editPharmacy}>Edit</Button>}>
              <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) minmax(0, 1fr)" } }}>
              <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                {profile?.email ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Mail size={16} color="var(--ct-text-secondary)" aria-hidden="true" />
                    <Typography noWrap sx={{ color: "var(--ct-text-primary)", fontSize: 14 }}>{String(profile.email)}</Typography>
                  </Stack>
                ) : null}
                {profile?.abn ? (
                  <Box>
                    <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 12.5 }}>ABN</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography sx={{ color: "var(--ct-text-primary)", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{String(profile.abn)}</Typography>
                      <Pill label={abnVerified ? "Verified" : "Not verified"} tone={abnVerified ? "green" : "amber"} />
                    </Stack>
                    {profile.abn_entity_name ? <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 13 }}>{String(profile.abn_entity_name)}</Typography> : null}
                  </Box>
                ) : null}
                {rateLabel ? (
                  <Box>
                    <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 12.5 }}>Default shift rate</Typography>
                    <Typography sx={{ color: "var(--ct-text-primary)", fontSize: 14 }}>{[rateLabel, fixedRate].filter(Boolean).join(" · ")}</Typography>
                  </Box>
                ) : null}
              </Stack>
                {weekHours.length ? (
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 12.5, mb: 0.5 }}>Opening hours</Typography>
                    <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.25 }}>
                      {weekHours.map((d) => (
                        <React.Fragment key={d.key}>
                          <Typography component="dt" sx={{ color: "var(--ct-text-secondary)", fontSize: 13.5 }}>{d.label}</Typography>
                          <Typography component="dd" sx={{ m: 0, color: d.hours === "Closed" ? "var(--ct-text-secondary)" : "var(--ct-text-primary)", fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{d.hours}</Typography>
                        </React.Fragment>
                      ))}
                    </Box>
                  </Box>
                ) : null}
              </Box>
                {!profile?.email && !profile?.abn && !rateLabel && !weekHours.length ? (
                  <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14 }}>
                    Add opening hours, ABN and a default rate so workers know what to expect.
                  </Typography>
                ) : null}
            </SectionCard>
          </Box>);
}
