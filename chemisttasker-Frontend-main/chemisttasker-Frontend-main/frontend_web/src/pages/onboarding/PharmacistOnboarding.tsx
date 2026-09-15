// src/pages/onboarding/PharmacistOnboardingForm.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Tabs,
  Tab,
  Typography,
  TextField,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Checkbox,
  FormGroup,
  Button,
  Alert,
  Snackbar,
  Link,
  Divider,
  MenuItem,
  InputAdornment
} from '@mui/material';
import { API_BASE_URL } from '../../constants/api';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { useNavigate } from 'react-router-dom';
import { AHPRA_CONSENT_TEXT } from '../../constants/ahpraConsent';
// import { useRef } from 'react';

interface RatePreference {
  weekday: string;
  saturday: string;
  sunday: string;
  public_holiday: string;
  early_morning: string;
  late_night: string;
}

interface FormData {
  username: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  government_id: File | null;
  ahpra_number: string;
  skills: string[];
  software_experience: string[];
  payment_preference: 'ABN' | 'TFN';
  abn: string;
  gst_registered: boolean;
  gst_file: File | null;
  tfn_declaration: File | null;
  super_fund_name: string;
  super_usi: string;
  super_member_number: string;
  rate_preference: RatePreference;
  referee1_name: string;
  referee1_relation: string;
  referee1_email: string;
  referee2_name: string;
  referee2_relation: string;
  referee2_email: string;
  referee1_confirmed: boolean;
  referee2_confirmed: boolean;
  short_bio: string;
  resume: File | null;
}

