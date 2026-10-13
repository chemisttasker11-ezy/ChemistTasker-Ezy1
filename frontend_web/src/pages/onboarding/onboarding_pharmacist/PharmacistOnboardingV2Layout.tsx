// Pharmacist profile on the shared onboarding shell.
import { BadgeDollarSign, FileText, IdCard, ListChecks, UserRound, Users, Wallet } from "lucide-react";
import OnboardingShell, { type OnboardingStep } from "../OnboardingShell";
import BasicInfoV2 from "./BasicInfoV2";
import SkillsV2 from "./SkillsV2";
import PaymentV2 from "./PaymentV2";
import RefereesV2 from "./RefereesV2";
import ProfileV2 from "./ProfileV2";
import RatesV2 from "./RatesV2";
import IdentityV2 from "./IdentityV2";

// Keys stay as before: links into ?step= keep working.
const STEPS: OnboardingStep[] = [
  { key: "basic", label: "Basic info & AHPRA", icon: UserRound, tone: "violet", purpose: "Your contact details, where you can work and your AHPRA number. Our team checks it on the public register.", render: () => <BasicInfoV2 /> },
  { key: "skills", label: "Skills & software", icon: ListChecks, tone: "cyan", purpose: "Services you provide and software you use. Certificates are optional and earn a Verified mark on that skill.", render: () => <SkillsV2 /> },
  { key: "rate", label: "Rates", icon: BadgeDollarSign, tone: "magenta", purpose: "The hourly rates you would like. Pharmacies see them before they book you.", render: () => <RatesV2 /> },
  { key: "identity", label: "Photo ID", icon: IdCard, tone: "blue", purpose: "Optional. A checked photo ID earns the Photo ID badge pharmacies look for.", render: () => <IdentityV2 /> },
  { key: "payment", label: "Payment", icon: Wallet, tone: "violet", purpose: "How you are paid: ABN or TFN, bank account and super.", render: () => <PaymentV2 /> },
  { key: "referees", label: "References", icon: Users, tone: "blue", purpose: "Optional. Two referees who confirm earn the References badge.", render: () => <RefereesV2 /> },
  { key: "profile", label: "Profile & CV", icon: FileText, tone: "cyan", purpose: "Your photo, a short bio and your CV: what pharmacies read first.", render: () => <ProfileV2 /> },
];

export default function PharmacistOnboardingV2Layout() {
  return (
    <OnboardingShell
      roleKey="pharmacist"
      title="Your profile"
      subtitle="Pharmacist. Verify your mobile and AHPRA registration to apply for shifts; the rest earns badges."
      steps={STEPS}
      role="PHARMACIST"
      targets={{ mobile: { path: "/mobile-verify" }, ahpra: { step: "basic" }, gov_id: { step: "identity" }, referees: { step: "referees" } }}
    />
  );
}
