// // RefereeConfirmPage.tsx
// import { useEffect, useState } from "react";
// import { useParams } from "react-router-dom";
// import { Box, CircularProgress, Typography, Alert } from "@mui/material";
// import axios from "axios";
// import { API_BASE_URL, API_ENDPOINTS } from "../../constants/api";
// import AuthLayout from "../../layouts/AuthLayout"; // Make sure this path is correct

// export default function RefereeConfirmPage() {
//   const { pk, refIndex } = useParams<{ pk: string; refIndex: string }>();

//   const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
//   const [message, setMessage] = useState<string>("");

//   // This logic remains completely unchanged
//   useEffect(() => {
//     if (!pk || !refIndex) {
//       setStatus("error");
//       setMessage("Missing reference information.");
//       return;
//     }
//     const url = `${API_BASE_URL}${API_ENDPOINTS.refereeConfirm(pk, refIndex)}`;
    
//     axios
//       .post(url)
//       .then((res) => {
//         setStatus("success");
//         setMessage(res.data?.detail || "Thank you! You have confirmed your reference for this candidate.");
//       })
//       .catch((err) => {
//         setStatus("error");
//         setMessage(
//           err.response?.data?.detail ||
//             err.response?.data ||
//             err.message ||
//             "Something went wrong."
//         );
//       });
//   }, [pk, refIndex]);

//   return (
//     <AuthLayout title="Reference Confirmation">
//       <Box sx={{ textAlign: 'center', width: '100%' }}>
//         {status === "loading" && (
//           <>
//             <CircularProgress />
//             <Typography sx={{ mt: 2 }}>Confirming your reference...</Typography>
//           </>
//         )}
//         {status === "success" && (
//           <Alert severity="success" sx={{ textAlign: 'left' }}>
//             <Typography variant="h5" gutterBottom>
//               🎉 Reference Confirmed!
//             </Typography>
//             <Typography>{message}</Typography>
//           </Alert>
//         )}
//         {status === "error" && (
//           <Alert severity="error" sx={{ textAlign: 'left' }}>
//             <Typography variant="h6" gutterBottom>
//               Could not confirm
//             </Typography>
//             <Typography>{message}</Typography>
//           </Alert>
//         )}
//       </Box>
//     </AuthLayout>
//   );
// }
