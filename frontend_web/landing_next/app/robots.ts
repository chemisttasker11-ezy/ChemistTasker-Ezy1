import { MetadataRoute } from 'next';
import { site } from '../lib/hub';
export default function robots(): MetadataRoute.Robots { return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/community/sign-in', '/content', '/dashboard', '/calculator'] }, sitemap: `${site}/sitemap.xml` }; }
