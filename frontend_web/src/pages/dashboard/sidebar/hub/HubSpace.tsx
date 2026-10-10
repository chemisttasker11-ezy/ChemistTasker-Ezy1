import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Avatar, Box, Button, Dialog, DialogContent, DialogTitle, IconButton, InputAdornment, Paper, Stack, Tab, Tabs, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Building2, Globe, Hash, Lock, Search, Settings, ShieldCheck, Store, Users, X } from 'lucide-react';
import type { HubGroupMemberOption } from '../../../../types/hub';
import { brandPanelBackground } from '../../../../components/ui/BrandBanner';
import DashboardContentState from '../../../../components/dashboard/DashboardContentState';
import { EMPLOYMENT_LABELS, initialsOf, roleLabel } from '../../../../components/social/socialFormat';
import { getMemberDisplayName } from './hubUtils';
import { Pill } from '../../shiftCenter/ShiftCentreParts';

/** A member of a hub space; `isAdmin` is set where the API says who manages the space (groups). */
export type HubPerson = HubGroupMemberOption & { isAdmin?: boolean };

export type HubSpaceKind = 'pharmacy' | 'organization' | 'group' | 'platform';
type TabKey = 'discussion' | 'about';

const KIND_ICON: Record<HubSpaceKind, ReactNode> = {
  pharmacy: <Store size={30} />,
  organization: <Building2 size={30} />,
  group: <Hash size={30} />,
  platform: <Globe size={30} />,
};

const cardSx = { borderRadius: 'var(--ct-card-radius)', borderColor: 'var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)' } as const;

export interface HubSpaceProps {
  kind: HubSpaceKind;
  name: string;
  /** Small line above the name, e.g. "Pharmacy hub" or "Group in Smoke Pharmacy". */
  eyebrow: string;
  /** Who can see this space, e.g. "Private to your team". */
  privacy: string;
  isPublic?: boolean;
  coverImage?: string | null;
  about?: string | null;
  aboutFallback: string;
  /** Loads the people in this space; omitted for platform hubs. */
  membersLoader?: () => Promise<HubPerson[]>;
  memberFilter?: (members: HubPerson[]) => HubPerson[];
  onOpenSettings?: () => void;
  settingsLabel?: string;
  /** Extra controls next to settings (e.g. a group menu). */
  actions?: ReactNode;
  /** Extra pills beside the name (e.g. "Created by you"). */
  badges?: ReactNode;
  aboutFacts?: Array<{ label: string; value: ReactNode }>;
  /** Called with the member count once members load (shown beside the space in the hub menu). */
  onMemberCount?: (count: number) => void;
  /** The discussion feed. */
  children: ReactNode;
}

