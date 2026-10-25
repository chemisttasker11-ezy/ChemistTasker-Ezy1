// RefereeRejectPage.tsx

import { useEffect, useState } from "react";
import { useParams } from "@/public/navigation";
import { Box, CircularProgress, Typography, Alert } from "@mui/material";
import { API_BASE_URL } from "../../constants/api";
import { browserRejectReferee } from '@chemisttasker/shared-core';
import AuthLayout from "../../layouts/AuthLayout";

export default function RefereeRejectPage() {
  const { token } = useParams<{ token: string }>();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing reference information.");
      return;
    }
    browserRejectReferee({ baseUrl: API_BASE_URL }, token)
      .then((data) => {
        setStatus("success");
        setMessage(data?.message || "You have declined to be a referee for this candidate.");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(
          err?.payload?.detail ||
            err?.response?.data?.detail ||
            err?.response?.data ||
            err.message ||
            "Something went wrong."
        );
      });
  }, [token]);

  return (
    <AuthLayout title="Reference Declined" maxWidth="md" noCard showTitle={false}>
      <Box sx={{ textAlign: 'center', width: '100%', maxWidth: 720, mx: 'auto', py: { xs: 4, md: 8 } }}>
        {status === "loading" && (
          <>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>Declining your reference...</Typography>
          </>
        )}
        {status === "success" && (
          <Alert severity="info" sx={{ textAlign: 'left' }}>
            <Typography variant="h5" gutterBottom>
              Reference Declined
            </Typography>
            <Typography>{message}</Typography>
          </Alert>
        )}
        {status === "error" && (
          <Alert severity="error" sx={{ textAlign: 'left' }}>
            <Typography variant="h6" gutterBottom>
              Could not decline
            </Typography>
            <Typography>{message}</Typography>
          </Alert>
        )}
      </Box>
    </AuthLayout>
  );
}
