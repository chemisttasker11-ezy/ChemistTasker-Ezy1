// src/pages/onboarding/OtherStaffOnboarding.tsx
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
  MenuItem,
  Button,
  Alert,
  Snackbar,
  Link,
  Divider,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../constants/api';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';

interface FormData {
  first_name: string;
  last_name: string;
  username: string;
  phone_number: string;
  government_id: File | null;
  role_type: string;
  classification_level?: string;
  student_year?: string;
  intern_half?: string;
  skills: string[];
  years_experience: string;
  ahpra_proof: File | null;
  hours_proof: File | null;
  certificate: File | null;
  university_id: File | null;
  cpr_certificate: File | null;
  s8_certificate: File | null;
  payment_preference: 'ABN' | 'TFN';
  abn: string;
  gst_registered: boolean;
  gst_file: File | null;
  tfn_declaration: File | null;
  super_fund_name: string;
  super_usi: string;
  super_member_number: string;
  referee1_name: string;
  referee1_relation: string;
  referee1_email: string;
  referee1_confirmed: boolean;
  referee2_name: string;
  referee2_relation: string;
  referee2_email: string;
  referee2_confirmed: boolean;
  short_bio: string;
  resume: File | null;
}
const ROLE_CHOICES = [
  { value: 'INTERN', label: 'Intern Pharmacist' },
  { value: 'TECHNICIAN', label: 'Dispensary Technician' },
  { value: 'ASSISTANT', label: 'Assistant' },
  { value: 'STUDENT', label: 'Pharmacy Student' },
];
const YEARS = ['<1 year', '1–3 years', '3-5 years', '5-10 years', '+10 years'];
const SKILL_CHOICES = [
  { value: 'FIRST_AID', label: 'First Aid' },
  { value: 'COMPOUNDING', label: 'Compounding' },
  { value: 'S8', label: 'S8 handling' },
];
const ASSISTANT_LEVELS = [
  { value: 'LEVEL_1', label: 'Assistant - Level 1' },
  { value: 'LEVEL_2', label: 'Assistant - Level 2' },
  { value: 'LEVEL_3', label: 'Assistant - Level 3' },
  { value: 'LEVEL_4', label: 'Assistant - Level 4' },
];

const STUDENT_YEARS = [
  { value: 'YEAR_1', label: '1st Year' },
  { value: 'YEAR_2', label: '2nd Year' },
  { value: 'YEAR_3', label: '3rd Year' },
  { value: 'YEAR_4', label: '4th Year' },
];

const INTERN_HALVES = [
  { value: 'FIRST_HALF', label: 'First Half' },
  { value: 'SECOND_HALF', label: 'Second Half' },
];

