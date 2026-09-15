import React, { useEffect, useState } from "react";
import { TextField, Button, Alert, CircularProgress } from "@mui/material";
import axios from "axios";
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import AuthLayout from "../layouts/AuthLayout"; // Import the new layout
import { setRobotsMeta } from "../utils/seo";

export default function PasswordResetRequestPage() {
  useEffect(() => {
    setRobotsMeta("noindex,follow");
    return () => setRobotsMeta();
  }, []);

  // --- All logic is unchanged ---
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await axios.post(`${API_BASE_URL}${API_ENDPOINTS.passwordReset}`, { email });
      setMessage("If this email is registered, a reset link has been sent.");
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Reset Your Password">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      <form onSubmit={handleSubmit}>
        <TextField fullWidth margin="normal" label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <Button fullWidth type="submit" variant="contained" disabled={loading} sx={{ mt: 2, py: 1.5, backgroundColor: '#00a99d', '&:hover': {backgroundColor: '#00877d'} }}>
          {loading ? <CircularProgress size={24} color="inherit"/> : "Send Reset Link"}
        </Button>
      </form>
    </AuthLayout>
  );
}