function MemberAvatar({ member, size = 40 }: { member: HubPerson; size?: number }) {
  const name = getMemberDisplayName(member);
  return (
    <Avatar
      src={member.profilePhotoUrl || undefined}
      alt={name}
      sx={{ width: size, height: size, fontSize: Math.round(size * 0.36), fontWeight: 600, bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)' }}
    >
      {initialsOf(null, null, name)}
    </Avatar>
  );
}

const memberSubtitle = (member: HubPerson) =>
  [roleLabel(member.role) || null, member.jobTitle && member.jobTitle.toLowerCase() !== roleLabel(member.role).toLowerCase() ? member.jobTitle : null, member.employmentType ? EMPLOYMENT_LABELS[member.employmentType] : null]
    .filter(Boolean)
    .join(' · ');

/**
 * One layout for every hub space (pharmacy, organisation, group, ChemistTasker hub), modelled on
 * Facebook / LinkedIn groups: cover header with tabs, discussion first, About and Members in their own tabs
 * with a compact summary rail beside the feed on wide screens.
 */
export default function HubSpace({
  kind,
  name,
  eyebrow,
  privacy,
  isPublic = false,
  coverImage,
  about,
  aboutFallback,
  membersLoader,
  memberFilter,
  onOpenSettings,
  settingsLabel = 'Edit profile',
  actions,
  badges,
  aboutFacts = [],
  onMemberCount,
  children,
}: HubSpaceProps) {
  const [tab, setTab] = useState<TabKey>('discussion');
  const [coverFailed, setCoverFailed] = useState(false);
  const [members, setMembers] = useState<HubPerson[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [membersState, setMembersState] = useState<'idle' | 'loading' | 'ready' | 'error'>(membersLoader ? 'loading' : 'idle');
  const [memberQuery, setMemberQuery] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { setCoverFailed(false); }, [coverImage]);

  useEffect(() => {
    if (!membersLoader) { setMembersState('idle'); setMembers([]); return; }
    let active = true;
    setMembersState('loading');
    membersLoader()
      .then((list) => {
        if (!active) return;
        const filtered = memberFilter ? memberFilter(list) : list;
        const sorted = [...filtered].sort((a, b) =>
          Number(Boolean(b.isAdmin)) - Number(Boolean(a.isAdmin)) ||
          Number(Boolean(b.isOwnPharmacy)) - Number(Boolean(a.isOwnPharmacy)) ||
          getMemberDisplayName(a).localeCompare(getMemberDisplayName(b)));
        setMembers(sorted);
        setMembersState('ready');
        onMemberCount?.(sorted.length);
      })
      .catch(() => { if (active) setMembersState('error'); });
    return () => { active = false; };
  }, [membersLoader, memberFilter, attempt]);

  const aboutText = (about || '').trim();
  const hasMembers = Boolean(membersLoader);
  const memberCountText = membersState === 'ready' ? `${members.length} ${members.length === 1 ? 'member' : 'members'}` : null;
  const showCover = Boolean(coverImage) && !coverFailed;
  const visibleMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return q ? members.filter((m) => getMemberDisplayName(m).toLowerCase().includes(q)) : members;
  }, [members, memberQuery]);

  const admins = visibleMembers.filter((m) => m.isAdmin);
  const others = visibleMembers.filter((m) => !m.isAdmin);
  const seeMembers = hasMembers ? (
    <Button size="small" startIcon={<Users size={16} />} onClick={() => setMembersOpen(true)} sx={{ minHeight: 36, px: 1 }}>
      {memberCountText ? `See ${memberCountText}` : 'See members'}
    </Button>
  ) : null;

  const settingsButton = onOpenSettings ? (
    <Button variant="outlined" onClick={onOpenSettings} startIcon={<Settings size={16} />} sx={{ minHeight: 40 }}>
      {settingsLabel}
    </Button>
  ) : null;

  const aboutCard = (
    <Paper variant="outlined" sx={{ ...cardSx, p: 2.25 }}>
      <Typography component="h2" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 18, color: 'var(--ct-text-primary)' }}>About</Typography>
      <Typography variant="body2" sx={{ mt: 0.75, color: 'var(--ct-text-secondary)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-line' }}>
        {aboutText || aboutFallback}
      </Typography>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1.25, color: 'var(--ct-text-secondary)' }}>
        {isPublic ? <Globe size={15} aria-hidden /> : <Lock size={15} aria-hidden />}
        <Typography variant="body2" sx={{ color: 'inherit' }}>{privacy}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1, ml: -1 }}>
        <Button size="small" onClick={() => setTab('about')} sx={{ minHeight: 36, px: 1 }}>More about this hub</Button>
        {seeMembers}
      </Stack>
    </Paper>
  );


  return (
    <Box sx={{ width: '100%' }}>
      <Paper variant="outlined" sx={{ ...cardSx, overflow: 'hidden', mb: { xs: 2, md: 3 } }}>
        <Box
          aria-hidden
          sx={{
            height: { xs: 96, md: 168 },
            background: showCover ? undefined : brandPanelBackground,
            position: 'relative',
          }}
        >
          {showCover && (
            <Box component="img" src={coverImage!} alt="" onError={() => setCoverFailed(true)} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          )}
        </Box>
        <Box sx={{ px: { xs: 2, md: 3 }, pb: 0 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 2.5 }} alignItems={{ md: 'flex-end' }} justifyContent="space-between">
            <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ minWidth: 0 }}>
              <Box
                aria-hidden
                sx={{
                  width: { xs: 64, md: 84 }, height: { xs: 64, md: 84 }, mt: { xs: '-32px', md: '-42px' }, flexShrink: 0,
                  borderRadius: '20px', border: '4px solid var(--ct-surface-bg)', bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {KIND_ICON[kind]}
              </Box>
              <Box sx={{ minWidth: 0, pt: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-accent-strong)', fontSize: 13 }}>{eyebrow}</Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography component="h1" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: { xs: 24, md: 30 }, lineHeight: 1.15, color: 'var(--ct-text-primary)', overflowWrap: 'anywhere' }}>
                    {name}
                  </Typography>
                  {badges}
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5, color: 'var(--ct-text-secondary)' }}>
                  {isPublic ? <Globe size={15} aria-hidden /> : <Lock size={15} aria-hidden />}
                  <Typography variant="body2" sx={{ color: 'inherit' }}>{privacy}</Typography>
                  {hasMembers && memberCountText && (
                    <>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => setMembersOpen(true)}
                        sx={{ p: 0, border: 0, background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--ct-accent-strong)', '&:hover': { textDecoration: 'underline' }, '&:focus-visible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2, borderRadius: '4px' } }}
                      >
                        {memberCountText}
                      </Box>
                    </>
                  )}
                </Stack>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ pb: { md: 0.5 }, flexShrink: 0 }}>
              {settingsButton}
              {actions}
            </Stack>
          </Stack>
          <Tabs
            value={tab}
            onChange={(_, value: TabKey) => setTab(value)}
            aria-label={`${name} sections`}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{ mt: 2, minHeight: 48, borderTop: '1px solid var(--ct-border-color)', '& .MuiTab-root': { minHeight: 48, fontWeight: 600 } }}
          >
            <Tab value="discussion" label="Discussion" />
            <Tab value="about" label="About" />
          </Tabs>
        </Box>
      </Paper>

      {tab === 'discussion' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', xl: 'minmax(0, 1fr) 320px' }, gap: 3, alignItems: 'start' }}>
          <Box sx={{ minWidth: 0, maxWidth: 760, width: '100%', mx: { xl: 'auto' } }}>{children}</Box>
          <Stack spacing={2} sx={{ display: { xs: 'none', xl: 'flex' }, position: 'sticky', top: 96 }} component="aside" aria-label="About and members">
            {aboutCard}
          </Stack>
        </Box>
      )}

      <Dialog open={membersOpen} onClose={() => setMembersOpen(false)} fullScreen={phone} fullWidth maxWidth="sm" aria-labelledby="hub-members-title">
        <DialogTitle id="hub-members-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <span>Members{memberCountText ? ` · ${members.length}` : ''}</span>
          <IconButton aria-label="Close members" onClick={() => setMembersOpen(false)}><X size={18} /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ px: 2.5, py: 1.75, position: 'sticky', top: 0, zIndex: 1, bgcolor: 'var(--ct-surface-bg)', borderBottom: '1px solid var(--ct-border-color)' }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Find a member"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              inputProps={{ 'aria-label': 'Find a member' }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }}
            />
          </Box>
          {membersState === 'loading' && <Box sx={{ p: 2.5 }}><DashboardContentState compact kind="loading" title="Loading members" /></Box>}
          {membersState === 'error' && <Box sx={{ p: 2.5 }}><DashboardContentState compact kind="error" title="We couldn't load the members" description="Check your connection and try again." actionLabel="Try again" onAction={() => setAttempt((n) => n + 1)} /></Box>}
          {membersState === 'ready' && visibleMembers.length === 0 && (
            <Box sx={{ p: 2.5 }}><DashboardContentState compact kind="empty" icon={<Users size={24} />} title={members.length ? 'No one matches' : 'No members yet'} description={members.length ? 'Try another name.' : 'People appear here once they join.'} /></Box>
          )}
          {membersState === 'ready' && [
            { key: 'admins', title: 'Admins', hint: 'Manage this space and its posts.', list: admins },
            { key: 'members', title: admins.length ? 'Members' : '', hint: '', list: others },
          ].filter((section) => section.list.length > 0).map((section) => (
            <Box key={section.key} component="section" aria-label={section.title || 'Members'} sx={{ px: 2.5, py: 1.5, '& + section': { borderTop: '1px solid var(--ct-border-color)' } }}>
              {section.title && (
                <Box sx={{ mb: 1 }}>
                  <Typography component="h3" sx={{ fontSize: 15, fontWeight: 600, color: 'var(--ct-text-primary)' }}>
                    {section.title} <Box component="span" sx={{ fontWeight: 500, color: 'var(--ct-text-secondary)' }}>{section.list.length}</Box>
                  </Typography>
                  {section.hint && <Typography variant="caption" sx={{ color: 'var(--ct-text-secondary)' }}>{section.hint}</Typography>}
                </Box>
              )}
              <Stack spacing={1.25}>
                {section.list.map((m) => (
                  <Stack key={m.membershipId} direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                    <MemberAvatar member={m} size={44} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>{getMemberDisplayName(m)}</Typography>
                        {m.isAdmin && <Pill tone="violet" icon={<ShieldCheck />} label="Admin" />}
                      </Stack>
                      <Typography variant="body2" noWrap sx={{ color: 'var(--ct-text-secondary)' }}>
                        {[memberSubtitle(m), kind !== 'pharmacy' ? m.pharmacyName : null].filter(Boolean).join(' · ')}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Box>
          ))}
        </DialogContent>
      </Dialog>

      {tab === 'about' && (
        <Paper variant="outlined" sx={{ ...cardSx, p: { xs: 2.25, md: 3 }, maxWidth: 820 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Typography component="h2" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 22, color: 'var(--ct-text-primary)' }}>About</Typography>
          </Stack>
          <Typography sx={{ mt: 1.5, color: aboutText ? 'var(--ct-text-primary)' : 'var(--ct-text-secondary)', whiteSpace: 'pre-line', lineHeight: 1.65 }}>
            {aboutText || aboutFallback}
          </Typography>
          <Box component="dl" sx={{ mt: 2.5, mb: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px 1fr' }, rowGap: 1.25, columnGap: 2 }}>
            <Typography component="dt" variant="body2" sx={{ color: 'var(--ct-text-secondary)' }}>Who can see it</Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, color: 'var(--ct-text-primary)', display: 'flex', alignItems: 'center', gap: 0.75 }}>
              {isPublic ? <Globe size={15} aria-hidden /> : <Lock size={15} aria-hidden />} {privacy}
            </Typography>
            {hasMembers && (
              <>
                <Typography component="dt" variant="body2" sx={{ color: 'var(--ct-text-secondary)', alignSelf: 'center' }}>Members</Typography>
                <Box component="dd" sx={{ m: 0, ml: -1 }}>{seeMembers}</Box>
              </>
            )}
            {aboutFacts.map((fact) => (
              <Box key={fact.label} sx={{ display: 'contents' }}>
                <Typography component="dt" variant="body2" sx={{ color: 'var(--ct-text-secondary)' }}>{fact.label}</Typography>
                <Typography component="dd" variant="body2" sx={{ m: 0, color: 'var(--ct-text-primary)' }}>{fact.value}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
}
