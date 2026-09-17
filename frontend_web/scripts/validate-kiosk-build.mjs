const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function validateKioskBuildEnv(env = process.env) {
  const profile = (env.KIOSK_BUILD_PROFILE || '').trim().toLowerCase();
  const rawApiUrl = (env.VITE_API_URL || '').trim();

  if (!['acceptance', 'production'].includes(profile)) {
    throw new Error(
      'KIOSK_BUILD_PROFILE must be acceptance or production for a packaged kiosk build.',
    );
  }
  if (!rawApiUrl) {
    throw new Error('VITE_API_URL is required for a packaged kiosk build.');
  }

  let parsed;
  try {
    parsed = new URL(rawApiUrl);
  } catch {
    throw new Error(`VITE_API_URL is invalid: ${rawApiUrl}`);
  }

  const isLocal = LOCAL_HOSTS.has(parsed.hostname);
  if (profile === 'production') {
    if (parsed.protocol !== 'https:') {
      throw new Error('Production kiosk builds require an HTTPS VITE_API_URL.');
    }
    if (isLocal) {
      throw new Error('Production kiosk builds must not target localhost/loopback.');
    }
  }

  if (profile === 'acceptance' && !isLocal) {
    throw new Error(
      'Acceptance kiosk builds must target localhost/127.0.0.1/::1 so they cannot be mistaken for production.',
    );
  }

  console.log(`[kiosk-build] profile=${profile} api=${parsed.origin}${parsed.pathname}`);
  return { profile, apiUrl: parsed.toString(), isLocal };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  try {
    validateKioskBuildEnv();
  } catch (error) {
    console.error(`[kiosk-build] ${error.message}`);
    process.exit(1);
  }
}
