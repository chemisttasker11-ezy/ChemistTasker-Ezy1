// src/pages/RefereeQuestionnairePage.tsx
import { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  Box,
  CircularProgress,
  Typography,
  Alert,
  TextField,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  FormGroup,
  Paper,
  Container,
} from "@mui/material";
import axios from "axios";
import { API_BASE_URL, API_ENDPOINTS } from "../../constants/api";
import AuthLayout from "../../layouts/AuthLayout";

// Define the structure for our form data
interface RefereeFormData {
  candidate_name: string;
  position_applied_for: string;
  referee_name: string;
  referee_position: string;
  relationship_to_candidate: string;
  association_period: string;
  contact_details: string;
  role_and_responsibilities: string;
  reliability_rating: string;
  professionalism_notes: string;
  skills_rating: string;
  skills_strengths_weaknesses: string;
  teamwork_communication_notes: string;
  feedback_conflict_notes: string;
  conduct_concerns: boolean;
  conduct_explanation: string;
  compliance_adherence: string;
  compliance_incidents: string;
  would_rehire: string;
  rehire_explanation: string;
  additional_comments: string;
}

export default function RefereeQuestionnairePage() {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();

  const [status, setStatus] = useState<"form" | "loading" | "success" | "error">("form");
  const [message, setMessage] = useState<string>("");
  const [formData, setFormData] = useState<RefereeFormData>({
    candidate_name: "Candidate", // Default value, will be updated
    position_applied_for: "ChemistTasker Role", // Default; will be overridden by URL param
    referee_name: "",
    referee_position: "",
    relationship_to_candidate: "",
    association_period: "",
    contact_details: "",
    role_and_responsibilities: "",
    reliability_rating: "",
    professionalism_notes: "",
    skills_rating: "",
    skills_strengths_weaknesses: "",
    teamwork_communication_notes: "",
    feedback_conflict_notes: "",
    conduct_concerns: false,
    conduct_explanation: "",
    compliance_adherence: "",
    compliance_incidents: "",
    would_rehire: "",
    rehire_explanation: "",
    additional_comments: "",
  });

  // Extract candidate name AND position_applied_for from URL query params if available
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const candidateName = queryParams.get("candidate_name");
    const positionAppliedFor = queryParams.get("position_applied_for");
    if (candidateName || positionAppliedFor) {
      setFormData((prev) => ({
        ...prev,
        ...(candidateName ? { candidate_name: candidateName } : {}),
        ...(positionAppliedFor ? { position_applied_for: positionAppliedFor } : {}),
      }));
    }
  }, [location.search]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === "checkbox";
    if (isCheckbox) {
      const { checked } = e.target as HTMLInputElement;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");

    if (!token) {
      setStatus("error");
      setMessage("Missing reference token. This link is invalid.");
      return;
    }

    // Construct the payload with only the fields expected by the backend serializer
    const payload = {
      referee_name: formData.referee_name,
      referee_position: formData.referee_position,
      relationship_to_candidate: formData.relationship_to_candidate,
      association_period: formData.association_period,
      contact_details: formData.contact_details,
      role_and_responsibilities: formData.role_and_responsibilities,
      reliability_rating: formData.reliability_rating,
      professionalism_notes: formData.professionalism_notes,
      skills_rating: formData.skills_rating,
      skills_strengths_weaknesses: formData.skills_strengths_weaknesses,
      teamwork_communication_notes: formData.teamwork_communication_notes,
      feedback_conflict_notes: formData.feedback_conflict_notes,
      conduct_concerns: formData.conduct_concerns,
      conduct_explanation: formData.conduct_explanation,
      compliance_adherence: formData.compliance_adherence,
      compliance_incidents: formData.compliance_incidents,
      would_rehire: formData.would_rehire,
      rehire_explanation: formData.rehire_explanation,
      additional_comments: formData.additional_comments,
    };

    const url = `${API_BASE_URL}${API_ENDPOINTS.submitRefereeResponse(token)}`;

    axios
      .post(url, payload)
      .then(() => {
        setStatus("success");
        setMessage("Thank you for your feedback. Your reference has been successfully submitted.");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(
          err.response?.data?.detail ||
            "An error occurred while submitting your response. Please try again or contact support."
        );
      });
  };

  const renderContent = () => {
    switch (status) {
      case "loading":
        return (
          <Box sx={{ textAlign: "center", my: 4 }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>Submitting your reference...</Typography>
          </Box>
        );
      case "success":
        return (
          <Alert severity="success" sx={{ textAlign: "left" }}>
            <Typography variant="h5" gutterBottom>
              ✅ Reference Submitted!
            </Typography>
            <Typography>{message}</Typography>
          </Alert>
        );
      case "error":
        return (
          <Alert severity="error" sx={{ textAlign: "left" }}>
            <Typography variant="h6" gutterBottom>
              Submission Failed
            </Typography>
            <Typography>{message}</Typography>
          </Alert>
        );
      case "form":
      default:
        return (
          <Box sx={{ maxWidth: 980, mx: "auto", width: "100%" }}>
            <Paper
              elevation={3}
              sx={{
                maxWidth: 1000,
                mx: "auto",
                p: { xs: 2, md: 5 },
              }}
            >
              <Typography variant="h4" component="h1" gutterBottom align="center">
                ChemistTasker Reference Questionnaire
              </Typography>
              <Typography variant="body1" align="center" sx={{ mb: 4 }}>
                Thank you for assisting with this reference. All responses are confidential and will be used solely for
                recruitment purposes.
              </Typography>
              <Box
                component="form"
                onSubmit={handleSubmit}
                noValidate
                sx={{ display: "flex", flexDirection: "column", gap: 3 }}
              >
                {/* Candidate & Referee Info Section */}
                <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 3 }}>
                  <TextField label="Candidate Name" name="candidate_name" value={formData.candidate_name} fullWidth disabled />
                  <TextField
                    label="Position Applied For"
                    name="position_applied_for"
                    value={formData.position_applied_for}
                    fullWidth
                    disabled
                  />
                </Box>
                <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 3 }}>
                  <TextField
                    label="Your Name"
                    name="referee_name"
                    value={formData.referee_name}
                    onChange={handleChange}
                    fullWidth
                    required
                  />
                  <TextField
                    label="Your Position"
                    name="referee_position"
                    value={formData.referee_position}
                    onChange={handleChange}
                    fullWidth
                    required
                  />
                  <TextField
                    label="Relationship to Candidate"
                    name="relationship_to_candidate"
                    value={formData.relationship_to_candidate}
                    onChange={handleChange}
                    fullWidth
                    required
                  />
                </Box>
                <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 3 }}>
                  <TextField
                    label="Period of Association (From – To)"
                    name="association_period"
                    value={formData.association_period}
                    onChange={handleChange}
                    fullWidth
                    required
                  />
                  <TextField
                    label="Phone (optional)"
                    name="contact_details"
                    value={formData.contact_details}
                    onChange={handleChange}
                    fullWidth
                  />
                </Box>

                {/* The rest of the form is unchanged */}
                <TextField
                  label="1. What was the candidate’s role and main responsibilities?"
                  name="role_and_responsibilities"
                  value={formData.role_and_responsibilities}
                  onChange={handleChange}
                  multiline
                  rows={4}
                  fullWidth
                  required
                />
                <FormControl component="fieldset" fullWidth>
                  <FormLabel component="legend">2. How would you describe their reliability and punctuality?</FormLabel>
                  <RadioGroup row name="reliability_rating" value={formData.reliability_rating} onChange={handleChange}>
                    <FormControlLabel value="Excellent" control={<Radio />} label="Excellent" />
                    <FormControlLabel value="Good" control={<Radio />} label="Good" />
                    <FormControlLabel value="Satisfactory" control={<Radio />} label="Satisfactory" />
                    <FormControlLabel value="Needs Improvement" control={<Radio />} label="Needs Improvement" />
                  </RadioGroup>
                </FormControl>
                <TextField
                  label="How did they demonstrate professionalism in their role?"
                  name="professionalism_notes"
                  value={formData.professionalism_notes}
                  onChange={handleChange}
                  multiline
                  rows={3}
                  fullWidth
                />
                <FormControl component="fieldset" fullWidth>
                  <FormLabel component="legend">3. How would you rate their technical knowledge and skills for the position?</FormLabel>
                  <RadioGroup row name="skills_rating" value={formData.skills_rating} onChange={handleChange}>
                    <FormControlLabel value="Excellent" control={<Radio />} label="Excellent" />
                    <FormControlLabel value="Good" control={<Radio />} label="Good" />
                    <FormControlLabel value="Satisfactory" control={<Radio />} label="Satisfactory" />
                    <FormControlLabel value="Needs Improvement" control={<Radio />} label="Needs Improvement" />
                  </RadioGroup>
                </FormControl>
                <TextField
                  label="Were there any areas of particular strength or any areas that needed development?"
                  name="skills_strengths_weaknesses"
                  value={formData.skills_strengths_weaknesses}
                  onChange={handleChange}
                  multiline
                  rows={3}
                  fullWidth
                />
                <TextField
                  label="4. How well did the candidate communicate and work within a team?"
                  name="teamwork_communication_notes"
                  value={formData.teamwork_communication_notes}
                  onChange={handleChange}
                  multiline
                  rows={3}
                  fullWidth
                />
                <TextField
                  label="How did they handle feedback or conflict in the workplace?"
                  name="feedback_conflict_notes"
                  value={formData.feedback_conflict_notes}
                  onChange={handleChange}
                  multiline
                  rows={3}
                  fullWidth
                />
                <FormControl component="fieldset" fullWidth>
                  <FormLabel component="legend">5. Were there ever any concerns regarding their honesty, conduct, or behaviour?</FormLabel>
                  <FormGroup>
                    <FormControlLabel
                      control={<Checkbox checked={formData.conduct_concerns} onChange={handleChange} name="conduct_concerns" />}
                      label="Yes"
                    />
                  </FormGroup>
                  {formData.conduct_concerns && (
                    <TextField
                      label="Please explain"
                      name="conduct_explanation"
                      value={formData.conduct_explanation}
                      onChange={handleChange}
                      multiline
                      rows={3}
                      fullWidth
                      sx={{ mt: 2 }}
                    />
                  )}
                </FormControl>
                <FormControl component="fieldset" fullWidth>
                  <FormLabel component="legend">
                    6. Did the candidate consistently adhere to workplace safety and regulatory requirements?
                  </FormLabel>
                  <RadioGroup row name="compliance_adherence" value={formData.compliance_adherence} onChange={handleChange}>
                    <FormControlLabel value="Yes" control={<Radio />} label="Yes" />
                    <FormControlLabel value="No" control={<Radio />} label="No" />
                    <FormControlLabel value="Unsure" control={<Radio />} label="Unsure" />
                  </RadioGroup>
                </FormControl>
                <TextField
                  label="Any incidents or concerns to note?"
                  name="compliance_incidents"
                  value={formData.compliance_incidents}
                  onChange={handleChange}
                  multiline
                  rows={3}
                  fullWidth
                />
                <FormControl component="fieldset" fullWidth required>
                  <FormLabel component="legend">7. Would you re-employ or recommend this candidate for a similar position?</FormLabel>
                  <RadioGroup row name="would_rehire" value={formData.would_rehire} onChange={handleChange}>
                    <FormControlLabel value="Yes" control={<Radio />} label="Yes" />
                    <FormControlLabel value="No" control={<Radio />} label="No" />
                    <FormControlLabel value="With Reservations" control={<Radio />} label="With Reservations" />
                  </RadioGroup>
                  {(formData.would_rehire === "No" || formData.would_rehire === "With Reservations") && (
                    <TextField
                      label="Please explain"
                      name="rehire_explanation"
                      value={formData.rehire_explanation}
                      onChange={handleChange}
                      multiline
                      rows={3}
                      fullWidth
                      sx={{ mt: 2 }}
                      required
                    />
                  )}
                </FormControl>
                <TextField
                  label="Is there anything else you think we should know about this candidate?"
                  name="additional_comments"
                  value={formData.additional_comments}
                  onChange={handleChange}
                  multiline
                  rows={4}
                  fullWidth
                />

                <Box sx={{ textAlign: "center", mt: 2 }}>
                  <Button type="submit" variant="contained" color="primary" size="large">
                    Submit Reference
                  </Button>
                </Box>
              </Box>
            </Paper>
          </Box>
        );
    }
  };

  return (
    <AuthLayout title="Reference Questionnaire" maxWidth="lg">
      <Box sx={{ width: "100%", overflowY: "auto", p: 2 }}>
        <Container maxWidth="lg">{renderContent()}</Container>
      </Box>
    </AuthLayout>
  );
}
