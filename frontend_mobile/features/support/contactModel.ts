export type ContactForm = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
};

export function validateContactForm(form: ContactForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.email.trim().length > 254)
    errors.email = 'Enter a valid email address.';
  if (!form.subject.trim()) errors.subject = 'Choose a topic or enter a subject.';
  if (form.subject.trim().length > 200) errors.subject = 'Keep the subject within 200 characters.';
  if (form.message.trim().length < 10) errors.message = 'Describe the issue in at least ten characters.';
  if (form.message.trim().length > 5000) errors.message = 'Keep the message within 5,000 characters.';
  return errors;
}

export function contactTopics(role?: string | null): string[] {
  const base = ['Shift or booking', 'Messages or notifications', 'Marketplace', 'Account verification', 'Technical issue'];
  const value = String(role || '').toUpperCase();
  if (value === 'OWNER' || value === 'ORGANIZATION') return [...base, 'Staff and roster', 'Organization access', 'Billing and subscriptions'];
  if (value === 'PHARMACIST' || value === 'OTHER_STAFF') return [...base, 'Timesheets or payroll', 'Invoice'];
  if (value === 'EXPLORER') return [...base, 'Talent Board', 'Profile and opportunities'];
  return base;
}
