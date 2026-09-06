import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Container, Paper, Typography, Box, TextField, MenuItem,
  Table, TableHead, TableRow, TableCell, TableBody, Button,
  IconButton, TableContainer, Snackbar
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Close as CloseIcon } from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useJsApiLoader, Autocomplete } from '@react-google-maps/api';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { getInvoiceDetail, reportInvoiceIssue, updateInvoice } from '@chemisttasker/shared-core';
import apiClient from '../../../utils/apiClient';

dayjs.extend(utc);



const CATEGORY_CHOICES = [
  { code: 'ProfessionalServices', label: 'Professional services' },
  { code: 'Superannuation', label: 'Superannuation' },
  { code: 'Transportation', label: 'Transportation' },
  { code: 'Accommodation', label: 'Accommodation' },
  { code: 'Miscellaneous', label: 'Miscellaneous reimbursements' },
];
const UNIT_CHOICES = ['Hours', 'Lump Sum'];

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
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  // Main state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, msg: '' });
  const [invoice, setInvoice] = useState<any | null>(null);

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
  libraries: ['places'],
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

        // --- Parse dates/times from description if needed ---
        function parseDateTimeFromDescription(description: string) {
            // Ex: "2025-06-01 07:00–12:00"
            const match = description.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})–(\d{2}:\d{2})/);
            if (match) {
            return {
                date: match[1],
                start_time: match[2] + ':00',
                end_time: match[3] + ':00',
            };
            }
            return { date: '', start_time: '', end_time: '' };
        }

        setLineItems(
          (data.line_items || []).map((li: any) => {
            const times = parseDateTimeFromDescription(li.description || '');
            return {
              ...li,
              ...times,
              quantity: Number(li.quantity || 0),
              unit_price: Number(li.unit_price || 0),
              discount: Number(li.discount || 0),
              total: Number(li.total || 0),
            };
          })
        );
      })
      .catch(() => {
        setSnackbar({ open: true, msg: 'Failed to load invoice' });
      })
      .finally(() => setLoading(false));
  }, [id]);

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
    c[idx][field] = value;
    if (field === 'start_time' || field === 'end_time') {
      const { date, start_time, end_time } = c[idx];
      const start = dayjs.utc(`${date}T${start_time}`).local();
      const end = dayjs.utc(`${date}T${end_time}`).local();
      c[idx].quantity = parseFloat(((end.valueOf() - start.valueOf()) / 3600000).toFixed(2));
    }
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
.catch(() => setSnackbar({ open: true, msg: 'Save failed' }))
.finally(() => setSubmitting(false));
  };

  const handleStatusChange = (status: 'sent' | 'paid') => {
    if (!invoice) return;
    setSubmitting(true);
    updateInvoice(Number(id), { status } as any)
      .then((updated: any) => {
        setInvoice(updated || { ...invoice, status });
        setSnackbar({ open: true, msg: status === 'paid' ? 'Invoice marked as paid' : 'Invoice marked as unpaid' });
      })
      .catch(() => setSnackbar({ open: true, msg: 'Status update failed' }))
      .finally(() => setSubmitting(false));
  };

  const handleDownloadPdf = () => {
    if (!id) return;
    apiClient
      .get(`/client-profile/invoices/${Number(id)}/pdf/`, { responseType: 'blob' })
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
      .catch(() => setSnackbar({ open: true, msg: 'Failed to download invoice PDF' }));
  };

  const handleReportIssue = () => {
    if (!invoice) return;
    setSubmitting(true);
    reportInvoiceIssue(invoice.id)
      .then(() => setSnackbar({ open: true, msg: 'Issue reported to sender' }))
      .catch(() => setSnackbar({ open: true, msg: 'Failed to report invoice issue' }))
      .finally(() => setSubmitting(false));
  };

  
  // --- UI ---
  if (loading) {
    return (
      <Container sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="h6">Loading invoice...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 4, mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Invoice #{id}
        </Typography>
        {isOwner && (
          <Box display="flex" gap={1} flexWrap="wrap" mt={2}>
            {String(invoice?.status || '').toLowerCase() === 'paid' ? (
              <Button variant="outlined" onClick={() => handleStatusChange('sent')} disabled={submitting}>
                Mark as Unpaid
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={() => handleStatusChange('paid')}
                disabled={submitting || !['sent', 'pending'].includes(String(invoice?.status || '').toLowerCase())}
              >
                Mark as Paid
              </Button>
            )}
            <Button variant="outlined" onClick={handleDownloadPdf}>
              Download PDF
            </Button>
            <Button variant="outlined" color="warning" onClick={handleReportIssue} disabled={submitting}>
              Report Issue to Sender
            </Button>
          </Box>
        )}

        <Box component="fieldset" disabled={isOwner} sx={{ border: 0, m: 0, p: 0 }}>
        {/* Dates */}
        <Box mt={3} display="flex" gap={2}>
          <TextField
            label="Invoice Date"
            type="date"
            value={invoiceDate}
            onChange={e => setInvoiceDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Box>

        {/* Bill-To Section */}
        <Typography variant="h6" gutterBottom mt={4}>
          Billing-To Details
        </Typography>
        <Box display="flex" gap={2} flexWrap="wrap" mb={4}>
          {external ? (
            <>
              <Box flex="1 1 45%">
                <TextField
                  label="Bill-To Name"
                  value={customBillToName}
                  onChange={e => setCustomBillToName(e.target.value)}
                  fullWidth
                />
              </Box>
              <Box flex="1 1 45%">
                {isLoaded ? (
                  <Autocomplete
                    onLoad={(ref) => (externalAutocompleteRef.current = ref)}
                    onPlaceChanged={handleExternalPlaceChanged}
                    options={{ componentRestrictions: { country: 'au' } }} 
                  >
                    <TextField
                      label="Bill-To Address"
                      value={customBillToAddress}
                      onChange={e => setCustomBillToAddress(e.target.value)}
                      fullWidth
                    />
                  </Autocomplete>
                ) : (
                  <TextField
                    label="Bill-To Address"
                    value={customBillToAddress}
                    onChange={e => setCustomBillToAddress(e.target.value)}
                    fullWidth
                  />
                )}
              </Box>
              <Box flex="1 1 45%">
                <TextField
                  label="Bill-To Email"
                  value={billToEmail}
                  onChange={e => setBillToEmail(e.target.value)}
                  fullWidth
                />
              </Box>
              <Box flex="1 1 45%">
                <TextField
                  label="Bill-To ABN"
                  value={billToAbn}
                  onChange={e => setBillToAbn(e.target.value)}
                  fullWidth
                />
              </Box>
            </>
          ) : (
            <>
              <Box flex="1 1 30%">
                <TextField label="Facility Name" value={pharmacyNameSnapshot} InputProps={{ readOnly: true }} fullWidth />
              </Box>
              <Box flex="1 1 15%">
                <TextField label="Facility ABN" value={pharmacyAbnSnapshot} InputProps={{ readOnly: true }} fullWidth />
              </Box>
              <Box flex="1 1 20%">

                {isLoaded ? (
                  <Autocomplete
                    onLoad={(ref) => (internalAutocompleteRef.current = ref)}
                    onPlaceChanged={handleInternalPlaceChanged}
                    options={{ componentRestrictions: { country: 'au' } }} 
                  >
                    <TextField
                      label="Facility Address"
                      value={pharmacyAddressSnapshot}
                      onChange={e => setPharmacyAddressSnapshot(e.target.value)}
                      fullWidth
                    />
                  </Autocomplete>
                ) : (
                  <TextField
                    label="Facility Address"
                    value={pharmacyAddressSnapshot}
                    onChange={e => setPharmacyAddressSnapshot(e.target.value)}
                    fullWidth
                  />
                )}

              </Box>
              {/* <Box flex="1 1 15%">
                <TextField label="Facility State" value={pharmacyStateSnapshot} InputProps={{ readOnly: true }} fullWidth />
              </Box> */}
              <Box flex="1 1 30%">
                <TextField label="Bill-To Name" value={`${billToFirstName} ${billToLastName}`} InputProps={{ readOnly: true }} fullWidth />
              </Box>
              <Box flex="1 1 30%">
                <TextField label="Bill-To Email" value={billToEmail} InputProps={{ readOnly: true }} fullWidth />
              </Box>
            </>
          )}
          <Box flex="1 1 45%">
            <TextField label="CC Emails" helperText="Comma-separated" value={ccEmails} onChange={e => setCcEmails(e.target.value)} fullWidth />
          </Box>
        </Box>

        {/* Issuer info */}
        <Typography variant="h6" gutterBottom>
          Issuer Information
        </Typography>
        <Box display="flex" justifyContent="flex-start" mb={4}>
          <Box>
            <Typography>{issuerFirstName} {issuerLastName}</Typography>
            <Typography>{issuerEmail}</Typography>
            <Typography variant="body2">ABN: {issuerAbn}</Typography>
          </Box>
        </Box>

        {/* GST & Super */}
        <Typography variant="h6" gutterBottom>
          GST Information
        </Typography>
        <Box display="flex" gap={2} alignItems="center" mb={4}>
          <Box>
            <label>
              <input
                type="checkbox"
                checked={!!gstRegistered}
                onChange={e => setGstRegistered(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              GST Registered
            </label>
          </Box>
        </Box>
        <Typography variant="h6" gutterBottom>
          Superannuation
        </Typography>
        <Box display="flex" gap={2} flexWrap="wrap" mb={4}>
          <Box sx={{ flex: '1 1 20%' }}>
            <TextField
              fullWidth
              label="Super Rate (%)"
              type="number"
              value={superRateSnapshot}
              onChange={e => setSuperRateSnapshot(Number(e.target.value))}
            />
          </Box>
          <Box sx={{ flex: '1 1 40%' }}>
            <TextField
              fullWidth
              label="Super Fund Name"
              value={superFundName}
              onChange={e => setSuperFundName(e.target.value)}
            />
          </Box>
          <Box sx={{ flex: '1 1 20%' }}>
            <TextField
              fullWidth
              label="Super USI"
              value={superUsi}
              onChange={e => setSuperUsi(e.target.value)}
            />
          </Box>
          <Box sx={{ flex: '1 1 20%' }}>
            <TextField
              fullWidth
              label="Member #"
              value={superMemberNumber}
              onChange={e => setSuperMemberNumber(e.target.value)}
            />
          </Box>
        </Box>

        {/* Banking */}
        <Typography variant="h6" gutterBottom>
          Banking Details
        </Typography>
        <Box display="flex" gap={2} flexWrap="wrap" mb={4}>
          <Box sx={{ flex: '1 1 45%' }}>
            <TextField
              fullWidth
              label="Account Name"
              value={bankAccountName}
              onChange={e => setBankAccountName(e.target.value)}
            />
          </Box>
          <Box sx={{ flex: '1 1 25%' }}>
            <TextField
              fullWidth
              label="BSB"
              value={bsb}
              onChange={e => setBsb(e.target.value)}
            />
          </Box>
          <Box sx={{ flex: '1 1 25%' }}>
            <TextField
              fullWidth
              label="Account Number"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
            />
          </Box>
        </Box>

        {/* Line Items Table */}
        <Box mt={3}>
<TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
  <Table size="medium" padding="checkbox" stickyHeader>
    <TableHead>
      <TableRow>
        <TableCell align="center" sx={{ width: '20%' }}>Category</TableCell>
        <TableCell align="center" sx={{ width: '10%' }}>Date</TableCell>
        <TableCell align="center" sx={{ width: '10%' }}>Start</TableCell>
        <TableCell align="center" sx={{ width: '8%'  }}>End</TableCell>
        <TableCell align="center" sx={{ width: '5%'  }}>Hours</TableCell>
        <TableCell align="center" sx={{ width: '5%'  }}>Unit</TableCell>
        <TableCell align="center" sx={{ width: '20%' }}>Price</TableCell>
        <TableCell align="center" sx={{ width: '5%'  }}>Discount</TableCell>
        <TableCell align="center" sx={{ width: '10%' }}>Amount</TableCell>
        <TableCell align="center" sx={{ width: '100%' }} />
      </TableRow>
    </TableHead>

    <TableBody>
      {lineItems.map((li, idx) => (
        <TableRow key={li.id || idx}>
          {/* Category (uses category_code) */}
          <TableCell align="center">
            <TextField
              variant="standard"
              select
              size="small"
              fullWidth
              value={li.category_code}
              onChange={e => updateRow(idx, 'category_code', e.target.value)}
              disabled={li.category_code === 'Superannuation'}
            >
              {CATEGORY_CHOICES.map(c => (
                <MenuItem key={c.code} value={c.code}>{c.label}</MenuItem>
              ))}
            </TextField>
          </TableCell>

          {/* Date/Start/End only for Professional services */}
          {li.category_code === 'ProfessionalServices' ? (
            <>
              <TableCell align="center">
                <TextField
                  variant="standard"
                  size="small"
                  type="date"
                  fullWidth
                  value={li.date || ''}
                  onChange={e => updateRow(idx, 'date', e.target.value)}
                  InputProps={{ sx: { textAlign: 'center' } }}
                />
              </TableCell>

              <TableCell align="center">
                <TextField
                  variant="standard"
                  size="small"
                  type="time"
                  value={li.start_time?.slice(0, 5) || '00:00'}
                  onChange={e => {
                    const raw = e.target.value;
                    const newVal = raw ? raw + ':00' : '00:00:00';
                    updateRow(idx, 'start_time', newVal);
                  }}
                  sx={{ minWidth: 110 }}
                  InputProps={{ sx: { textAlign: 'center' } }}
                />
              </TableCell>

              <TableCell align="center">
                <TextField
                  variant="standard"
                  size="small"
                  type="time"
                  value={li.end_time?.slice(0, 5) || '00:00'}
                  onChange={e => {
                    const raw = e.target.value;
                    const newVal = raw ? raw + ':00' : '00:00:00';
                    updateRow(idx, 'end_time', newVal);
                  }}
                  sx={{ minWidth: 110 }}
                  InputProps={{ sx: { textAlign: 'center' } }}
                />
              </TableCell>

              {/* Hours (read only) */}
              <TableCell align="center" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {Number(li.quantity || 0).toFixed(2)}
              </TableCell>
            </>
          ) : (
            <>
              <TableCell align="center" />
              <TableCell align="center" />
              <TableCell align="center" />
              {/* Transportation/Accommodation: fixed 1.00 */}
              <TableCell align="center" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {['Transportation', 'Accommodation'].includes(li.category_code) ? '1.00' : ''}
              </TableCell>
            </>
          )}

          {/* Unit */}
          <TableCell align="center">
            <TextField
              variant="standard"
              select
              size="small"
              fullWidth
              value={li.unit}
              onChange={e => updateRow(idx, 'unit', e.target.value)}
            >
              {UNIT_CHOICES.map(u => (
                <MenuItem key={u} value={u}>{u}</MenuItem>
              ))}
            </TextField>
          </TableCell>

          {/* Price */}
          <TableCell align="center">
            <TextField
              variant="standard"
              size="small"
              type="number"
              inputProps={{ step: 0.01, min: 0 }}
              value={li.unit_price}
              onChange={e => updateRow(idx, 'unit_price', +e.target.value)}
              disabled={li.category_code === 'Superannuation'}
              sx={{ width: 140 }}
              InputProps={{ sx: { textAlign: 'right', px: 0 } }}
            />
          </TableCell>

          {/* Discount (%) */}
          <TableCell align="center">
            <TextField
              variant="standard"
              size="small"
              type="number"
              inputProps={{ min: 0, max: 100 }}
              value={li.discount}
              onChange={e => updateRow(idx, 'discount', +e.target.value)}
              sx={{ width: 90 }}
              InputProps={{ sx: { textAlign: 'right', px: 0 } }}
            />
          </TableCell>

          {/* Amount (read-only) */}
          <TableCell align="center" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {Number(li.total || 0).toFixed(2)}
          </TableCell>

          {/* Delete */}
          <TableCell align="center">
            {!isOwner && (
              <IconButton onClick={() => removeRow(idx)} size="small">
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</TableContainer>

          <Box mt={1}>
            {!isOwner && (
              <Button startIcon={<AddIcon />} onClick={addRow} size="small">
                Add Line Item
              </Button>
            )}
          </Box>
        </Box>

        {/* Totals & Save */}
        <Box mt={4} textAlign="right">
          <Typography>Subtotal: ${Number(subtotal).toFixed(2)}</Typography>
          <Typography>Transportation: ${Number(transportation).toFixed(2)}</Typography>
          <Typography>Accommodation: ${Number(accommodation).toFixed(2)}</Typography>
          <Typography>GST (10%): ${Number(gst).toFixed(2)}</Typography>
          <Typography>Super ({superRateSnapshot}%): ${Number(superAmount).toFixed(2)}</Typography>
          <Typography variant="h6">Grand Total: ${Number(grandTotal).toFixed(2)}</Typography>
        </Box>
        </Box>

        {/* Save button */}
        <Box mt={2} textAlign="right">
          {!isOwner && (
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </Box>

        {/* Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar({ open: false, msg: '' })}
          message={snackbar.msg}
          action={
            <IconButton size="small" onClick={() => setSnackbar({ open: false, msg: '' })} color="inherit">
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        />
      </Paper>
    </Container>
  );
}
