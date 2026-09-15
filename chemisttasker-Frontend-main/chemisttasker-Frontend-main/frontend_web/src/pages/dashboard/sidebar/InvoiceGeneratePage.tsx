// src/pages/dashboard/sidebar/InvoiceGeneratePage.tsx
import { useState, useEffect, useCallback, useRef  } from 'react';
import {
  Container, Paper, Typography, Tabs, Tab,
  Box, TextField, MenuItem, Checkbox, FormControlLabel,
  Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, TableContainer
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useJsApiLoader, Autocomplete } from '@react-google-maps/api';
import { useSearchParams } from 'react-router-dom';
import {
  getOnboarding,
  getMyHistoryShifts,
  previewInvoice,
  generateInvoice,
} from '@chemisttasker/shared-core';

dayjs.extend(utc);

interface ShiftSlot {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  recurring_days: number[];
  recurring_end_date: string | null;
}

interface Shift {
  id: number;
  pharmacy_detail: {
    id: number;
    name: string;
    abn: string | null;
    // structured fields coming from backend
    street_address?: string | null;
    suburb?: string | null;
    state?: string | null;
    postcode?: string | null;
  };
  created_by_first_name?: string;
  created_by_last_name?:  string;
  created_by_email?:      string;
  fixed_rate: string;
  slots: ShiftSlot[];
}


interface LineItem {
  id: string;
  shiftSlotId?: number;
  slot_date?: string;  // ✅ Add this line
  date: string;
  start_time: string;
  end_time: string;
  category: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
}

const CATEGORY_CHOICES = [
  { code: 'ProfessionalServices', label: 'Professional services' },
  { code: 'Superannuation', label: 'Superannuation' },
  { code: 'Transportation', label: 'Transportation' },
  { code: 'Accommodation', label: 'Accommodation' },
  { code: 'Miscellaneous', label: 'Miscellaneous reimbursements' },
];
const UNIT_CHOICES = ['Hours', 'Lump Sum'];



const shiftLabel = (s: any) => {
  const name = s?.pharmacy_detail?.name ?? 'Pharmacy';
  const first = s?.slots?.[0] ?? null;

  // prefer slot fields; fall back to any top-level fields if present
  const date = first?.date ?? s?.start_date ?? s?.date ?? null;
  const start = first?.start_time ?? s?.start_time ?? null;
  const end   = first?.end_time   ?? s?.end_time   ?? null;

  const role = s?.role_needed ?? s?.role ?? '';
  const dateStr = date ? dayjs.utc(date).local().format('DD MMM YYYY') : 'No date';
  const timeStr = start && end ? ` (${String(start).slice(0,5)}–${String(end).slice(0,5)})` : '';

  // small hints to differentiate recurring/multi-slot shifts
  const recurring = first?.is_recurring ? ' (Recurring)' : '';
  const more = s?.slots?.length > 1 ? ` (+${s.slots.length - 1} more)` : '';
  const roleStr = role ? ` [${role}]` : '';

  return `${name} – ${dateStr}${timeStr}${roleStr}${recurring || more}`;
};

