import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  IconButton, InputAdornment, Paper, Skeleton, Snackbar, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import {
  ArrowLeft, Building2, CalendarDays, Check, CheckCircle2, Download, FileText, Flag, Landmark, ListChecks, MapPin, PiggyBank, UserRound,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import DashboardContentState from '../../../components/dashboard/DashboardContentState';
import {
  Facts, InvoiceSection, LineItemsEditor, LineItemsReadOnly, PayToDetails, StatusPill, TotalsBreakdown, descriptionForSave, formatDay, invoiceStatus, money, splitDescription, syncDescription, type Totals,
} from './Invoices/invoiceParts';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useJsApiLoader, Autocomplete } from '@react-google-maps/api';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { finance, getInvoiceDetail, reportInvoiceIssue, updateInvoice } from '@chemisttasker/shared-core';
import { isIssuerWorkspace } from '../../../utils/invoiceIssuer';
import { setFinanceHandoff } from '../../finance/handoff';
import apiClient from '../../../utils/apiClient';

dayjs.extend(utc);

const GOOGLE_LIBRARIES: ('places')[] = ['places'];

const pageSx = { width: '100%', maxWidth: 1240, mx: 'auto', px: { xs: 0, sm: 1.5, md: 2 }, py: { xs: 2, md: 3 } } as const;

