import { useEffect } from "react";
import { Container, Paper, Typography, Box } from "@mui/material";
import PublicLogoTopBar from "../components/PublicLogoTopBar";
import { setCanonical, setPageMeta, setSocialMeta } from "../utils/seo";

export default function TermsOfServicePage() {
  useEffect(() => {
    const title = "Terms of Service | ChemistTasker";
    const description =
      "Read the ChemistTasker terms of service for using our pharmacy workforce platform.";
    const origin = window.location.origin;
    const url = `${origin}/terms-of-service`;
    const image = `${origin}/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png`;
    setPageMeta(title, description);
    setCanonical(url);
    setSocialMeta({ title, description, url, image, type: "website" });
  }, []);

  return (
    <>
      <PublicLogoTopBar />
      <Container maxWidth="md" sx={{ mt: 8, mb: 8 }}>
        <Paper elevation={3} sx={{ p: { xs: 2, sm: 5 }, borderRadius: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom align="center">
          Terms of Service
        </Typography>
        <Typography variant="subtitle2" color="text.secondary" align="center" gutterBottom>
          Effective Date: 15 June 2025
        </Typography>
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>1. Acceptance of Terms</Typography>
          <Typography paragraph>
            By registering an account or using ChemistTasker (“the Service”), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service, our Privacy Policy, and all applicable Australian laws and regulations. If you do not agree to these terms, please do not register or use this platform.
          </Typography>
        </Box>
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>2. Service Description</Typography>
          <Typography paragraph>
            ChemistTasker is an Australian-based digital platform connecting healthcare professionals and pharmacies for workforce management, shift scheduling, and secure clinical collaboration. The Service is intended solely for qualified professionals and organisations operating in accordance with all applicable regulations.
          </Typography>
        </Box>
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>3. Eligibility & Account Responsibility</Typography>
          <Typography paragraph>
            You must be a legally eligible healthcare professional or authorised staff to create an account and use this Service. You are solely responsible for maintaining the confidentiality of your login credentials and for all activities conducted through your account. Please notify ChemistTasker immediately of any unauthorised access or security concerns.
          </Typography>
        </Box>
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>4. Professional Standards</Typography>
          <Typography paragraph>
            All users are expected to adhere to Australian professional standards, including (but not limited to) those set by AHPRA, the Pharmacy Board of Australia, and relevant State and Federal laws. Any use of this platform to misrepresent qualifications, falsify documentation, or breach professional ethics is strictly prohibited.
          </Typography>
        </Box>
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>5. Data Privacy and Protection</Typography>
          <Typography paragraph>
            Your personal information is strictly protected and handled for the sole purpose of confirming your identity as a valid healthcare professional, facilitating workforce management, and enabling secure platform features. We will never misuse, sell, or provide your data to any third party. All data is managed anonymously wherever possible and in accordance with the Australian Privacy Principles and all relevant legislation. We are committed to the highest standards of privacy, and your data will never be used for unauthorised purposes.
          </Typography>
        </Box>
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>6. User Conduct & Acceptable Use</Typography>
          <Typography paragraph>
            You agree to use ChemistTasker only for lawful, professional purposes. You must not:
          </Typography>
          <ul style={{ marginLeft: "1.5rem" }}>
            <li>Submit false or misleading information</li>
            <li>Attempt to access, tamper with, or disrupt any part of the platform or its data</li>
            <li>Impersonate other individuals or entities</li>
            <li>Violate any law, regulation, or code of conduct applicable to healthcare professionals</li>
          </ul>
        </Box>
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>7. Intellectual Property</Typography>
          <Typography paragraph>
            All content, trademarks, and intellectual property on ChemistTasker are owned or licensed by CHEMISTTASKER PTY LTD. You may not copy, modify, distribute, or use any part of the Service without express written permission.
          </Typography>
        </Box>
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>8. Limitation of Liability</Typography>
          <Typography paragraph>
            ChemistTasker is provided on an “as is” and “as available” basis. To the maximum extent permitted by law, CHEMISTTASKER PTY LTD is not liable for any direct, indirect, incidental, or consequential damages arising from your use of the platform, including but not limited to loss of data, lost profits, or professional liability.
          </Typography>
        </Box>
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>9. Changes to Terms</Typography>
          <Typography paragraph>
            ChemistTasker may modify these Terms of Service at any time. Updates will be posted on this page, and continued use of the Service constitutes acceptance of any changes.
          </Typography>
        </Box>
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>10. Contact Information</Typography>
          <Typography paragraph>
            For questions, concerns, or support regarding these Terms or your data privacy, please contact us at: <a href="mailto:info@chemisttasker.com">info@chemisttasker.com</a>
          </Typography>
        </Box>
        <Box sx={{ mt: 6, textAlign: "center" }}>
          <Typography variant="subtitle2" color="text.secondary">
            &copy; {new Date().getFullYear()} CHEMISTTASKER PTY LTD. All rights reserved.
          </Typography>
        </Box>
        </Paper>
      </Container>
    </>
  );
}
