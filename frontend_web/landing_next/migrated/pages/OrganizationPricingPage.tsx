import { useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import GroupsIcon from '@mui/icons-material/Groups';
import HubIcon from '@mui/icons-material/Hub';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { useNavigate } from '@/public/navigation';
import PublicContactFormSection from '../components/PublicContactFormSection';
import { setCanonical, setPageMeta, setSocialMeta } from '../utils/seo';

const featureGroups = [
  {
    title: 'Centralized operations',
    icon: <StorefrontIcon />,
    tone: '#E7F0FF',
    color: '#063BDA',
    items: [
      'Manage multiple pharmacies under one organization account',
      'Track claimed pharmacies and pending approvals in one place',
      'Post and monitor shifts across your organization',
    ],
  },
  {
    title: 'Team coordination',
    icon: <GroupsIcon />,
    tone: '#EFE7FF',
    color: '#5222B8',
    items: [
      'Invite organization admins and staff to help manage operations',
      'Give local teams access while keeping central oversight',
      'Keep roster and shift workflows aligned across stores',
    ],
  },
  {
    title: 'Internal communication',
    icon: <HubIcon />,
    tone: '#FDE7F5',
    color: '#D600C8',
    items: [
      'Use chat, hub posts, and community groups for updates',
      'Share organization announcements and operational information',
      'Build a public organization presence linked to your openings',
    ],
  },
];

export default function OrganizationPricingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const title = 'Organization Pricing | ChemistTasker';
    const description = 'Pricing inquiries for pharmacy organizations managing multiple pharmacies, teams, and shared shift operations.';
    const origin = window.location.origin;
    setPageMeta(title, description);
    setCanonical(`${origin}/pricing/organization`);
    setSocialMeta({ title, description, url: `${origin}/pricing/organization`, type: 'website' });
  }, []);

  return (
    <>
      <Box sx={{ py: { xs: 2, md: 4 } }}>
        <Container maxWidth="lg">
          <Box
            sx={{
              p: { xs: 3, md: 5 },
              borderRadius: 4,
              color: '#fff',
              background:
                'radial-gradient(circle at 82% 25%, rgba(0,189,210,.24), transparent 30%), linear-gradient(135deg,#061B54 0%,#5222B8 58%,#B30FA4 100%)',
              boxShadow: '0 22px 58px rgba(6,18,58,.12)',
            }}
          >
            <Stack spacing={2.25} sx={{ maxWidth: 780 }}>
              <Chip label="Organisation plans" sx={{ width: 'fit-content', bgcolor: 'rgba(255,255,255,.15)', color: '#fff' }} />
              <Typography variant="h2" sx={{ color: '#fff', fontSize: { xs: 34, md: 50 } }}>
                A larger pharmacy network needs a clearer operating model.
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.82)', lineHeight: 1.75, fontSize: { xs: 15, md: 17 } }}>
                If your organisation manages multiple pharmacies, multiple admins or a larger staffing rollout, tell us how you operate. We will tailor the commercial setup around the product capabilities already available to your organisation.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button variant="contained" color="inherit" onClick={() => document.getElementById('organisation-enquiry')?.scrollIntoView({ behavior: 'smooth' })} sx={{ color: '#5222B8' }}>
                  Ask about organisation pricing
                </Button>
                <Button variant="outlined" color="inherit" onClick={() => navigate('/pricing')} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.45)' }}>
                  Compare standard plans
                </Button>
              </Stack>
            </Stack>
          </Box>

          <Box sx={{ mt: { xs: 4, md: 6 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' }, gap: 2.5 }}>
            {featureGroups.map((group) => (
              <Card key={group.title}>
                <CardContent sx={{ p: { xs: 3, md: 3.5 } }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: group.tone, color: group.color, '& svg': { fontSize: 27 } }}>
                    {group.icon}
                  </Box>
                  <Typography variant="h5" sx={{ mt: 2.5 }}>{group.title}</Typography>
                  <Stack spacing={1.5} sx={{ mt: 2.25 }}>
                    {group.items.map((item) => (
                      <Stack key={item} direction="row" spacing={1.15} alignItems="flex-start">
                        <CheckCircleIcon sx={{ color: group.color, fontSize: 19, mt: '2px' }} />
                        <Typography color="text.secondary" sx={{ lineHeight: 1.6, fontWeight: 600 }}>{item}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>

          <Box sx={{ mt: { xs: 4, md: 6 }, p: { xs: 3, md: 4 }, border: '1px solid #E5ECF7', borderRadius: 4, bgcolor: '#fff' }}>
            <Typography variant="h3">What determines the plan?</Typography>
            <Typography color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.75, maxWidth: 850 }}>
              Organisation pricing is intentionally enquiry-based. The current page does not invent a per-store enterprise price: structure, pharmacy count, admin access, rollout needs and support requirements all affect the setup.
            </Typography>
          </Box>
        </Container>
      </Box>

      <PublicContactFormSection
        id="organisation-enquiry"
        title="Ask about organisation pricing"
        subtitle="Tell us more about your organisation, the pharmacies you manage and the support or rollout you need. We will get back to you after the request is successfully submitted."
        subjectPlaceholder="Inquiry subject"
        defaultSubject="Organization pricing inquiry"
        defaultMessage="Tell us more about your organization, how many pharmacies you manage, how many admins or internal staff need access, and what kind of staffing workflow or rollout support you are looking for."
        submitLabel="Send enquiry"
        source="web-org-pricing"
      />
    </>
  );
}
