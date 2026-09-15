import React, { useState } from 'react';
import { Alert, Box, Button, Container, Snackbar, TextField, Typography, styled } from '@mui/material';
import { contactSupport } from '@chemisttasker/shared-core';
import ReCAPTCHA from 'react-google-recaptcha';

const CtaButton = styled(Button)(({ theme }) => ({
  transition: 'all 0.3s ease',
  boxShadow: `0 4px 6px rgba(0, 0, 0, 0.1), 0 10px 20px ${theme.palette.primary.main}33`,
  backgroundColor: theme.palette.primary.main,
  color: 'white',
  borderRadius: '8px',
  fontWeight: 600,
  '&:hover': {
    backgroundColor: theme.palette.primary.dark,
    transform: 'translateY(-5px) scale(1.05)',
    boxShadow: `0 7px 14px rgba(0, 0, 0, 0.1), 0 15px 30px ${theme.palette.primary.main}4D`,
  },
}));

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
  submitLabel = 'Send Message',
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
  const [captchaValue, setCaptchaValue] = useState<string | null>(null);
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error'; message: string }>({
    open: false,
    severity: 'success',
    message: '',
  });
  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

  const handleChange = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || !form.message.trim()) {
      setToast({ open: true, severity: 'error', message: 'Please complete all required fields.' });
      return;
    }
    if (!captchaValue) {
      setToast({ open: true, severity: 'error', message: 'Please complete the reCAPTCHA challenge.' });
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
      setToast({ open: true, severity: 'success', message: 'Thanks! Your message has been sent.' });
      setForm({
        name: '',
        email: '',
        phone: '',
        subject: defaultSubject,
        message: defaultMessage,
      });
      setCaptchaValue(null);
    } catch (err: any) {
      setToast({ open: true, severity: 'error', message: err?.message || 'Failed to send message.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box id={id} component="section" sx={{ py: { xs: 10, md: 12 }, bgcolor: '#f4f7fb' }}>
      <Container>
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h2">{title}</Typography>
          <Typography color="text.primary" sx={{ mt: 2, maxWidth: '42rem', mx: 'auto' }}>
            {subtitle}
          </Typography>
        </Box>
        <Box sx={{ maxWidth: 720, mx: 'auto', bgcolor: '#ffffff', borderRadius: 3, p: { xs: 3, md: 4 }, boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Full Name" value={form.name} onChange={handleChange('name')} required />
            <TextField label="Email" type="email" value={form.email} onChange={handleChange('email')} required />
            <TextField label="Phone (optional)" value={form.phone} onChange={handleChange('phone')} />
            <TextField label={subjectPlaceholder} value={form.subject} onChange={handleChange('subject')} required />
          </Box>
          <TextField
            label="Message"
            value={form.message}
            onChange={handleChange('message')}
            required
            multiline
            minRows={5}
            sx={{ mt: 2 }}
            fullWidth
          />
          {recaptchaSiteKey ? (
            <Box sx={{ mt: 2 }}>
              <ReCAPTCHA sitekey={recaptchaSiteKey} onChange={setCaptchaValue} />
            </Box>
          ) : null}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
            <CtaButton onClick={handleSubmit} disabled={submitting} sx={{ px: 4, py: 1.2 }}>
              {submitting ? 'Sending...' : submitLabel}
            </CtaButton>
          </Box>
        </Box>
        <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast((prev) => ({ ...prev, open: false }))}>
          <Alert severity={toast.severity} onClose={() => setToast((prev) => ({ ...prev, open: false }))}>
            {toast.message}
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  );
}