export default function InvoiceGeneratePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [search] = useSearchParams();
    const prefillShiftId = search.get('shiftId');

    // --- Mode & Dates ---
    const [mode, setMode] = useState<'internal'|'external'>('internal');
    const today = new Date().toISOString().slice(0,10);
    const [invoiceDate, setInvoiceDate] = useState(today);
    const [dueDate, setDueDate]       = useState(today);

    // --- Shifts Fetch/Select ---
    const [shifts, setShifts]               = useState<Shift[]>([]);
    const [loadingShifts, setLoadingShifts] = useState(false);
    const [shiftError, setShiftError]       = useState<string|null>(null);
    const [selectedShiftId, setSelectedShiftId] = useState<number|''>('');


    // ─── Issuer Details ──────────────────────────────────  
    const [issuerFirstName, setIssuerFirstName] = useState('');
    const [issuerLastName,  setIssuerLastName]  = useState('');
    const issuerEmail = user?.email ?? '';
    const [issuerAbn,       setIssuerAbn]       = useState('');

    // Google Places loader (same as PharmacyPage)
    const { isLoaded } = useJsApiLoader({
      googleMapsApiKey: import.meta.env.VITE_Maps_API_KEY as string,
      libraries: ['places'],
    });

    // Keep a ref to the Autocomplete instance
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
    const internalAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

    // Handle place selection → fill external address (and name if empty)
    const handleExternalPlaceChanged = () => {
      if (!autocompleteRef.current) return;
      const place = autocompleteRef.current.getPlace();
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
        if (comp.types.includes('administrative_area_level_1')) stateShort = comp.short_name; // e.g., 'NSW'
        if (comp.types.includes('postal_code')) postalCode = comp.long_name;
      }

      const address = [`${streetNumber} ${route}`.trim(), suburb, stateShort, postalCode]
        .filter(Boolean)
        .join(', ');

      setExternalAddress(address);
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

      // This is your INTERNAL snapshot field:
      setPharmacyAddressSnapshot(address);

      // Optional: if you allow editing the name snapshot too, you can set it:
      // if (!pharmacyNameSnapshot && place.name) setPharmacyNameSnapshot(place.name);
    };

    // ─── Recipient (Shift-Creator) & Pharmacy Snapshots ──  
    const [billToFirstName,        setBillToFirstName]        = useState('');
    const [billToLastName,         setBillToLastName]         = useState('');
    const [billToEmail,            setBillToEmail]            = useState('');
    const [billToAbn,              setBillToAbn]              = useState('');
    const [pharmacyNameSnapshot,   setPharmacyNameSnapshot]   = useState('');
    const [pharmacyAddressSnapshot,setPharmacyAddressSnapshot]= useState('');
    const [facilityAbn,            setFacilityAbn]            = useState('');
    // const [facilityState, setFacilityState] = useState('');

    // ─── External Bill-To (fallback for mode==='external') ─  
    const [externalName,    setExternalName]    = useState('');
    const [externalAddress, setExternalAddress] = useState('');
    // const [externalState, setExternalState] = useState('');

    // ─── GST / Super / Banking / CC …────────────────────  
    const [gstRegistered, setGstRegistered]       = useState(true);
    const [gstCertFile,  setGstCertFile]          = useState<File|null>(null);
    const [superRateSnapshot, setSuperRateSnapshot]     = useState(10);
    const [superFundName,     setSuperFundName]         = useState('');
    const [superUsi,          setSuperUsi]              = useState('');
    const [superMemberNumber, setSuperMemberNumber]     = useState('');
    const [bankAccountName,   setBankAccountName]       = useState('');
    const [bsb,               setBsb]                   = useState('');
    const [accountNumber,     setAccountNumber]         = useState('');
    const [ccEmails,          setCcEmails]              = useState('');

    // --- Line Items & Submit State ---
    const [lineItems, setLineItems]     = useState<LineItem[]>([]);
    const [submitting, setSubmitting]   = useState(false);
    const [submitError, setSubmitError] = useState<string|null>(null);


// ─── A) Load issuer details once on mount ─────────────
useEffect(() => {
  if (!user) return;
  getOnboarding(user.role.toLowerCase())
    .then((res: any) => {
      setIssuerFirstName(res.first_name);
      setIssuerLastName(res.last_name);
      setIssuerAbn(res.abn ?? '');
    })
    .catch(() => {
      // handle error if needed
    });
}, [user]);

// ─── 1) Fetch shifts whenever we enter internal mode ────
useEffect(() => {
  if (mode !== 'internal') return;
  setLoadingShifts(true);

  getMyHistoryShifts({ payment_preference: 'ABN' })
    .then((res: any) => {
      const arr = Array.isArray(res?.results)
        ? res.results
        : Array.isArray(res)
        ? res
        : [];
      setShifts(arr as any);
      setShiftError(null);
    })
    .catch(() => {
      setShiftError('Failed to load shifts');
    })
    .finally(() => {
      setLoadingShifts(false);
    });
}, [mode]);

