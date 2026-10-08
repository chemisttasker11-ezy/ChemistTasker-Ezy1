export const publicRoutes = {
  home: '/',
  register: '/register',
  dashboard: '/dashboard',
  marketplace: '/marketplace',
  marketplaceNew: '/marketplace/new',
  publicShifts: '/shifts/public-board',
  publicTalent: '/talent/public-board',
  hubs: '/hubs',
  news: '/news',
  pricing: '/pricing',
  learning: '/learning',
  blog: '/blog',
  calculator: '/calculator',
  organizationPricing: '/pricing/organization',
  contact: '/contact',
  privacy: '/privacy-policy',
  terms: '/terms-of-service',
} as const;

export const mobileAppLinks = {
  googlePlay: 'https://play.google.com/store/apps/details?id=com.chemisttasker.app',
  appStore: 'https://apps.apple.com/sb/app/chemisttasker/id6759088580',
} as const;
