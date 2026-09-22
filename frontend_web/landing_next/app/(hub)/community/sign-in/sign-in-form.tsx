'use client';
import { FormEvent, useState } from 'react';
import { chemistTaskerApi } from '@/lib/chemisttasker-api';
import { announceSession } from '@/shared/browser-session';
export default function SignInForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      await chemistTaskerApi.account.login({
        email: String(form.get('email')).trim().toLowerCase(),
        password: form.get('password'),
      });
      announceSession('login');
      const next = new URLSearchParams(window.location.search).get('next') || '/news';
      window.location.assign(/^\/(blog|news|hubs|content)(\/[a-zA-Z0-9_-]+)*(#[a-zA-Z0-9_-]+)?$/.test(next) ? next : '/news');
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <form className="hub-auth-form" onSubmit={submit}><label>Email address<input name="email" type="email" autoComplete="username" required maxLength={254}/></label><label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={1024}/></label><a href={'/password-reset'}>Forgot your password?</a><button className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Log in to the community'}</button>{error && <p role="alert" className="hub-error">{error}</p>}<p>New here? <a href={'/register'}>Create a ChemistTasker account</a></p></form>;
}
