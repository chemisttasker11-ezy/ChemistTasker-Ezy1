// A worker's profile as a manager sees it in Review, after Reveal, and for booked workers in Confirmed and History:
// photo, role, verification, bio, location, experience, rates and skills (the three talent-board groups). Never
// contact details here; Confirmed adds them below (WorkerProfileDialog).
import { Avatar, Box, Stack, Typography } from '@mui/material';
import { BriefcaseBusiness, GraduationCap, MapPin, Wallet } from 'lucide-react';
import { dispensaryQualifications, normalizeVerification, type ShiftWorkProfile } from '@chemisttasker/shared-core';
import { BadgeGuideLink, VerificationBadges } from '@chemisttasker/shared-ui/VerificationBadges';
import { WorkerSkillRows } from '@chemisttasker/shared-ui/WorkerSkills';
import { InitialsAvatar } from '../../../../../../components/ui/InitialsAvatar';

const RATES: [key: keyof NonNullable<ShiftWorkProfile['ratePreference']>, label: string][] = [['weekday', 'Weekday'], ['saturday', 'Saturday'], ['sunday', 'Sunday'], ['publicHoliday', 'Public holiday']];

const muted = { fontSize: 13.5, color: 'var(--ct-text-secondary)', lineHeight: 1.5 } as const;
const groupTitle = { fontSize: 13, fontWeight: 600, color: 'var(--ct-text-primary)', mb: 0.75 } as const;

const yearsSince = (iso?: string | null) => {
    if (!iso) return null;
    const years = Math.floor((Date.now() - new Date(iso).getTime()) / (365.25 * 86_400_000));
    return years >= 1 ? `${years} ${years === 1 ? 'year' : 'years'} registered` : 'Registered this year';
};

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ '& svg': { width: 16, height: 16, flexShrink: 0, mt: '2px', color: 'var(--ct-text-muted)' } }}>
            {icon}
            <Typography sx={muted}>{children}</Typography>
        </Stack>
    );
}

export function CandidateProfile({ name, bio, profile }: { name: string; bio?: string; profile?: ShiftWorkProfile | null }) {
    const p: Partial<ShiftWorkProfile> = profile || {};
    const role = [p.roleLabel, p.classification].filter(Boolean).join(' · ');
    const verification = normalizeVerification(p.verification);
    const place = [p.suburb, p.state].filter(Boolean).join(', ');
    const travel = p.openToTravel
        ? `Open to travel${p.coverageRadiusKm ? ` up to ${p.coverageRadiusKm} km` : ''}${p.travelStates?.length ? ` · ${p.travelStates.join(', ')}` : ''}`
        : null;
    const experience = p.yearsExperience ? `${p.yearsExperience} years experience` : yearsSince(p.registeredSince);
    const rates = RATES.map(([key, label]) => (p.ratePreference?.[key] ? `${label} $${p.ratePreference[key]}/h` : null)).filter(Boolean);
    const qualification = dispensaryQualifications.find(item => item.value === p.dispensaryQualification);

    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
                {p.profilePhoto
                    ? <Avatar src={p.profilePhoto} alt="" sx={{ width: 56, height: 56 }} />
                    : <InitialsAvatar name={name} size={56} />}
                <Box sx={{ minWidth: 0 }}>
                    <Typography component="h3" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 20, color: 'var(--ct-text-primary)', lineHeight: 1.25 }}>
                        {name}
                    </Typography>
                    {role && <Typography sx={muted}>{role}</Typography>}
                </Box>
            </Stack>

            {verification && (
                <Box component="section" aria-labelledby="candidate-verification">
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 0.75 }}>
                        <Typography id="candidate-verification" component="h4" sx={groupTitle}>Verification</Typography>
                        <BadgeGuideLink />
                    </Stack>
                    <VerificationBadges summary={verification} role={p.skillRole} />
                </Box>
            )}

            {bio && <Typography sx={{ fontSize: 14.5, color: 'var(--ct-text-primary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{bio}</Typography>}

            {(place || travel || experience || rates.length > 0 || qualification) && (
                <Stack spacing={0.75}>
                    {(place || travel) && <Fact icon={<MapPin />}>{[place, travel].filter(Boolean).join(' · ')}</Fact>}
                    {experience && <Fact icon={<BriefcaseBusiness />}>{experience}</Fact>}
                    {rates.length > 0 && <Fact icon={<Wallet />}>Preferred rates: {rates.join(' · ')}</Fact>}
                    {qualification && <Fact icon={<GraduationCap />}>Dispensing training: {qualification.label}</Fact>}
                </Stack>
            )}

            <WorkerSkillRows skills={Array.isArray(p.skills) ? p.skills : []} verification={verification} />
        </Stack>
    );
}
