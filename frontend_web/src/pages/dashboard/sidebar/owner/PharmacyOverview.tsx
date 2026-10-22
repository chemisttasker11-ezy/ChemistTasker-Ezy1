import {
  Box,
  Button,
  Skeleton,
  Stack,
  Typography
} from "@mui/material";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ShieldCheck,
  Star,
  UserPlus,
  Users,
  Wallet
} from "lucide-react";
import React from "react";
import DashboardContentState from "../../../../components/dashboard/DashboardContentState";
import IconTile, { type Tone } from "../../../../components/ui/IconTile";
import SectionCard from "../../../../components/ui/SectionCard";

import type { TabKey } from "./OwnerPharmacyDetailPage";
import { ActionRow, StatButton } from "./pharmacyDetailParts";
import PharmacyProfileCard, { type PharmacyProfileExtras } from "./PharmacyProfileCard";

export type PharmacyAttention = { key: string; icon: React.ReactNode; tone: Tone; text: string; action: string; onClick: () => void };
type OverviewProps = {
  hidden: boolean;
  firstLoad: boolean; listsUnavailable: boolean; hasAnyMembers: boolean; onMembershipsChanged: () => void;
  attention: PharmacyAttention[]; counts: { staff: number; locums: number; admins: number; staffPending: number; locumPending: number; adminPending: number };
  statValue: (value: number) => React.ReactNode; statDetail: (pending: number, fallback: string) => React.ReactNode; roleSummary: string;
  setTab: (tab: TabKey) => void; profile?: PharmacyProfileExtras; editPharmacy?: () => void; go: (suffix: string) => void;
  inviteStaff: () => void; inviteLocum: () => void; inviteAdmin: () => void; openWorkforce: () => void;
};
export default function PharmacyOverview({ hidden, firstLoad, listsUnavailable, hasAnyMembers, onMembershipsChanged, attention, counts, statValue, statDetail, roleSummary, setTab, profile, editPharmacy, go, inviteStaff, inviteLocum, inviteAdmin, openWorkforce }: OverviewProps) {
  return (
      <Box hidden={hidden} role="tabpanel" id="pharmacy-tab-overview" aria-labelledby="pharmacy-tab-btn-overview">
        <Box
          sx={{
            display: "grid",
            gap: 2.5,
            alignItems: "start",
            gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 2fr) minmax(300px, 1fr)" },
            gridTemplateAreas: { xs: '"attention" "actions" "team" "profile"', lg: '"attention actions" "team actions" "profile actions"' },
            gridTemplateRows: { lg: "auto auto 1fr" },
          }}
        >
          <Box sx={{ gridArea: "attention", minWidth: 0 }}>
            <SectionCard dense flush title="Needs your attention">
              {firstLoad ? (
                <Box sx={{ px: 2.25, pb: 2 }}>
                  <Skeleton height={44} />
                  <Skeleton height={44} />
                </Box>
              ) : listsUnavailable && !hasAnyMembers ? (
                <Box sx={{ px: 2.25, pb: 2.25 }}>
                  <DashboardContentState
                    kind="error"
                    compact
                    title="Team lists can't load right now"
                    description="Staff, favourite locums and admins didn't load. This is a connection problem, not an empty team."
                    actionLabel="Try again"
                    onAction={onMembershipsChanged}
                  />
                </Box>
              ) : attention.length === 0 ? (
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2.25, pb: 2.25 }}>
                  <IconTile icon={<CheckCircle2 />} tone="cyan" size={36} />
                  <Box>
                    <Typography sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 14.5 }}>You're all caught up</Typography>
                    <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 13.5 }}>No applications or invitations are waiting on you.</Typography>
                  </Box>
                </Stack>
              ) : (
                <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                  {attention.map((item) => (
                    <Stack
                      component="li"
                      key={item.key}
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      sx={{ px: 2.25, py: 1.25, borderTop: "1px solid var(--ct-border-color)" }}
                    >
                      <IconTile icon={item.icon} tone={item.tone} size={36} />
                      <Typography sx={{ flex: 1, minWidth: 0, color: "var(--ct-text-primary)", fontSize: 14.5 }}>{item.text}</Typography>
                      <Button size="small" variant={item.tone === "magenta" ? "contained" : "outlined"} onClick={item.onClick} sx={{ minHeight: 36, flexShrink: 0 }}>
                        {item.action}
                      </Button>
                    </Stack>
                  ))}
                </Box>
              )}
            </SectionCard>
          </Box>

          <Box sx={{ gridArea: "team", minWidth: 0 }}>
            <SectionCard dense title="Your team">
              <Box sx={{ display: "grid", gap: { xs: 1, sm: 1.5 }, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <StatButton
                  icon={<Users />}
                  tone="magenta"
                  label="Staff"
                  value={statValue(counts.staff)}
                  detail={statDetail(counts.staffPending, "Full-time, part-time, casual")}
                  onClick={() => setTab("staff")}
                />
                <StatButton
                  icon={<Star />}
                  tone="violet"
                  label="Favourite locums"
                  value={statValue(counts.locums)}
                  detail={statDetail(counts.locumPending, "See your shifts first")}
                  onClick={() => setTab("locums")}
                />
                <StatButton
                  icon={<ShieldCheck />}
                  tone="blue"
                  label="Admins"
                  value={statValue(counts.admins)}
                  detail={statDetail(counts.adminPending, "Help you run the pharmacy")}
                  onClick={() => setTab("admins")}
                />
              </Box>
              {roleSummary ? (
                <Typography sx={{ mt: 1.75, color: "var(--ct-text-secondary)", fontSize: 13.5 }}>
                  Team mix: <Box component="span" sx={{ color: "var(--ct-text-primary)" }}>{roleSummary}</Box>
                </Typography>
              ) : null}
            </SectionCard>
          </Box>

          <PharmacyProfileCard profile={profile} editPharmacy={editPharmacy} />

          <Box sx={{ gridArea: "actions", minWidth: 0 }}>
            <SectionCard dense flush title="Quick actions">
              <ActionRow icon={<ClipboardList />} tone="violet" title="Post a shift" detail="Open, internal or to favourites" onClick={() => go("post-shift")} emphasis />
              <ActionRow icon={<UserPlus />} tone="magenta" title="Invite staff" detail="By email or invite link" onClick={() => { setTab("staff"); inviteStaff(); }} />
              <ActionRow icon={<Star />} tone="violet" title="Add a favourite locum" onClick={() => { setTab("locums"); inviteLocum(); }} />
              <ActionRow icon={<ShieldCheck />} tone="blue" title="Invite an admin" detail="Share the running of the pharmacy" onClick={() => { setTab("admins"); inviteAdmin(); }} />
              <ActionRow icon={<CalendarClock />} tone="cyan" title="Internal roster" detail="Plan your team's week" onClick={() => go("manage-pharmacies/roster")} />
              <ActionRow icon={<CalendarClock />} tone="blue" title="Shift Centre" detail="Active, confirmed and past shifts" onClick={() => go("shift-center")} />
              <ActionRow icon={<Wallet />} tone="cyan" title="Workforce & payroll" detail="Timesheets, leave and pay settings" onClick={() => openWorkforce()} />
            </SectionCard>
          </Box>
        </Box>
      </Box>

  );
}