useEffect(() => {
  // Only run in internal mode when a shift is selected, shifts are loaded, and we have a logged-in user
  if (mode !== 'internal' || !selectedShiftId || shifts.length === 0 || !user) {
    return;
  }

  // Find the selected shift
  const shift = shifts.find(s => s.id === selectedShiftId);
  if (!shift) return;

  // — Pharmacy snapshot —
  setPharmacyNameSnapshot(shift.pharmacy_detail.name);
  setFacilityAbn(shift.pharmacy_detail.abn ?? '');
  // setFacilityState(shift.pharmacy_detail.state ?? '');
  // setPharmacyAddressSnapshot(shift.pharmacy_detail.address ?? '');
  const addrParts = [
    shift.pharmacy_detail.street_address,
    shift.pharmacy_detail.suburb,
    shift.pharmacy_detail.state,
    shift.pharmacy_detail.postcode,
  ].filter(Boolean);
  setPharmacyAddressSnapshot(addrParts.join(', '));
  // setFacilityState(shift.pharmacy_detail.state ?? '');

  // — Recipient (shift creator) snapshot via flat fields —
  setBillToFirstName(shift.created_by_first_name ?? '');
  setBillToLastName( shift.created_by_last_name  ?? '');
  setBillToEmail(    shift.created_by_email     ?? '');

  // — Fetch the recipient’s ABN if we have their email/role —
  const roleForOnboard = (shift as any).created_by_role?.toLowerCase() 
    ?? user.role.toLowerCase();
  if (shift.created_by_email) {
    getOnboarding(roleForOnboard)
      .then(r => setBillToAbn((r as any).abn ?? ''))
      .catch(() => setBillToAbn(''));
  } else {
    setBillToAbn('');
  }

  // — Expand recurring slots & build serviceRows —
  // ─ 🔥 New logic: fetch backend-calculated line items ─
  previewInvoice(shift.id)
    .then((res: any) => {
      const backendItems = Array.isArray(res) ? res : [];

      const manualExtras = lineItems.filter(
        li => !li.shiftSlotId && li.category !== 'Superannuation'
      );

      setLineItems([...backendItems, ...manualExtras]);
      const allItems = [...backendItems, ...manualExtras];
      setLineItems(allItems);
      // console.log("🔍 lineItems[0]:", allItems[0]);

    })
    .catch(() => {
      setLineItems([]);
    });

}, [mode, selectedShiftId, shifts, user]);


// ─── 3) Recompute Superannuation (unchanged) ─────────────
useEffect(() => {
  const serviceBase = lineItems
    .filter(li => li.category === 'ProfessionalServices')
    .reduce((sum, li) => sum + li.total, 0);

  const newSuper = parseFloat(((serviceBase * superRateSnapshot) / 100).toFixed(2));
  const existing = lineItems.find(li => li.category === 'Superannuation');
  if (existing && existing.total === newSuper) return;

  const withoutSuper = lineItems.filter(li => li.category !== 'Superannuation');
  const superLine: LineItem = {
    id:         'super',
    date:       today,
    start_time: '00:00:00',
    end_time:   '00:00:00',
    category:   'Superannuation',
    unit:       'Lump Sum',
    quantity:   1,
    unit_price: newSuper,
    discount:   0,
    total:      newSuper,
  };
  setLineItems([...withoutSuper, superLine]);
}, [lineItems, superRateSnapshot]);