const dashboardRoleSegment = (role?: string | null) => {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'OTHER_STAFF') return 'otherstaff';
  if (normalized === 'PHARMACIST') return 'pharmacist';
  if (normalized === 'OWNER') return 'owner';
  return normalized.toLowerCase();
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  // Main state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, msg: '' });
  const [invoice, setInvoice] = useState<any | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState('');

  // All editable fields
  const [external, setExternal] = useState(false);
  const [issuerFirstName, setIssuerFirstName] = useState('');
  const [issuerLastName, setIssuerLastName] = useState('');
  const [issuerAbn, setIssuerAbn] = useState('');
  const [issuerEmail, setIssuerEmail] = useState('');
  const [gstRegistered, setGstRegistered] = useState(false);
  const [superRateSnapshot, setSuperRateSnapshot] = useState(10);
  const [superFundName, setSuperFundName] = useState('');
  const [superUsi, setSuperUsi] = useState('');
  const [superMemberNumber, setSuperMemberNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bsb, setBsb] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ccEmails, setCcEmails] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  // Internal (pharmacy)
  const [pharmacyNameSnapshot, setPharmacyNameSnapshot] = useState('');
  const [pharmacyAddressSnapshot, setPharmacyAddressSnapshot] = useState('');
  const [pharmacyAbnSnapshot, setPharmacyAbnSnapshot] = useState('');
  // const [pharmacyStateSnapshot, setPharmacyStateSnapshot] = useState('');
  const [billToFirstName, setBillToFirstName] = useState('');
  const [billToLastName, setBillToLastName] = useState('');
  const [billToEmail, setBillToEmail] = useState('');
  const [billToAbn, setBillToAbn] = useState('');
  // External
  const [customBillToName, setCustomBillToName] = useState('');
  const [customBillToAddress, setCustomBillToAddress] = useState('');

  const { isLoaded } = useJsApiLoader({
  googleMapsApiKey: import.meta.env.VITE_Maps_API_KEY as string,
  libraries: GOOGLE_LIBRARIES,
  });
  const externalAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const internalAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);


  const handleExternalPlaceChanged = () => {
  if (!externalAutocompleteRef.current) return;
  const place = externalAutocompleteRef.current.getPlace();
  if (!place || !place.address_components) return;

  let streetNumber = '';
  let route = '';
  let suburb = '';
  let stateShort = '';
  let postalCode = '';

  for (const comp of place.address_components) {
    if (comp.types.includes('street_number')) streetNumber = comp.long_name;
    if (comp.types.includes('route')) route = comp.short_name;
    if (comp.types.includes('locality')) suburb = comp.long_name;
    if (comp.types.includes('administrative_area_level_1')) stateShort = comp.short_name;
    if (comp.types.includes('postal_code')) postalCode = comp.long_name;
  }

  const address = [`${streetNumber} ${route}`.trim(), suburb, stateShort, postalCode]
    .filter(Boolean)
    .join(', ');

  setCustomBillToAddress(address);
};

  const handleInternalPlaceChanged = () => {
    if (!internalAutocompleteRef.current) return;
    const place = internalAutocompleteRef.current.getPlace();
    if (!place || !place.address_components) return;

    let streetNumber = '';
    let route = '';
    let suburb = '';
    let stateShort = '';
    let postalCode = '';

    for (const comp of place.address_components) {
      if (comp.types.includes('street_number')) streetNumber = comp.long_name;
      if (comp.types.includes('route')) route = comp.short_name;
      if (comp.types.includes('locality')) suburb = comp.long_name;
      if (comp.types.includes('administrative_area_level_1')) stateShort = comp.short_name;
      if (comp.types.includes('postal_code')) postalCode = comp.long_name;
    }

    const address = [`${streetNumber} ${route}`.trim(), suburb, stateShort, postalCode]
      .filter(Boolean)
      .join(', ');

    setPharmacyAddressSnapshot(address);
    };

  // Line Items
  const [lineItems, setLineItems] = useState<any[]>([]);

  // --- Fetch invoice data ---
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setInvoice(null);
    let cancelled = false;
    // Invoices managed by the finance workspace open there (issuer: composer, recipient: review history);
    // this page stays for legacy invoices the workspace doesn't manage.
    const listBase = location.pathname.replace(/\/[^/]+\/?$/, '');
    const managed = isIssuerWorkspace(location.pathname, user?.role) ? finance.invoice(Number(id)) : finance.receivedInvoice(Number(id));
    managed
      .then(() => {
        if (cancelled) return;
        setFinanceHandoff({ invoice: String(id) });
        navigate(`${listBase}?invoice=${id}`, { replace: true });
      })
      .catch(() => {
        if (!cancelled) loadLegacy();
      });
    return () => {
      cancelled = true;
    };

    function loadLegacy() {
    getInvoiceDetail(Number(id))
      .then((data: any) => {
        setInvoice(data);
        setExternal(data.external || false);
        setIssuerFirstName(data.issuer_first_name || '');
        setIssuerLastName(data.issuer_last_name || '');
        setIssuerAbn(data.issuer_abn || '');
        setIssuerEmail(data.issuer_email || '');
        setGstRegistered(data.gst_registered === true || data.gst_registered === 'true' || data.gst_registered === 1);
        setSuperRateSnapshot(Number(data.super_rate_snapshot) || 0);
        setSuperFundName(data.super_fund_name || '');
        setSuperUsi(data.super_usi || '');
        setSuperMemberNumber(data.super_member_number || '');
        setBankAccountName(data.bank_account_name || '');
        setBsb(data.bsb || '');
        setAccountNumber(data.account_number || '');
        setCcEmails(data.cc_emails || '');
        setInvoiceDate(data.invoice_date || '');
        setDueDate(data.due_date || '');
        setPharmacyNameSnapshot(data.pharmacy_name_snapshot || '');
        setPharmacyAddressSnapshot(data.pharmacy_address_snapshot || '');
        setPharmacyAbnSnapshot(data.pharmacy_abn_snapshot || '');
        // setPharmacyStateSnapshot(data.pharmacy_state_snapshot || '');
        setBillToFirstName(data.bill_to_first_name || '');
        setBillToLastName(data.bill_to_last_name || '');
        setBillToEmail(data.bill_to_email || '');
        setBillToAbn(data.bill_to_abn || '');
        setCustomBillToName(data.custom_bill_to_name || '');
        setCustomBillToAddress(data.custom_bill_to_address || '');

        setLineItems(
          (data.line_items || []).map((li: any) => {
            const parsed = splitDescription(li.description || '');
            return {
              ...li,
              date: parsed.date,
              start_time: parsed.start_time,
              end_time: parsed.end_time,
              quantity: Number(li.quantity || 0),
              unit_price: Number(li.unit_price || 0),
              discount: Number(li.discount || 0),
              total: Number(li.total || 0),
            };
          })
        );
      })
      .catch(() => {
        setInvoice(null);
      })
      .finally(() => setLoading(false));
    }
    // location and user only steer the one-time hand-off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadAttempt]);

  // --- Totals ---
  const subtotal = lineItems
    .filter(li => li.category_code !== 'Superannuation')
    .reduce((sum, li) => sum + Number(li.total || 0), 0);

  const transportation = lineItems
    .filter(li => li.category_code === 'Transportation')
    .reduce((sum, li) => sum + Number(li.total || 0), 0);

  const accommodation = lineItems
    .filter(li => li.category_code === 'Accommodation')
    .reduce((sum, li) => sum + Number(li.total || 0), 0);

  const gst = gstRegistered
    ? lineItems
        .filter(
          li =>
            li.category_code !== 'Superannuation' &&
            li.category_code !== 'Transportation' &&
            li.category_code !== 'Accommodation'
        )
        .reduce((sum, li) => sum + Number(li.total || 0), 0) * 0.10
    : 0;

  const superAmount =
    lineItems.find(li => li.category_code === 'Superannuation')?.total || 0;

  const grandTotal = subtotal + gst + Number(superAmount);

  // --- Handlers for line items ---
  const recalc = useCallback(
    (li: any) =>
      Number((li.quantity * li.unit_price * (1 - li.discount / 100)).toFixed(2)),
    []
  );
  const updateRow = (
    idx: number,
    field: string,
    value: any
  ) => {
    const c = [...lineItems];
    const before = { ...c[idx] };
    c[idx][field] = value;
    if (field === 'date' || field === 'start_time' || field === 'end_time' || field === 'category_code') {
      c[idx].description = syncDescription(before, c[idx]);
    }
    // Start and end are for information only: paid hours (quantity) are entered directly,
    // because an unpaid break can sit between them.
    if (field === 'category_code' && ['Transportation', 'Accommodation'].includes(value)) {
      c[idx].quantity = 1;
    }
    c[idx].total = recalc(c[idx]);
    setLineItems(c);
  };
  const addRow = () => {
    setLineItems(items => [
      ...items,
      {
        id: `man-${Date.now()}`,
        date: invoiceDate || '',
        start_time: '00:00:00',
        end_time: '00:00:00',
        category_code: '',
        unit: 'Lump Sum',
        quantity: 1,
        unit_price: 0,
        discount: 0,
        total: 0,
      },
    ]);
  };
  const removeRow = (idx: number) => {
    setLineItems(items => {
      const c = [...items];
      c.splice(idx, 1);
      return c;
    });
  };

  // --- Save changes ---
  const handleSave = () => {
    if (!invoice) return;
    setSubmitting(true);
    setActionError('');
    updateInvoice(Number(id), {
      // All fields for save
      external,
      issuer_first_name: issuerFirstName,
      issuer_last_name: issuerLastName,
      issuer_abn: issuerAbn,
      issuer_email: issuerEmail,
      gst_registered: gstRegistered,
      super_rate_snapshot: superRateSnapshot,
      super_fund_name: superFundName,
      super_usi: superUsi,
      super_member_number: superMemberNumber,
      bank_account_name: bankAccountName,
      bsb,
      account_number: accountNumber,
      cc_emails: ccEmails,
      invoice_date: invoiceDate,
      due_date: dueDate,
      pharmacy_name_snapshot: pharmacyNameSnapshot,
      pharmacy_address_snapshot: pharmacyAddressSnapshot,
      pharmacy_abn_snapshot: pharmacyAbnSnapshot,
      // pharmacy_state_snapshot: pharmacyStateSnapshot,
      bill_to_first_name: billToFirstName,
      bill_to_last_name: billToLastName,
      bill_to_email: billToEmail,
      bill_to_abn: billToAbn,
      custom_bill_to_name: customBillToName,
      custom_bill_to_address: customBillToAddress,
      line_items: lineItems.map(li => ({
        ...li,
        description: descriptionForSave(li),
        quantity: Number(li.quantity),
        unit_price: Number(li.unit_price),
        discount: Number(li.discount),
        total: Number(li.total),
      })),
    })
.then(() => {
  setSnackbar({ open: true, msg: 'Saved successfully' });
  // Ensure user exists and has a role before navigating
  setTimeout(() => {
    if (user && user.role) {
      // Go to the correct invoice management page for both PHARMACIST and OTHER_STAFF
      navigate(`/dashboard/${dashboardRoleSegment(user.role)}/invoice`);
    } else {
      // Fallback: If user is null (shouldn't happen, but for safety)
      navigate('/dashboard/invoice');
    }
  }, 700);
})
.catch((error: any) => {
  const detail = error?.response?.data?.detail;
  setActionError(typeof detail === 'string' && detail ? `Your changes weren't saved: ${detail}` : "Your changes weren't saved. Check your connection and try again; nothing you typed has been lost.");
  window.scrollTo({ top: 0, behavior: 'smooth' });
})
.finally(() => setSubmitting(false));
  };

  const handleStatusChange = (status: 'sent' | 'paid') => {
    if (!invoice) return;
    setSubmitting(true);
    setActionError('');
    setNotice('');
    updateInvoice(Number(id), { status } as any)
      .then((updated: any) => {
        setInvoice(updated || { ...invoice, status });
        setSnackbar({ open: true, msg: status === 'paid' ? 'Invoice marked as paid' : 'Invoice marked as unpaid' });
      })
      .catch(() => setActionError(status === 'paid' ? "The invoice wasn't marked as paid. Try again." : "The invoice wasn't marked as unpaid. Try again."))
      .finally(() => setSubmitting(false));
  };

  const handleDownloadPdf = () => {
    if (!id) return;
    apiClient
      .get(`/invoices/${Number(id)}/pdf/`, { responseType: 'blob' })
      .then((response) => {
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoice_${id}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => setActionError("The PDF didn't download. Try again in a moment."));
  };

  const handleReportIssue = () => {
    if (!invoice) return;
    setSubmitting(true);
    setActionError('');
    const message = reportNote.trim();
    reportInvoiceIssue(invoice.id, message ? { message } : {})
      .then(() => {
        setReportOpen(false);
        setNotice(`Issue reported. ${`${issuerFirstName} ${issuerLastName}`.trim() || 'The sender'} has been notified.`);
      })
      .catch((error: any) => {
        const detail = error?.response?.data?.detail;
        setReportOpen(false);
        setActionError(typeof detail === 'string' && detail ? detail : "The issue wasn't reported. Try again.");
      })
      .finally(() => setSubmitting(false));
  };

  const copyValue = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setSnackbar({ open: true, msg: `${label} copied` });
    } catch {
      setSnackbar({ open: true, msg: `Couldn't copy the ${label.toLowerCase()}` });
    }
  };

  
  // --- UI ---
  const totals: Totals = {
    subtotal,
    transportation,
    accommodation,
    gst,
    superRate: superRateSnapshot,
    superAmount: Number(superAmount),
    grandTotal,
  };
  const statusKey = String(invoice?.status || '').toLowerCase();
  const issuerName = `${issuerFirstName} ${issuerLastName}`.trim();
  const billToName = external ? customBillToName : `${billToFirstName} ${billToLastName}`.trim();
  const listPath = location.pathname.replace(/\/[^/]+\/?$/, '') || `/dashboard/${dashboardRoleSegment(user?.role)}/invoice`;
  const backLink = (
    <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(listPath)} sx={{ minHeight: 36, ml: -1.25, mb: 1, color: 'var(--ct-text-secondary)', fontWeight: 600 }}>
      Invoices
    </Button>
  );

  if (loading) {
    return (
      <Box data-ct-tokens="" sx={pageSx} role="status" aria-busy="true" aria-label="Loading invoice">
        {backLink}
        <Skeleton width={260} height={44} />
        <Skeleton width={340} />
        <Stack spacing={2} sx={{ mt: 3 }}>
          {[160, 220, 280].map((h) => <Skeleton key={h} variant="rounded" height={h} sx={{ borderRadius: 'var(--ct-card-radius)' }} />)}
        </Stack>
      </Box>
    );
  }

  if (!invoice) {
    return (
      <Box data-ct-tokens="" sx={pageSx}>
        {backLink}
        <DashboardContentState
          kind="error"
          title={`Invoice #${id} can't load right now`}
          description="This is a connection problem, or the invoice is no longer available to you. Nothing has been changed."
          actionLabel="Try again"
          onAction={() => setLoadAttempt((n) => n + 1)}
        />
      </Box>
    );
  }

  const header = (
    <PageHeader
      title={
        <Stack component="span" direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
          <span>Invoice #{id}</span>
          <StatusPill status={invoice.status} dueDate={dueDate} />
        </Stack>
      }
      subtitle={
        isOwner
          ? [issuerName && `From ${issuerName}`, dueDate && `due ${formatDay(dueDate)}`].filter(Boolean).join(' · ')
          : [billToName && `To ${billToName}`, dueDate && `due ${formatDay(dueDate)}`].filter(Boolean).join(' · ')
      }
      actions={
        isOwner ? (
          <>
            <Button variant="outlined" startIcon={<Download size={16} />} onClick={handleDownloadPdf} sx={{ minHeight: 44 }}>Download PDF</Button>
            <Button variant="outlined" color="warning" startIcon={<Flag size={16} />} onClick={() => { setReportNote(''); setReportOpen(true); }} disabled={submitting} sx={{ minHeight: 44 }}>
              Report an issue
            </Button>
            {statusKey === 'paid' ? (
              <Button variant="outlined" onClick={() => handleStatusChange('sent')} disabled={submitting} sx={{ minHeight: 44 }}>Mark as unpaid</Button>
            ) : (
              <Tooltip title={['sent', 'pending'].includes(statusKey) ? 'Record that you have paid this invoice' : 'Only sent invoices can be marked paid'}>
                <span>
                  <Button
                    variant="contained"
                    startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <CheckCircle2 size={16} />}
                    onClick={() => handleStatusChange('paid')}
                    disabled={submitting || !['sent', 'pending'].includes(statusKey)}
                    sx={{ minHeight: 44 }}
                  >
                    Mark as paid
                  </Button>
                </span>
              </Tooltip>
            )}
          </>
        ) : (
          <Button variant="outlined" startIcon={<Download size={16} />} onClick={handleDownloadPdf} sx={{ minHeight: 44 }}>Download PDF</Button>
        )
      }
    />
  );

  const notices = (
    <Stack spacing={1.25} sx={{ mb: notice || actionError ? 2.5 : 0 }}>
      {actionError ? <Alert severity="error" onClose={() => setActionError('')}>{actionError}</Alert> : null}
      {notice ? <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert> : null}
    </Stack>
  );

  const reportDialog = (
    <Dialog open={reportOpen} onClose={() => !submitting && setReportOpen(false)} fullWidth maxWidth="sm" aria-labelledby="report-issue-title">
      <DialogTitle id="report-issue-title" sx={{ fontWeight: 600 }}>Report an issue with invoice #{id}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 15, lineHeight: 1.55 }}>
          {issuerName || 'The sender'} gets a notification so they can fix and resend the invoice. The invoice itself isn't changed.
        </Typography>
        <TextField
          label="What needs fixing? (optional)"
          placeholder="For example: the 9 October shift should be 8 hours, not 9."
          multiline
          minRows={3}
          value={reportNote}
          onChange={(e) => setReportNote(e.target.value)}
          inputProps={{ maxLength: 1000 }}
          fullWidth
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={() => setReportOpen(false)} disabled={submitting}>Cancel</Button>
        <Button variant="contained" onClick={handleReportIssue} disabled={submitting} startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <Flag size={16} />}>
          {submitting ? 'Sending…' : 'Send to sender'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const snack = (
    <Snackbar
      open={snackbar.open}
      autoHideDuration={4000}
      onClose={() => setSnackbar({ open: false, msg: '' })}
      message={snackbar.msg}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      action={
        <IconButton size="small" aria-label="Close" onClick={() => setSnackbar({ open: false, msg: '' })} color="inherit">
          <CloseIcon fontSize="small" />
        </IconButton>
      }
    />
  );

  /* ---------- recipient (owner): a read-only invoice document ---------- */
  if (isOwner) {
    return (
      <Box data-ct-tokens="" sx={pageSx}>
        {backLink}
        {header}
        {notices}
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 2fr) minmax(300px, 1fr)' }, alignItems: 'start' }}>
          <Stack spacing={2.5} sx={{ minWidth: 0 }}>
            <InvoiceSection icon={<FileText />} tone="violet" title="Invoice">
              <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mb: 2.5 }}>
                <Box>
                  <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 12.5, mb: 0.5 }}>From</Typography>
                  <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600 }}>{issuerName || '—'}</Typography>
                  {issuerEmail ? <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>{issuerEmail}</Typography> : null}
                  {issuerAbn ? <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>ABN {issuerAbn}</Typography> : null}
                  <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>{gstRegistered ? 'GST registered' : 'Not GST registered'}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 12.5, mb: 0.5 }}>Bill to</Typography>
                  <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600 }}>{external ? customBillToName || '—' : pharmacyNameSnapshot || '—'}</Typography>
                  {(external ? customBillToAddress : pharmacyAddressSnapshot) ? (
                    <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>{external ? customBillToAddress : pharmacyAddressSnapshot}</Typography>
                  ) : null}
                  {(external ? billToAbn : pharmacyAbnSnapshot) ? <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>ABN {external ? billToAbn : pharmacyAbnSnapshot}</Typography> : null}
                  {!external && `${billToFirstName} ${billToLastName}`.trim() ? (
                    <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>Attention {`${billToFirstName} ${billToLastName}`.trim()}</Typography>
                  ) : null}
                </Box>
              </Box>
              <Facts
                columns={3}
                items={[
                  { label: 'Invoice date', value: formatDay(invoiceDate) },
                  { label: 'Due date', value: formatDay(dueDate) },
                  { label: 'Status', value: invoiceStatus(invoice.status, dueDate).label },
                ]}
              />
            </InvoiceSection>
            <InvoiceSection icon={<ListChecks />} tone="magenta" title="Line items">
              <LineItemsReadOnly items={lineItems} />
              <Box sx={{ mt: 2, ml: { sm: 'auto' }, maxWidth: { sm: 360 } }}>
                <TotalsBreakdown totals={totals} gstRegistered={gstRegistered} />
              </Box>
            </InvoiceSection>
          </Stack>
          <Stack spacing={2.5} sx={{ minWidth: 0 }}>
            <InvoiceSection icon={<Landmark />} tone="cyan" title="Pay to">
              <PayToDetails
                rows={[['Account name', bankAccountName], ['BSB', bsb], ['Account number', accountNumber]]}
                amountDue={money(grandTotal)}
                onCopy={(label, value) => void copyValue(label, value)}
              />
            </InvoiceSection>
            {Number(superAmount) > 0 || superFundName ? (
              <InvoiceSection icon={<PiggyBank />} tone="magenta" title="Superannuation">
                <Facts
                  items={[
                    { label: 'Rate', value: `${superRateSnapshot}%` },
                    { label: 'Amount', value: money(superAmount) },
                    { label: 'Fund', value: superFundName },
                    { label: 'USI', value: superUsi },
                    { label: 'Member number', value: superMemberNumber },
                  ]}
                />
              </InvoiceSection>
            ) : null}
            {ccEmails ? (
              <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 13.5, px: 0.5 }}>Copies sent to {ccEmails}</Typography>
            ) : null}
          </Stack>
        </Box>
        {reportDialog}
        {snack}
      </Box>
    );
  }

  /* ---------- issuer (worker): editable invoice ---------- */
  const autocompleteField = (
    refHolder: { current: google.maps.places.Autocomplete | null },
    onPlace: () => void,
    label: string,
    value: string,
    onValue: (v: string) => void,
  ) =>
    isLoaded ? (
      <Autocomplete onLoad={(ref) => (refHolder.current = ref)} onPlaceChanged={onPlace} options={{ componentRestrictions: { country: 'au' } }}>
        <TextField label={label} value={value} onChange={(e) => onValue(e.target.value)} fullWidth InputProps={{ endAdornment: <InputAdornment position="end"><MapPin size={16} /></InputAdornment> }} />
      </Autocomplete>
    ) : (
      <TextField label={label} value={value} onChange={(e) => onValue(e.target.value)} fullWidth />
    );

  return (
    <Box data-ct-tokens="" sx={pageSx}>
      {backLink}
      {header}
      {notices}
      <Stack spacing={2.5}>
        <InvoiceSection icon={<CalendarDays />} tone="violet" title="Dates">
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' } }}>
            <TextField label="Invoice date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Box>
        </InvoiceSection>

        <InvoiceSection icon={<Building2 />} tone="cyan" title="Bill to">
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            {external ? (
              <>
                <TextField label="Name" value={customBillToName} onChange={(e) => setCustomBillToName(e.target.value)} fullWidth />
                {autocompleteField(externalAutocompleteRef, handleExternalPlaceChanged, 'Address', customBillToAddress, setCustomBillToAddress)}
                <TextField label="Email" value={billToEmail} onChange={(e) => setBillToEmail(e.target.value)} fullWidth />
                <TextField label="ABN" value={billToAbn} onChange={(e) => setBillToAbn(e.target.value)} fullWidth />
              </>
            ) : (
              <>
                <TextField label="Pharmacy" value={pharmacyNameSnapshot} InputProps={{ readOnly: true }} helperText="From the shift" fullWidth />
                <TextField label="Pharmacy ABN" value={pharmacyAbnSnapshot} InputProps={{ readOnly: true }} fullWidth />
                {autocompleteField(internalAutocompleteRef, handleInternalPlaceChanged, 'Pharmacy address', pharmacyAddressSnapshot, setPharmacyAddressSnapshot)}
                <TextField label="Attention" value={`${billToFirstName} ${billToLastName}`.trim()} InputProps={{ readOnly: true }} fullWidth />
                <TextField label="Send to" value={billToEmail} InputProps={{ readOnly: true }} fullWidth />
              </>
            )}
            <TextField label="Copy to (CC)" helperText="Separate several emails with commas" value={ccEmails} onChange={(e) => setCcEmails(e.target.value)} fullWidth />
          </Box>
        </InvoiceSection>

        <InvoiceSection icon={<ListChecks />} tone="magenta" title="Line items">
          <LineItemsEditor
            items={lineItems}
            onChange={(idx, field, value) => updateRow(idx, field, value)}
            onAdd={addRow}
            onRemove={removeRow}
            isRowLocked={(li) => li.category_code === 'ProfessionalServices' && Boolean((li as any).source_assignment)}
          />
          <Box sx={{ mt: 2.5, ml: { sm: 'auto' }, maxWidth: { sm: 380 } }}>
            <TotalsBreakdown totals={totals} gstRegistered={gstRegistered} />
          </Box>
        </InvoiceSection>

        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '1fr 1fr' } }}>
          <InvoiceSection icon={<UserRound />} tone="violet" title="From">
            <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600 }}>{issuerName || '—'}</Typography>
            {issuerEmail ? <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>{issuerEmail}</Typography> : null}
            {issuerAbn ? <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>ABN {issuerAbn}</Typography> : null}
            <FormControlLabel
              sx={{ mt: 1.5 }}
              control={<Switch checked={!!gstRegistered} onChange={(e) => setGstRegistered(e.target.checked)} />}
              label={<Typography sx={{ fontSize: 14.5 }}>GST registered <Box component="span" sx={{ color: 'var(--ct-text-secondary)' }}>· adds 10% GST to professional services</Box></Typography>}
            />
          </InvoiceSection>
          <InvoiceSection icon={<Landmark />} tone="cyan" title="Pay to">
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField label="Account name" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} fullWidth sx={{ gridColumn: '1 / -1' }} />
              <TextField label="BSB" value={bsb} onChange={(e) => setBsb(e.target.value)} fullWidth />
              <TextField label="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} fullWidth />
            </Box>
          </InvoiceSection>
        </Box>

        <InvoiceSection icon={<PiggyBank />} tone="magenta" title="Superannuation">
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: '120px minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)' } }}>
            <TextField label="Rate (%)" type="number" value={superRateSnapshot} onChange={(e) => setSuperRateSnapshot(Number(e.target.value))} fullWidth />
            <TextField label="Fund name" value={superFundName} onChange={(e) => setSuperFundName(e.target.value)} fullWidth />
            <TextField label="USI" value={superUsi} onChange={(e) => setSuperUsi(e.target.value)} fullWidth />
            <TextField label="Member number" value={superMemberNumber} onChange={(e) => setSuperMemberNumber(e.target.value)} fullWidth />
          </Box>
        </InvoiceSection>

      </Stack>

      <Paper
        elevation={0}
        sx={{
          position: 'sticky',
          bottom: { xs: 8, md: 16 },
          zIndex: 20,
          mt: 3,
          px: { xs: 2, md: 2.5 },
          py: 1.25,
          border: '1px solid var(--ct-border-color)',
          bgcolor: 'var(--ct-surface-bg)',
          borderRadius: 'var(--ct-card-radius)',
          boxShadow: '0 12px 32px rgba(6, 18, 58, 0.12)',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 12.5 }}>Total</Typography>
            <Typography sx={{ color: 'var(--ct-text-primary)', fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{money(grandTotal)}</Typography>
          </Box>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <Check size={16} />}
            sx={{ minHeight: 46, px: 3 }}
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </Stack>
      </Paper>
      {snack}
    </Box>
  );
}