const SKILL_CHOICES = [
  { value: 'VACCINATION', label: 'Vaccination (w/ Anaphylaxis training)' },
  { value: 'CANNABIS', label: 'Cannabis handling (no cert)' },
  { value: 'COMPOUNDING', label: 'Compounding' },
  { value: 'CRED_PHARM', label: 'Credentialed Pharmacist' },
  { value: 'FIRST_AID', label: 'First Aid/CPR' },
  { value: 'PDL', label: 'PDL Insurance Certificate' },
];
const SOFTWARE_CHOICES = [
  { value: 'EXCEL', label: 'Excel' },
  { value: 'WORD', label: 'Word' },
];
const labels = [
  'Basic Info',
  'Skills',
  'Payment',
  'Rates',
  'Referees',
  'Profile',
];
const REFEREE_REL_CHOICES = [
  { value: "manager", label: "Manager" },
  { value: "supervisor", label: "Supervisor" },
  { value: "colleague", label: "Colleague" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
];


export default function PharmacistOnboardingForm() {
  const navigate = useNavigate();
  const roleKey = 'pharmacist';

  const [data, setData] = useState<FormData>({
    username: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    government_id: null,
    ahpra_number: '',
    skills: [],
    software_experience: [],
    payment_preference: 'TFN',
    abn: '',
    gst_registered: false,
    gst_file: null,
    tfn_declaration: null,
    super_fund_name: '',
    super_usi: '',
    super_member_number: '',
    rate_preference: {
      weekday: '',
      saturday: '',
      sunday: '',
      public_holiday: '',
      early_morning: '',
      late_night: '',
    },
    referee1_name: "",
    referee1_relation: "",
    referee1_email: "",
    referee1_confirmed: false,
    referee2_name: "",
    referee2_relation: "",
    referee2_email: "",
    referee2_confirmed: false,
    short_bio: '',
    resume: null,
  });
  const [existingGovernmentId, setExistingGovernmentId] = useState<string>('');
  const [existingGstFile, setExistingGstFile] = useState<string>('');
  const [existingTfnDeclaration, setExistingTfnDeclaration] = useState<string>('');
  const [existingResume, setExistingResume] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);

  const getFileUrl = (path: string) =>
    path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

  useEffect(() => {
    getOnboardingDetail(roleKey)
      .then(res => {
        const d = res as any;
        setData(prev => ({
          ...prev,
          username: d.username || '',
          first_name: d.first_name || '',
          last_name: d.last_name || '',
          phone_number: d.phone_number || '',
          ahpra_number: d.ahpra_number || '',
          skills: d.skills || [],
          software_experience: d.software_experience || [],
          payment_preference: d.payment_preference || 'TFN',
          abn: d.abn || '',
          gst_registered: d.gst_registered || false,
          super_fund_name: d.super_fund_name || '',
          super_usi: d.super_usi || '',
          super_member_number: d.super_member_number || '',
          rate_preference: d.rate_preference || prev.rate_preference,
          referee1_name: d.referee1_name || "",
          referee1_relation: d.referee1_relation || "",
          referee1_email: d.referee1_email || "",
          referee1_confirmed: d.referee1_confirmed || false,
          referee2_name: d.referee2_name || "",
          referee2_relation: d.referee2_relation || "",
          referee2_email: d.referee2_email || "",
          referee2_confirmed: d.referee2_confirmed || false,
          short_bio: d.short_bio || '',
        }));
        setExistingGovernmentId(d.government_id || '');
        setExistingGstFile(d.gst_file || '');
        setExistingTfnDeclaration(d.tfn_declaration || '');
        setExistingResume(d.resume || '');
      })
      .catch(err => {
        if (err.response?.status !== 404) setError(err.response?.data?.detail || err.message);
      })
      .finally(() => setLoading(false));
  }, [roleKey]);

  // const autoSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // useEffect(() => {
  //   if (loading) return;
  //   if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
  //   autoSaveTimeout.current = setTimeout(() => {
  //     handleSubmit(undefined, "autosave");
  //   }, 2000);

  //   return () => {
  //     if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
  //   };
  //   // eslint-disable-next-line
  // }, [data]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleFileChange = (field: keyof Pick<FormData, 'government_id'|'gst_file'|'tfn_declaration'|'resume'>) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setData(prev => ({ ...prev, [field]: e.target.files?.[0] || null }));

  const handleMultiCheckbox = (field: 'skills'|'software_experience', val: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setData(prev => ({
      ...prev,
      [field]: e.target.checked ? [...prev[field], val] : prev[field].filter(x => x !== val)
    }));

  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setData(prev => ({ ...prev, rate_preference: { ...prev.rate_preference, [name]: value } }));
  };

  const handleTabChange = (_: any, newIndex: number) => setTabIndex(newIndex);

  const handleSubmit = async (
    e?: React.FormEvent,
    eventType: "autosave" | "manual" = "manual",
    submitForVerification = false
  ) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const form = new FormData();

      // Build the data payload. If submitting for verification, include the flag.
      const payload = {
        ...data,
        ...(submitForVerification ? { submitted_for_verification: true } : {}),
      };

      Object.entries(payload).forEach(([k, v]) => {
        if (v == null) return;
        if (v instanceof File) form.append(k, v);
        else form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      });

      const res = await updateOnboardingForm(roleKey, form);
      const d = res as any;
      setExistingGovernmentId(d.government_id || existingGovernmentId);
      setExistingGstFile(d.gst_file || existingGstFile);
      setExistingTfnDeclaration(d.tfn_declaration || existingTfnDeclaration);
      setExistingResume(d.resume || existingResume);

      // Only show snackbar and navigate if this is NOT an autosave:
      if (eventType !== "autosave") {
        setSnackbarOpen(true);
      }
    } catch (err: any) {
      const resp = err.response?.data;
      if (resp && typeof resp === 'object') {
        setError(
          Object.entries(resp)
            .map(([f, msgs]) => `${f}:${(msgs as string[]).join(',')}`)
            .join('\n')
        );
      } else setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  if (loading) return <Typography>Loading…</Typography>;

  const panels = [
    <Box key="basic" sx={{p:2}}>
      <Typography variant="h6">Basic Information</Typography>
      <TextField fullWidth margin="normal" label="First Name" name="first_name" value={data.first_name} onChange={handleChange} required />
      <TextField fullWidth margin="normal" label="Last Name" name="last_name" value={data.last_name} onChange={handleChange} required />
      <TextField fullWidth margin="normal" label="Username" name="username" value={data.username} onChange={handleChange} required />
      <TextField fullWidth margin="normal" label="Phone Number" name="phone_number" value={data.phone_number} onChange={handleChange} required />
      <Typography sx={{mt:2}}>Government ID</Typography>
      <Button variant="outlined" component="label">Upload Government ID<input hidden type="file" accept="image/*,.pdf" onChange={handleFileChange('government_id')} /></Button>
      {existingGovernmentId ? (
        <Link
          href={getFileUrl(existingGovernmentId)}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ ml: 2, fontSize: '0.875rem' }}
        >
          View
        </Link>
      ) : (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ ml: 2, fontSize: '0.875rem' }}
        >
          No file uploaded
        </Typography>
      )}
      <TextField
        fullWidth
        margin="normal"
        label="AHPRA Number"
        name="ahpra_number"
        value={data.ahpra_number}
        onChange={handleChange}
        required
        helperText={AHPRA_CONSENT_TEXT}
        InputProps={{
          startAdornment: <InputAdornment position="start">PHA</InputAdornment>,
        }}
      />
    </Box>,
    <Box key="skills" sx={{ p: 2 }}>
      <Typography variant="h6">Skills</Typography>
      <FormGroup sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
        {SKILL_CHOICES.map(s => (
          <FormControlLabel
            key={s.value}
            control={
              <Checkbox
                checked={data.skills.includes(s.value)}
                onChange={handleMultiCheckbox('skills', s.value)}
              />
            }
            label={s.label}
          />
        ))}
      </FormGroup>

      <Typography variant="h6" sx={{ mt: 2 }}>
        Software Experience
      </Typography>
      <FormGroup sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
        {SOFTWARE_CHOICES.map(s => (
          <FormControlLabel
            key={s.value}
            control={
              <Checkbox
                checked={data.software_experience.includes(s.value)}
                onChange={handleMultiCheckbox('software_experience', s.value)}
              />
            }
            label={s.label}
          />
        ))}
      </FormGroup>
    </Box>,
    <Box key="payment" sx={{p:2}}>
      <Typography variant="h6">Payment Method</Typography>
      <FormControl component="fieldset"><RadioGroup row name="payment_preference" value={data.payment_preference} onChange={handleChange}><FormControlLabel value="TFN" control={<Radio />} label="TFN (Payslip)" /><FormControlLabel value="ABN" control={<Radio />} label="ABN (Contractor)" /></RadioGroup></FormControl>
      {data.payment_preference==='ABN'?(
        <Box sx={{mt:2}}>
          <TextField fullWidth margin="normal" label="ABN" name="abn" value={data.abn} onChange={handleChange} />
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    name="gst_registered"
                    checked={data.gst_registered}
                    onChange={handleChange}
                  />
                }
                label="GST Registered"
              />
            </Box>

            {data.gst_registered && (
              <Box sx={{ mt: 2 }}>
                <Button variant="outlined" component="label">
                  Upload GST Certificate
                  <input
                    hidden
                    type="file"
                    onChange={handleFileChange('gst_file')}
                  />
                </Button>

                {existingGstFile ? (
                  <Link
                    href={getFileUrl(existingGstFile)}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ ml: 2, fontSize: '0.875rem' }}
                  >
                    View
                  </Link>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ ml: 2, fontSize: '0.875rem' }}
                  >
                    No file uploaded
                  </Typography>
                )}
              </Box>
            )}
        </Box>
      ):(
        <Box sx={{mt:2}}>
          <Button variant="outlined" component="label">Upload TFN Declaration<input hidden type="file" onChange={handleFileChange('tfn_declaration')} /></Button>
            {existingTfnDeclaration ? (
              <Link
                href={getFileUrl(existingTfnDeclaration)}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ ml: 2, fontSize: '0.875rem' }}
              >
                View
              </Link>
            ) : (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ ml: 2, fontSize: '0.875rem' }}
              >
                No file uploaded
              </Typography>
            )}
          <TextField fullWidth margin="normal" label="Super Fund Name" name="super_fund_name" value={data.super_fund_name} onChange={handleChange} />
          <TextField fullWidth margin="normal" label="USI" name="super_usi" value={data.super_usi} onChange={handleChange} />
          <TextField fullWidth margin="normal" label="Member Number" name="super_member_number" value={data.super_member_number} onChange={handleChange} />
        </Box>
      )}
    </Box>,
    <Box key="rate" sx={{p:2}}>
      <Typography variant="h6">Rate Preferences</Typography>
      {Object.entries(data.rate_preference).map(([k,v])=><TextField key={k} type="number" fullWidth margin="normal" name={k} value={v} onChange={handleRateChange} label={k.split('_').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ')} />)}
    </Box>,
    <Box key="refs" sx={{ p: 2 }}>
      <Typography variant="h6">Referees</Typography>
      <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary', mb: 1 }}>
        Please provide two references (not family). These may be contacted for verification.
      </Typography>
      {[1, 2].map(idx => (
        <Box key={idx} sx={{ mb: 2, pl: 1, borderLeft: '4px solid #eee' }}>
          <Typography fontWeight={600} sx={{ mb: 1 }}>
            Referee {idx}
            {data[`referee${idx}_confirmed` as 'referee1_confirmed' | 'referee2_confirmed'] && (
              <span style={{ color: 'green', fontSize: 22, verticalAlign: 'middle', marginLeft: 8 }}>✔️</span>
            )}
          </Typography>

          <TextField
            fullWidth
            margin="normal"
            label="Name"
            name={`referee${idx}_name`}
            value={data[`referee${idx}_name` as keyof FormData] || ""}
            onChange={handleChange}
          />
          <TextField
            select
            fullWidth
            margin="normal"
            label="Relation"
            name={`referee${idx}_relation`}
            value={data[`referee${idx}_relation` as keyof FormData] || ""}
            onChange={handleChange}
            // SelectProps={{ native: true }} <--- REMOVE THIS LINE
          >
            {/* The TextField's "label" prop now acts as the placeholder */}
            <MenuItem value="" disabled>
              Please select a relation
            </MenuItem>

            {REFEREE_REL_CHOICES.map(opt => (
              // Use MenuItem instead of option
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            margin="normal"
            label="Email"
            name={`referee${idx}_email`}
            value={data[`referee${idx}_email` as keyof FormData] || ""}
            onChange={handleChange}
            type="email"
          />
        </Box>
      ))}
    </Box>,
    <Box key="profile" sx={{p:2}}>
      <Typography variant="h6">Profile & Resume</Typography>
      <TextField fullWidth margin="normal" label="Short Bio" name="short_bio" value={data.short_bio} onChange={handleChange} multiline rows={4} />
      <Divider sx={{my:2}}>Resume (Required)</Divider>
      <Button variant="outlined" component="label">Upload Resume/CV<input hidden accept="application/pdf" type="file" onChange={handleFileChange('resume')} /></Button>
      {existingResume ? (
        <Link
          href={getFileUrl(existingResume)}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ ml: 2, fontSize: '0.875rem' }}
        >
          View
        </Link>
      ) : (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ ml: 2, fontSize: '0.875rem' }}
        >
          No file uploaded
        </Typography>
      )}
    </Box>
  ];

    const preventFormSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tabIndex < panels.length - 1) {
      e.preventDefault();
    }
  };
  
    // Wrap your existing handleSubmit so we can debug / delegate:
    // const debugHandleSubmit = async (e: React.FormEvent) => {
    //   console.log('Form submit triggered from:', document.activeElement);
    //   e.preventDefault();
    //   await handleSubmit(e);  // calls your real submit logic
    // };
  
  return (
    <Container maxWidth="lg">
      {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
      <Snackbar open={snackbarOpen} autoHideDuration={3000} onClose={()=>{setSnackbarOpen(false);navigate('/dashboard/pharmacist/overview');}}>
        <Alert severity="success" sx={{width:'100%'}}>Profile saved successfully!</Alert>
      </Snackbar>
      <Paper sx={{ p: 3, mt: 4 }} elevation={3}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            borderBottom: 1,
            borderColor: 'divider',
            mb: 3,
          }}
        >
          <Tabs
            value={tabIndex}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            textColor="secondary"
            indicatorColor="secondary"
          >
            {labels.map((l, i) => (
              <Tab key={i} label={l} />
            ))}
          </Tabs>
        </Box>

        {/*
          If we're on the final panel, wrap in a form:
          otherwise just render the panel + Next/Back buttons.
        */}
        {tabIndex === panels.length - 1 ? (
          // Final tab: show Save and Submit for Verification
          <Box onKeyDown={preventFormSubmit}>
            {panels[tabIndex]}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
              <Button
                type="button"
                disabled={tabIndex === 0}
                onClick={() => setTabIndex(i => i - 1)}
              >
                Back
              </Button>
              <Box>
                <Button
                  type="button"
                  variant="outlined"
                  disabled={loading}
                  onClick={() => handleSubmit(undefined, "manual", false)}
                  sx={{ mr: 2 }}
                >
                  {loading ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="contained"
                  color="primary"
                  disabled={loading}
                  onClick={() => handleSubmit(undefined, "manual", true)}
                >
                  {loading ? 'Submitting…' : 'Submit for Verification'}
                </Button>
              </Box>
            </Box>
          </Box>
        ) : (
          // Any non-final tab: just Back and Next (NO Save)
          <Box onKeyDown={preventFormSubmit}>
            {panels[tabIndex]}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
              <Button
                type="button"
                disabled={tabIndex === 0}
                onClick={() => setTabIndex(i => i - 1)}
              >
                Back
              </Button>
              {/* REMOVE THE SAVE BUTTON FROM HERE */}
              <Button
                type="button"
                onClick={() => {
                  console.log('Next button clicked');
                  setTabIndex(i => i + 1);
                }}
              >
                Next
              </Button>
            </Box>
          </Box>
        )}


      </Paper>
    </Container>
  );
}