useEffect(() => {
  if (!shifts.length) return;
  if (prefillShiftId) {
    setSelectedShiftId(Number(prefillShiftId)); // or whatever your setter is called
    setMode('internal'); // if appropriate
  }
}, [shifts]);

  // Recalc & row ops
    const recalc = useCallback((li: LineItem) => 
    parseFloat((li.quantity * li.unit_price * (1-li.discount/100)).toFixed(2)),
    []);
    
  // FIX 3: Improved updateRow function to handle manual extras
  const updateRow = (
    idx: number,
    field: keyof Omit<LineItem,'total'>,
    value: any
  ) => {
    const c = [...lineItems];
    // @ts-ignore
    c[idx][field] = value;
    
    // Recalc hours if start/end changed
    if(field === 'start_time' || field === 'end_time'){
      const { date, start_time, end_time } = c[idx];
      const s = dayjs.utc(`${date}T${start_time}`).local();
      const e = dayjs.utc(`${date}T${end_time}`).local();
      c[idx].quantity = parseFloat(((e.valueOf()-s.valueOf())/3600000).toFixed(2));
    }
    
    // Set quantity to 1 for Transportation and Accommodation
    if (field === 'category' && ['Transportation', 'Accommodation'].includes(value)) {
      c[idx].quantity = 1;
    }
    
    c[idx].total = recalc(c[idx]);
    setLineItems(c);
  };
  
  // FIX 3: Improved addRow with better defaults
  const addRow = () => {
    setLineItems(items => [
      ...items,
      {
        id: `man-${Date.now()}`,
        date: today,
        start_time: '00:00:00',
        end_time: '00:00:00',
        category: '',
        unit: 'Lump Sum',
        quantity: 1,
        unit_price: 0,
        discount: 0,
        total: 0,
      }
    ]);
  };
  
  const removeRow = (idx:number) =>
    setLineItems(items => { const c=[...items]; c.splice(idx,1); return c; });

  const subtotal = lineItems
    .filter(li => li.category !== 'Superannuation')
    .reduce((sum, li) => sum + li.total, 0);

  const transportation = lineItems
    .filter(li => li.category === 'Transportation')
    .reduce((sum, li) => sum + li.total, 0);

  const accommodation = lineItems
    .filter(li => li.category === 'Accommodation')
    .reduce((sum, li) => sum + li.total, 0);

  const gst = gstRegistered
    ? parseFloat(
        (
            lineItems
            .filter(li =>
                li.category !== 'Superannuation' &&
                li.category !== 'Transportation' &&
                li.category !== 'Accommodation'
            )
            .reduce((sum, li) => sum + li.total, 0)
            * 0.10
        ).toFixed(2)
        )
    : 0;


  const superAmount = lineItems.find(li => li.category === 'Superannuation')?.total || 0;

  // Grand total is correct, but we need to make sure transportation and accommodation
  // items have the right quantity and total values
  const grandTotal = parseFloat(
    (subtotal + gst + superAmount).toFixed(2)
  );

  // Submit via FormData to include the file
