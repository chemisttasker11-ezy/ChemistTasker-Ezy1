// A candidate's work profile as a manager sees it after reveal: photo, role, verification, bio, location,
// experience, rates and skills. Never contact details (the reveal API no longer sends them).
import { Avatar, Box, Chip, Stack, Typography } from '@mui/material';
import { BadgeCheck, BriefcaseBusiness, MapPin, Wallet } from 'lucide-react';
import skillsRegistry from '@chemisttasker/shared-core/skills_registry.json';
import { findSkill, groupWorkProfileSkills, workProfileSkillVerification, dispensaryQualifications, type ShiftWorkProfile } from '@chemisttasker/shared-core';
import { SkillSymbol } from '../../../../../../components/SkillGlyph';
import { InitialsAvatar } from '../../../../../../components/ui/InitialsAvatar';
import { Pill } from '../../../../../../components/ui/Pill';

const GROUPS: [key: string, title: string][] = skillsRegistry.groups.map(group => [group, group === 'Software & Digital' ? 'Software' : group]);
const RATES: [key: keyof NonNullable<ShiftWorkProfile['ratePreference']>, label: string][] = [['weekday', 'Weekday'], ['saturday', 'Saturday'], ['sunday', 'Sunday'], ['publicHoliday', 'Public holiday']];

const muted = { fontSize: 13.5, color: 'var(--ct-text-secondary)', lineHeight: 1.5 } as const;
const groupTitle = { fontSize: 13, fontWeight: 600, color: 'var(--ct-text-primary)', mb: 0.75 } as const;

/** The candidate's skill IDs, grouped like the Talent board; unknown codes go under "Other". */
function groupSkills(codes: string[]) {
    return groupWorkProfileSkills(skillsRegistry as any, codes);
}

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
    const checks = [
        p.ahpraVerified && (p.roleLabel === 'Pharmacist' ? 'AHPRA verified' : 'Registration verified'),
        p.govIdVerified && 'ID verified',
        p.abnVerified && 'ABN verified',
    ].filter(Boolean) as string[];
    const place = [p.suburb, p.state].filter(Boolean).join(', ');
    const travel = p.openToTravel
        ? `Open to travel${p.coverageRadiusKm ? ` up to ${p.coverageRadiusKm} km` : ''}${p.travelStates?.length ? ` · ${p.travelStates.join(', ')}` : ''}`
        : null;
    const experience = p.yearsExperience ? `${p.yearsExperience} years experience` : yearsSince(p.registeredSince);
    const rates = RATES.map(([key, label]) => (p.ratePreference?.[key] ? `${label} $${p.ratePreference[key]}/h` : null)).filter(Boolean);
    const skills = groupSkills(Array.isArray(p.skills) ? p.skills : []);
    const qualification = dispensaryQualifications.find(item => item.value === p.dispensaryQualification);
    const known = GROUPS.some(([key]) => skills[key]?.length);
    const skillGroups = [...GROUPS, ['other', known ? 'Previous selections' : 'Skills to review'] as [string, string]].filter(([key]) => skills[key]?.length);

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

            {(p.verified || checks.length > 0) && (
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap aria-label="Verification">
                    {p.verified && <Pill tone="green" icon={<BadgeCheck />} label="Profile verified" title="ChemistTasker checked this profile's documents" />}
                    {checks.map(check => <Pill key={check} tone="neutral" label={check} />)}
                </Stack>
            )}

            {bio && <Typography sx={{ fontSize: 14.5, color: 'var(--ct-text-primary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{bio}</Typography>}

            {(place || travel || experience || rates.length > 0) && (
                <Stack spacing={0.75}>
                    {(place || travel) && <Fact icon={<MapPin />}>{[place, travel].filter(Boolean).join(' · ')}</Fact>}
                    {experience && <Fact icon={<BriefcaseBusiness />}>{experience}</Fact>}
                    {rates.length > 0 && <Fact icon={<Wallet />}>Preferred rates: {rates.join(' · ')}</Fact>}
                </Stack>
            )}

            {qualification && <Typography sx={muted}>{qualification.label} · {p.dispensaryQualificationVerified ? 'Verified' : 'Claimed · not verified'}</Typography>}
            {skillGroups.length > 0 && (
                <Stack spacing={1.5}>
                    {skillGroups.map(([key, title]) => (
                        <Box key={key}>
                            <Typography component="h4" sx={groupTitle}>{title}</Typography>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                {skills[key].map(code => key === 'other'
                                    ? <Pill key={code} tone="neutral" label={code} />
                                    : <Chip key={code} size="small" icon={<SkillSymbol skill={code} size={16} />} label={[findSkill(skillsRegistry as any, code)?.label || code, workProfileSkillVerification(skillsRegistry as any, p, code)].filter(Boolean).join(' · ')} />)}
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}