const REFEREE_REL_CHOICES = [
  { value: "manager", label: "Manager" },
  { value: "supervisor", label: "Supervisor" },
  { value: "colleague", label: "Colleague" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
];


const labels = ['Basic Info', 'Reg Docs', 'Skills', 'Payment', 'Referees', 'Profile'];

export default function OtherStaffOnboarding() {
  const navigate = useNavigate();
  const roleKey = 'otherstaff';

  const [data, setData] = useState<FormData>({
    first_name: '',
    last_name: '',
    username: '',
    phone_number: '',
    government_id: null,
    role_type: '',
    classification_level: '',
    student_year: '',
    intern_half: '',
    skills: [],
    years_experience: '',
    ahpra_proof: null,
    hours_proof: null,
    certificate: null,
    university_id: null,
    cpr_certificate: null,
    s8_certificate: null,
    payment_preference: 'TFN',
    abn: '',
    gst_registered: false,
    gst_file: null,
    tfn_declaration: null,
    super_fund_name: '',
    super_usi: '',
    super_member_number: '',
    referee1_name: '',
    referee1_relation: '',
    referee1_email: '',
    referee1_confirmed: false,
    referee2_name: '',
    referee2_relation: '',
    referee2_email: '',
    referee2_confirmed: false,
    short_bio: '',
    resume: null,
  });

  // separate existing-file state
  const [existingGovernmentId, setExistingGovernmentId] = useState('');
  const [existingAhpraProof, setExistingAhpraProof] = useState('');
  const [existingHoursProof, setExistingHoursProof] = useState('');
  const [existingCertificate, setExistingCertificate] = useState('');
  const [existingUniversityId, setExistingUniversityId] = useState('');
  const [existingCprCertificate, setExistingCprCertificate] = useState('');
  const [existingS8Certificate, setExistingS8Certificate] = useState('');
  const [existingGstFile, setExistingGstFile] = useState('');
  const [existingTfnDeclaration, setExistingTfnDeclaration] = useState('');
  const [existingResume, setExistingResume] = useState('');

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
        setData({
          first_name: d.first_name || '',
          last_name: d.last_name || '',
          username: d.username || '',
          phone_number: d.phone_number || '',
          government_id: null,
          role_type: d.role_type || '',
          classification_level: d.classification_level || '',
          student_year: d.student_year || '',
          intern_half: d.intern_half || '',
          skills: d.skills || [],
          years_experience: d.years_experience || '',
          ahpra_proof: null,
          hours_proof: null,
          certificate: null,
          university_id: null,
          cpr_certificate: null,
          s8_certificate: null,
          payment_preference: d.payment_preference || 'TFN',
          abn: d.abn || '',
          gst_registered: d.gst_registered || false,
          gst_file: null,
          tfn_declaration: null,
          super_fund_name: d.super_fund_name || '',
          super_usi: d.super_usi || '',
          super_member_number: d.super_member_number || '',
          referee1_name: d.referee1_name || '',
          referee1_relation: d.referee1_relation || '',
          referee1_email: d.referee1_email || '',
          referee1_confirmed: d.referee1_confirmed || false,
          referee2_name: d.referee2_name || '',
          referee2_relation: d.referee2_relation || '',
          referee2_email: d.referee2_email || '',
          referee2_confirmed: d.referee2_confirmed || false,
          short_bio: d.short_bio || '',
          resume: null,
        });
        // set existing URLs
        setExistingGovernmentId(d.government_id || '');
        setExistingAhpraProof(d.ahpra_proof || '');
        setExistingHoursProof(d.hours_proof || '');
        setExistingCertificate(d.certificate || '');
        setExistingUniversityId(d.university_id || '');
        setExistingCprCertificate(d.cpr_certificate || '');
        setExistingS8Certificate(d.s8_certificate || '');
        setExistingGstFile(d.gst_file || '');
        setExistingTfnDeclaration(d.tfn_declaration || '');
        setExistingResume(d.resume || '');
      })
      .catch(err => {
        if (err.response?.status !== 404) {
          setError(err.response?.data?.detail || err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [roleKey]);

const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  const target = e.target;
  const { name, value } = target;
  const isCheckbox = target instanceof HTMLInputElement && target.type === 'checkbox';

  setData(prev => ({
    ...prev,
    [name]: isCheckbox ? target.checked : value,
    ...(name === 'role_type' && {
      classification_level: '',
      student_year: '',
      intern_half: '',
    }),
  }));
};


  const handleFileChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setData(prev => ({ ...prev, [field]: e.target.files?.[0] ?? null }));
  };

  const handleMultiCheckbox = (field: 'skills', val: string) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setData(prev => {
      const arr = prev[field];
      return {
        ...prev,
        [field]: e.target.checked ? [...arr, val] : arr.filter(x => x !== val),
      };
    });
  };

  const handleTabChange = (_: any, newIndex: number) => {
    setTabIndex(newIndex);
  };

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

      // update each existing-file URL
      setExistingGovernmentId(d.government_id || existingGovernmentId);
      setExistingAhpraProof(d.ahpra_proof || existingAhpraProof);
      setExistingHoursProof(d.hours_proof || existingHoursProof);
      setExistingCertificate(d.certificate || existingCertificate);
      setExistingUniversityId(d.university_id || existingUniversityId);
      setExistingCprCertificate(d.cpr_certificate || existingCprCertificate);
      setExistingS8Certificate(d.s8_certificate || existingS8Certificate);
      setExistingGstFile(d.gst_file || existingGstFile);
      setExistingTfnDeclaration(d.tfn_declaration || existingTfnDeclaration);
      setExistingResume(d.resume || existingResume);

      // Only show snackbar if this is NOT an autosave:
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

  const panels: React.ReactNode[] = [
    // Basic Info
    <Box sx={{ p: 2 }} key="basic">
      <Typography variant="h6">Basic Info</Typography>
      <TextField
        fullWidth
        margin="normal"
        label="First Name"
        name="first_name"
        value={data.first_name}
        onChange={handleChange}
        required
      />
      <TextField
        fullWidth
        margin="normal"
        label="Last Name"
        name="last_name"
        value={data.last_name}
        onChange={handleChange}
        required
      />
      <TextField
        fullWidth
        margin="normal"
        label="Username"
        name="username"
        value={data.username}
        onChange={handleChange}
        required
      />
      <TextField
        fullWidth
        margin="normal"
        label="Phone Number"
        name="phone_number"
        value={data.phone_number}
        onChange={handleChange}
        required
      />

      <Typography sx={{ mt: 2 }}>Government ID</Typography>
      <Button variant="outlined" component="label">
        Upload ID
        <input hidden type="file" onChange={handleFileChange('government_id')} />
      </Button>
      {existingGovernmentId && (
        <Link
          href={getFileUrl(existingGovernmentId)}
          target="_blank"
          sx={{ ml: 2, fontSize: '0.875rem' }}
        >
          View
        </Link>
      )}

      <TextField
        select
        fullWidth
        margin="normal"
        label="Role"
        name="role_type"
        value={data.role_type}
        onChange={handleChange}
        required
      >
        {ROLE_CHOICES.map(o => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
      {data.role_type === 'ASSISTANT' && (
        <TextField
          select
          fullWidth
          margin="normal"
          label="Assistant Classification Level"
          name="classification_level"
          value={data.classification_level || ''}
          onChange={handleChange}
          required
        >
          {ASSISTANT_LEVELS.map(l => (
            <MenuItem key={l.value} value={l.value}>
              {l.label}
            </MenuItem>
          ))}
        </TextField>
      )}

      {data.role_type === 'STUDENT' && (
        <TextField
          select
          fullWidth
          margin="normal"
          label="Student Year"
          name="student_year"
          value={data.student_year || ''}
          onChange={handleChange}
          required
        >
          {STUDENT_YEARS.map(y => (
            <MenuItem key={y.value} value={y.value}>
              {y.label}
            </MenuItem>
          ))}
        </TextField>
      )}

      {data.role_type === 'INTERN' && (
        <TextField
          select
          fullWidth
          margin="normal"
          label="Intern Half"
          name="intern_half"
          value={data.intern_half || ''}
          onChange={handleChange}
          required
        >
          {INTERN_HALVES.map(h => (
            <MenuItem key={h.value} value={h.value}>
              {h.label}
            </MenuItem>
          ))}
        </TextField>
      )}


    </Box>,

    // Reg Docs
    <Box sx={{ p: 2 }} key="reg">
      <Typography variant="h6">Reg Docs</Typography>
      {data.role_type === 'INTERN' && (
        <>
          <Typography>AHPRA Proof</Typography>
          <Button variant="outlined" component="label" sx={{ mr: 1 }}>
            Upload AHPRA
            <input hidden type="file" onChange={handleFileChange('ahpra_proof')} />
          </Button>
          {existingAhpraProof && (
            <Link href={getFileUrl(existingAhpraProof)} target="_blank" sx={{ ml: 2, fontSize: '0.875rem' }}>
              View
            </Link>
          )}

          <Typography sx={{ mt: 2 }}>Hours Proof</Typography>
          <Button variant="outlined" component="label">
            Upload Hours
            <input hidden type="file" onChange={handleFileChange('hours_proof')} />
          </Button>
          {existingHoursProof && (
            <Link href={getFileUrl(existingHoursProof)} target="_blank" sx={{ ml: 2, fontSize: '0.875rem' }}>
              View
            </Link>
          )}
        </>
      )}
      {['TECHNICIAN', 'ASSISTANT'].includes(data.role_type) && (
        <>
          <Typography sx={{ mt: 2 }}>Certificate</Typography>
          <Button variant="outlined" component="label">
            Upload Certificate
            <input hidden type="file" onChange={handleFileChange('certificate')} />
          </Button>
          {existingCertificate && (
            <Link href={getFileUrl(existingCertificate)} target="_blank" sx={{ ml: 2, fontSize: '0.875rem' }}>
              View
            </Link>
          )}
        </>
      )}
      {data.role_type === 'STUDENT' && (
        <>
          <Typography sx={{ mt: 2 }}>University ID</Typography>
          <Button variant="outlined" component="label">
            Upload University ID
            <input hidden type="file" onChange={handleFileChange('university_id')} />
          </Button>
          {existingUniversityId && (
            <Link href={getFileUrl(existingUniversityId)} target="_blank" sx={{ ml: 2, fontSize: '0.875rem' }}>
              View
            </Link>
          )}
        </>
      )}
      {data.role_type === 'OTHER' && (
        <>
          <Typography sx={{ mt: 2 }}>CPR Certificate</Typography>
          <Button variant="outlined" component="label" sx={{ mr: 1 }}>
            Upload CPR
            <input hidden type="file" onChange={handleFileChange('cpr_certificate')} />
          </Button>
          {existingCprCertificate && (
            <Link href={getFileUrl(existingCprCertificate)} target="_blank" sx={{ ml: 2, fontSize: '0.875rem' }}>
              View
            </Link>
          )}

          <Typography sx={{ mt: 2 }}>S8 Certificate</Typography>
          <Button variant="outlined" component="label">
            Upload S8
            <input hidden type="file" onChange={handleFileChange('s8_certificate')} />
          </Button>
          {existingS8Certificate && (
            <Link href={getFileUrl(existingS8Certificate)} target="_blank" sx={{ ml: 2, fontSize: '0.875rem' }}>
              View
            </Link>
          )}
        </>
      )}
    </Box>,

    // Skills
    <Box sx={{ p: 2 }} key="skills">
      <Typography variant="h6">Skills</Typography>
      <FormGroup sx={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 1 }}>
        {SKILL_CHOICES.map(s => (
          <FormControlLabel
            key={s.value}
            control={<Checkbox checked={data.skills.includes(s.value)} onChange={handleMultiCheckbox('skills', s.value)} />}
            label={s.label}
          />
        ))}
      </FormGroup>
      <TextField
        select
        fullWidth
        margin="normal"
        label="Years Experience"
        name="years_experience"
        value={data.years_experience}
        onChange={handleChange}
        required
      >
        {YEARS.map(y => (
          <MenuItem key={y} value={y}>
            {y}
          </MenuItem>
        ))}
      </TextField>
    </Box>,

    // Payment
    <Box key="payment" sx={{ p: 2 }}>
      <Typography variant="h6">Payment Method</Typography>
      <FormControl component="fieldset">
        <RadioGroup row name="payment_preference" value={data.payment_preference} onChange={handleChange}>
          <FormControlLabel value="TFN" control={<Radio />} label="TFN (Payslip)" />
          <FormControlLabel value="ABN" control={<Radio />} label="ABN (Contractor)" />
        </RadioGroup>
      </FormControl>

      {data.payment_preference === 'ABN' ? (
        <Box sx={{ mt: 2 }}>
          <TextField fullWidth margin="normal" label="ABN" name="abn" value={data.abn} onChange={handleChange} />
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <FormControlLabel
              control={<Checkbox name="gst_registered" checked={data.gst_registered} onChange={handleChange} />}
              label="GST Registered"
            />
          </Box>

          {data.gst_registered && (
            <Box sx={{ mt: 2 }}>
              <Button variant="outlined" component="label">
                Upload GST Certificate
                <input hidden type="file" onChange={handleFileChange('gst_file')} />
              </Button>
              {existingGstFile ? (
                <Link href={getFileUrl(existingGstFile)} target="_blank" sx={{ ml: 2, fontSize: '0.875rem' }}>
                  View
                </Link>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ ml: 2, fontSize: '0.875rem' }}>
                  No file uploaded
                </Typography>
              )}
            </Box>
          )}
        </Box>
      ) : (
        <Box sx={{ mt: 2 }}>
          <Button variant="outlined" component="label">
            Upload TFN Declaration
            <input hidden type="file" onChange={handleFileChange('tfn_declaration')} />
          </Button>
          {existingTfnDeclaration ? (
            <Link href={getFileUrl(existingTfnDeclaration)} target="_blank" sx={{ ml: 2, fontSize: '0.875rem' }}>
              View
            </Link>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, fontSize: '0.875rem' }}>
              No file uploaded
            </Typography>
          )}

          <TextField
            fullWidth
            margin="normal"
            label="Super Fund Name"
            name="super_fund_name"
            value={data.super_fund_name}
            onChange={handleChange}
          />
          <TextField fullWidth margin="normal" label="USI" name="super_usi" value={data.super_usi} onChange={handleChange} />
          <TextField
            fullWidth
            margin="normal"
            label="Member Number"
            name="super_member_number"
            value={data.super_member_number}
            onChange={handleChange}
          />
        </Box>
      )}
    </Box>,

    // Referees
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



    // Profile
    <Box sx={{ p: 2 }} key="profile">
      <Typography variant="h6">Profile & Resume</Typography>
      <TextField
        fullWidth
        margin="normal"
        label="Short Bio"
        name="short_bio"
        value={data.short_bio}
        onChange={handleChange}
        multiline
        rows={4}
      />
      <Divider sx={{ my: 2 }}>Resume</Divider>
      <Button variant="outlined" component="label">
        Upload Resume
        <input hidden accept="application/pdf" type="file" onChange={handleFileChange('resume')} />
      </Button>
      {existingResume && (
        <Link href={getFileUrl(existingResume)} target="_blank" sx={{ ml: 2, fontSize: '0.875rem' }}>
          View
        </Link>
      )}
    </Box>,
  ];


  const preventFormSubmit = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && tabIndex < panels.length - 1) {
    e.preventDefault();
  }
};

  // Wrap your existing handleSubmit so we can debug / delegate:
  const debugHandleSubmit = async (e: React.FormEvent) => {
    console.log('Form submit triggered from:', document.activeElement);
    e.preventDefault();
    await handleSubmit(e);  // calls your real submit logic
  };


  return (
    <Container maxWidth="lg">
      {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
      <Snackbar open={snackbarOpen} autoHideDuration={3000} onClose={()=>{setSnackbarOpen(false);navigate('/dashboard/otherstaff/overview');}}>
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
          <Box
            component="form"
            onSubmit={debugHandleSubmit}
            onKeyDown={preventFormSubmit}
          >
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