const handleGenerate = () => {
  const fd = new FormData();

  // Issuer snapshot
  fd.append('issuer_first_name',   issuerFirstName);
  fd.append('issuer_last_name',    issuerLastName);
  fd.append('issuer_email',        issuerEmail);
  fd.append('issuer_abn',          issuerAbn);

  // Core billing data
  fd.append('gst_registered', gstRegistered ? '1' : '0');
  fd.append('super_rate_snapshot', superRateSnapshot.toString());
  if (gstCertFile) fd.append('gst_certificate', gstCertFile);
  fd.append('super_fund_name',     superFundName);
  fd.append('super_usi',           superUsi);
  fd.append('super_member_number', superMemberNumber);
  fd.append('bank_account_name',   bankAccountName);
  fd.append('bsb',                 bsb);
  fd.append('account_number',      accountNumber);
  fd.append('cc_emails',           ccEmails);

  // Invoice dates
  fd.append('invoice_date',        invoiceDate);
  fd.append('due_date',            dueDate);

  if (mode === 'internal') {
    // Link to pharmacy + snapshot
    const selectedShift = shifts.find(s => s.id === selectedShiftId);
    fd.append('pharmacy', String(selectedShift?.pharmacy_detail.id || ''));
    fd.append('shift_ids',                 JSON.stringify([selectedShiftId]));
    fd.append('pharmacy_name_snapshot',    pharmacyNameSnapshot);
    fd.append('pharmacy_address_snapshot', pharmacyAddressSnapshot);
    fd.append('pharmacy_abn_snapshot',     facilityAbn);
    // fd.append('pharmacy_state_snapshot', facilityState);

    // Recipient snapshot (shift creator)
    fd.append('bill_to_first_name',        billToFirstName);
    fd.append('bill_to_last_name',         billToLastName);
    fd.append('bill_to_email',             billToEmail);
    fd.append('bill_to_abn',               billToAbn);
  } else {
    // External: free‐form bill-to
    fd.append('external',                  'true');
    fd.append('custom_bill_to_name',       externalName);
    fd.append('custom_bill_to_address',    externalAddress);
    fd.append('bill_to_abn', billToAbn);

    // And let user overwrite billToEmail if they wish
    fd.append('bill_to_email',             billToEmail);
  }

  // Finally the line items
  fd.append('line_items', JSON.stringify(
    lineItems.map(li => ({
      description:      `${li.date} ${li.start_time.slice(0,5)}–${li.end_time.slice(0,5)}`,
      category_code:    li.category,
      unit:             li.unit,
      quantity:         li.quantity,
      unit_price:       li.unit_price,
      discount:         li.discount,
      total:            li.total,
    }))
  ));

  setSubmitting(true);
  generateInvoice(fd)
    .then(() => {
      const role = user?.role?.toLowerCase() ?? 'pharmacist';
      navigate(`/dashboard/${role}/invoice`);
    })
    .catch((ex: any) => setSubmitError(ex?.response?.data?.error || 'Server error'))
    .finally(() => setSubmitting(false));
};


  return (
    <Container maxWidth="lg">
      <Paper sx={{ p:4, mt:4 }}>
        <Typography variant="h5">Generate Invoice</Typography>

        {/* Mode */}
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Tabs
            value={mode}
            onChange={(_, newMode) => {
              setMode(newMode);
              if (newMode === 'external') {
                setLineItems([]);
                // setIssuerAbn('');
              }
            }}
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab label="Internal" value="internal" />
            <Tab label="External" value="external" />
          </Tabs>
        </Box>

        {/* Dates */}
        <Box mt={5} display="flex" gap={2}>
          <TextField
            label="Invoice Date"
            type="date"
            value={invoiceDate}
            onChange={e=>setInvoiceDate(e.target.value)}
            InputLabelProps={{ shrink:true }}
          />
          <TextField
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={e=>setDueDate(e.target.value)}
            InputLabelProps={{ shrink:true }}
          />
        </Box>

        {/* Shift selector */}
        {mode==='internal' && (
          <Box mt={3}>
            {loadingShifts
              ? <Typography>Loading shifts…</Typography>
              : shiftError
                ? <Typography color="error">{shiftError}</Typography>
                : (
                  <TextField
                    select fullWidth label="Select Shift"
                    value={selectedShiftId}
                    onChange={e=>setSelectedShiftId(Number(e.target.value))}
                  >
                  <MenuItem value="">-- Choose Shift --</MenuItem>
                  {shifts.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {shiftLabel(s)}
                    </MenuItem>
                  ))}
                  </TextField>
                )}
          </Box>
        )}

        {/* Line Items */}
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
        <TableCell align="center" sx={{ width: '8%'  }}>Unit</TableCell>
        <TableCell align="center" sx={{ width: '16%' }}>Price</TableCell>
        <TableCell align="center" sx={{ width: '8%'  }}>Discount</TableCell>
        <TableCell align="center" sx={{ width: '10%' }}>Amount</TableCell>
        <TableCell align="center" sx={{ width: '5%'  }} />
      </TableRow>
    </TableHead>

    <TableBody>
      {lineItems.map((li, idx) => (
        <TableRow key={li.id}>
          {/* Category */}
          <TableCell align="center">
            <TextField
              variant="standard"
              select
              size="small"
              fullWidth
              value={li.category}
              onChange={e => updateRow(idx, 'category', e.target.value)}
            >
              {CATEGORY_CHOICES.map(c => (
                <MenuItem key={c.code} value={c.code}>{c.label}</MenuItem>
              ))}
            </TextField>
          </TableCell>

          {/* Only show Date/Start/End for Professional services */}
          {li.category === 'ProfessionalServices' ? (
            <>
              <TableCell align="center">
                <TextField
                  variant="standard"
                  size="small"
                  type="date"
                  value={li.date}
                  onChange={e => updateRow(idx, 'date', e.target.value)}
                  sx={{ minWidth: 120 }}
                  InputProps={{ sx: { textAlign: 'center' } }}
                />
              </TableCell>

              <TableCell align="center">
                <TextField
                  variant="standard"
                  size="small"
                  type="time"
                  value={li.start_time || '00:00'}
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
                  value={li.end_time || '00:00'}
                  onChange={e => {
                    const raw = e.target.value;
                    const newVal = raw ? raw + ':00' : '00:00:00';
                    updateRow(idx, 'end_time', newVal);
                  }}
                  sx={{ minWidth: 110 }}
                  InputProps={{ sx: { textAlign: 'center' } }}
                />
              </TableCell>

              {/* Hours */}
              <TableCell align="center" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {li.quantity.toFixed(2)}
              </TableCell>
            </>
          ) : (
            <>
              <TableCell align="center" />
              <TableCell align="center" />
              <TableCell align="center" />
              {/* Transportation/Accommodation: fixed 1.00 */}
              <TableCell align="center" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {['Transportation', 'Accommodation'].includes(li.category) ? '1.00' : ''}
              </TableCell>
            </>
          )}

          {/* Unit */}
          <TableCell align="center">
            <TextField
              variant="standard"
              select
              size="small"
              value={li.unit}
              onChange={e => updateRow(idx, 'unit', e.target.value)}
              sx={{ minWidth: 90 }}
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
              disabled={!!li.shiftSlotId || li.category === 'Superannuation'}
              sx={{ width: 120 }}
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
              sx={{ width: 80 }}
              InputProps={{ sx: { textAlign: 'right', px: 0 } }}
            />
          </TableCell>

          {/* Amount (read-only) */}
          <TableCell align="center" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {li.total.toFixed(2)}
          </TableCell>

          {/* Delete */}
          <TableCell align="center">
            <IconButton onClick={() => removeRow(idx)} size="small">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</TableContainer>

        <Box mt={1}>
            <Button startIcon={<AddIcon />} onClick={addRow} size="small">
            Add Line Item
            </Button>
        </Box>
        </Box>

        {/* Totals & Submit */}
        <Box mt={4} textAlign="right">
        <Typography>Subtotal: ${subtotal.toFixed(2)}</Typography>
        <Typography>Transportation: ${transportation.toFixed(2)}</Typography>
        <Typography>Accommodation: ${accommodation.toFixed(2)}</Typography>
        <Typography>GST (10%): ${gst.toFixed(2)}</Typography>
        <Typography>Super ({superRateSnapshot}%): ${superAmount.toFixed(2)}</Typography>
        <Typography variant="h6">Grand Total: ${grandTotal.toFixed(2)}</Typography>
        </Box>


    {/* ─── 1. Billing-To (Recipient) Details ─────────────────────────── */}
    <Typography variant="h6" gutterBottom>Billing-To Details</Typography>
    {/* 1. Billing-To (Recipient) / Facility */}
    <Box display="flex" gap={2} flexWrap="wrap" mb={4}>
      
      {/* Facility snapshot */}
      {mode==='internal' && <>
        <Box flex="1 1 30%">
          <TextField label="Facility Name" value={pharmacyNameSnapshot} InputProps={{readOnly:true}} fullWidth/>
        </Box>
        <Box flex="1 1 15%">
          <TextField label="Facility ABN"  value={facilityAbn}            InputProps={{readOnly:true}} fullWidth/>
        </Box>
        <Box flex="1 1 35%">
          {isLoaded ? (
            <Autocomplete
              onLoad={(ref) => (internalAutocompleteRef.current = ref)}
              onPlaceChanged={handleInternalPlaceChanged}
              options={{ componentRestrictions: { country: 'au' } }}
            >
              <TextField
                label="Pharmacy Address"
                value={pharmacyAddressSnapshot}
                onChange={(e) => setPharmacyAddressSnapshot(e.target.value)}
                fullWidth
              />
            </Autocomplete>
          ) : (
            <TextField
              label="Pharmacy Address"
              value={pharmacyAddressSnapshot}
              onChange={(e) => setPharmacyAddressSnapshot(e.target.value)}
              fullWidth
            />
          )}

        </Box>
        {/* <Box flex="1 1 15%">
          <TextField label="Facility State" value={facilityState} InputProps={{readOnly:true}} fullWidth/>
        </Box> */}
      </>}

      {/* Recipient snapshot */}
      {mode==='internal' && <>
        <Box flex="1 1 30%">
          <TextField label="Bill-To Name"  value={`${billToFirstName} ${billToLastName}`} InputProps={{readOnly:true}} fullWidth/>
        </Box>
        <Box flex="1 1 30%">
          <TextField label="Bill-To Email" value={billToEmail}  InputProps={{readOnly:true}} fullWidth/>
        </Box>
        {/* <Box flex="1 1 20%">
          <TextField label="Bill-To ABN"   value={billToAbn}    InputProps={{readOnly:true}} fullWidth/>
        </Box> */}
      </>}

      {/* External fallback */}
      {mode==='external' && <>
        <Box flex="1 1 45%">
          <TextField label="Bill-To Name" value={externalName} onChange={e=>setExternalName(e.target.value)} fullWidth/>
        </Box>
<Box flex="1 1 45%">
  {isLoaded ? (
    <Autocomplete
      onLoad={(ref) => (autocompleteRef.current = ref)}
      onPlaceChanged={handleExternalPlaceChanged}
      options={{ componentRestrictions: { country: 'au' } }}
    >
      <TextField
        label="Bill-To Address"
        value={externalAddress}
        onChange={(e) => setExternalAddress(e.target.value)}
        fullWidth
      />
    </Autocomplete>
  ) : (
    <TextField
      label="Bill-To Address"
      value={externalAddress}
      onChange={(e) => setExternalAddress(e.target.value)}
      fullWidth
    />
  )}
</Box>
        <Box flex="1 1 45%">
          <TextField label="Bill-To Email" value={billToEmail} onChange={e=>setBillToEmail(e.target.value)} fullWidth/>
        </Box>
        <Box flex="1 1 45%">
          <TextField label="Bill-To ABN"   value={billToAbn} onChange={e=>setBillToAbn(e.target.value)} fullWidth/>
        </Box>
      </>}

      {/* CC Emails */}
      <Box flex="1 1 45%">
        <TextField label="CC Emails" helperText="Comma-separated" value={ccEmails} onChange={e=>setCcEmails(e.target.value)} fullWidth/>
      </Box>
    </Box>

    {/* 2. Issuer summary on left */}
    <Typography variant="h6" gutterBottom >Issuer Information</Typography>
    <Box display="flex" justifyContent="flex-start" mb={4}>
      <Box>
        {/* <Typography variant="subtitle1">Issuer</Typography> */}
        <Typography>{issuerFirstName} {issuerLastName}</Typography>
        <Typography> {issuerEmail}</Typography>
        <Typography variant="body2">ABN: {issuerAbn}</Typography>
      </Box>
    </Box>


    {/* ─── 3. GST & Certificate ─────────────────────────────────────── */}
    <Typography variant="h6" gutterBottom >GST Information</Typography>
    <Box display="flex" gap={2} alignItems="center" mb={4}>
      <FormControlLabel
        control={
          <Checkbox
            checked={gstRegistered}
            onChange={e => setGstRegistered(e.target.checked)}
          />
        }
        label="GST Registered"
      />
      <Box>
        <Typography variant="body2" gutterBottom>GST Certificate</Typography>
        <input
          type="file"
          accept=".pdf,.jpg,.png"
          onChange={e => setGstCertFile(e.target.files?.[0] ?? null)}
        />
      </Box>
    </Box>

    {/* ─── 4. Superannuation Details ───────────────────────────────── */}
    <Typography variant="h6" gutterBottom>Superannuation</Typography>
    <Box display="flex" gap={2} flexWrap="wrap" mb={4}>
      <Box sx={{ flex: '1 1 20%' }}>
        <TextField
          fullWidth
          label="Super Rate (%)"
          type="number"
          value={superRateSnapshot}
          onChange={e => setSuperRateSnapshot(+e.target.value)}
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

    {/* ─── 5. Banking Details ──────────────────────────────────────── */}
    <Typography variant="h6" gutterBottom>Banking Details</Typography>
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

    {/* …your line-items table and Generate button here… */}





        {submitError && (
          <Typography color="error" mt={1}>{submitError}</Typography>
        )}
        <Box mt={2} textAlign="right">
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={
              submitting ||
              (mode==='internal' && !selectedShiftId) ||
              lineItems.length===0
            }
          >
            {submitting ? 'Generating…' : 'Generate Invoice'}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}
