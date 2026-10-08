import React, { useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Stack, TextField, Typography } from '@mui/material';
import { contactSupport } from '@chemisttasker/shared-core';
import ReCAPTCHA from 'react-google-recaptcha';

type Props = {
  id?: string;
  title: string;
  subtitle: string;
  subjectPlaceholder?: string;
  defaultSubject?: string;
  defaultMessage?: string;
  submitLabel?: string;
  source?: string;
  pageUrl?: string;
};

export default function PublicContactFormSection({
  id,
  title,
  subtitle,
  subjectPlaceholder = 'Subject',
  defaultSubject = '',
  defaultMessage = '',
  submitLabel = 'Send message',
  source = 'web',
  pageUrl,
}: Props) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    subject: defaultSubject,
    message: defaultMessage,
  });
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [captchaValue, setCaptchaValue] = useState<string | null>(null);
  const [serverState, setServerState] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY as string | undefined;

  const errors = useMemo(() => ({
    name: attempted && !form.name.trim() ? 'Enter your name.' : '',
    email: attempted && !form.email.trim() ? 'Enter your email address.' : '',
    subject: attempted && !form.subject.trim() ? 'Enter a subject.' : '',
    message: attempted && !form.message.trim() ? 'Enter a message.' : '',
  }), [attempted, form]);

  const handleChange = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setServerState(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    setServerState(null);

    if (!recaptchaSiteKey) {
      setServerState({ type: 'error', message: 'Contact is temporarily unavailable because the verification service is not configured.' });
      return;
    }
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || !form.message.trim()) {
      setServerState({ type: 'error', message: 'Check the required fields below and try again.' });
      return;
    }
    if (!captchaValue) {
      setServerState({ type: 'error', message: 'Complete the reCAPTCHA challenge before sending your message.' });
      return;
    }

    setSubmitting(true);
    try {
      await contactSupport({
        ...form,
        source,
        page_url: pageUrl || window.location.href,
        captcha_token: captchaValue,
      });
      setServerState({ type: 'success', message: 'Thanks — your message has been sent.' });
      setForm({ name: '', email: '', phone: '', subject: defaultSubject, message: defaultMessage });
      setCaptchaValue(null);
      setAttempted(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'We could not send your message. Please try again.';
      setServerState({ type: 'error', message: String(message) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box id={id} component="section" sx={{ py: { xs: 7, md: 10 }, bgcolor: '#F7F9FC' }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(260px,.8fr) minmax(0,1.2fr)' }, gap: { xs: 3, md: 6 }, alignItems: 'start' }}>
          <Box sx={{ pt: { md: 2 } }}>
            <Typography variant="h2" component="h2" sx={{ fontSize: { xs: 34, md: 46 } }}>{title}</Typography>
            <Typography color="text.secondary" sx={{ mt: 1.75, maxWidth: 500, lineHeight: 1.75 }}>
              {subtitle}
            </Typography>
            <Box sx={{ mt: 3, p: 2.25, borderRadius: 3, bgcolor: '#fff', border: '1px solid #E5ECF7' }}>
              <Typography sx={{ fontWeight: 900, color: 'text.primary' }}>What happens next?</Typography>
              <Typography sx={{ mt: .7, color: 'text.secondary', fontSize: 13.5, lineHeight: 1.65 }}>
                Your request is only treated as sent after the server confirms submission. If verification or delivery fails, the form stays available so you can correct it and retry.
              </Typography>
            </Box>
          </Box>

          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{
              bgcolor: '#fff',
              border: '1px solid #E5ECF7',
              borderRadius: 4,
              p: { xs: 2.5, md: 4 },
              boxShadow: '0 18px 48px rgba(6,18,58,.07)',
            }}
          >
            <Stack spacing={2}>
              {serverState && (
                <Alert severity={serverState.type} role={serverState.type === 'error' ? 'alert' : 'status'}>
                  {serverState.message}
                </Alert>
              )}

              {!recaptchaSiteKey && (
                <Alert severity="warning">
                  Contact verification is not configured for this environment. The form cannot be submitted until it is available.
                </Alert>
              )}

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField
                  label="Full name"
                  value={form.name}
                  onChange={handleChange('name')}
                  required
                  error={Boolean(errors.name)}
                  helperText={errors.name || ' '}
                  autoComplete="name"
                />
                <TextField
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  required
                  error={Boolean(errors.email)}
                  helperText={errors.email || ' '}
                  autoComplete="email"
                />
                <TextField
                  label="Phone (optional)"
                  value={form.phone}
                  onChange={handleChange('phone')}
                  helperText=" "
                  autoComplete="tel"
                />
                <TextField
                  label={subjectPlaceholder}
                  value={form.subject}
                  onChange={handleChange('subject')}
                  required
                  error={Boolean(errors.subject)}
                  helperText={errors.subject || ' '}
                />
              </Box>

              <TextField
                label="Message"
                value={form.message}
                onChange={handleChange('message')}
                required
                multiline
                minRows={6}
                fullWidth
                error={Boolean(errors.message)}
                helperText={errors.message || 'Tell us enough detail to route your request correctly.'}
              />

              {recaptchaSiteKey && (
                <Box sx={{ overflowX: 'auto', py: .5 }}>
                  <ReCAPTCHA sitekey={recaptchaSiteKey} onChange={setCaptchaValue} />
                </Box>
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1.5}>
                <Typography sx={{ mr: 'auto', color: 'text.secondary', fontSize: 12.5 }}>
                  Required fields are marked with an asterisk.
                </Typography>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={submitting || !recaptchaSiteKey}
                  sx={{ minWidth: 150 }}
                  startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}
                >
                  {submitting ? 'Sending…' : submitLabel}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
