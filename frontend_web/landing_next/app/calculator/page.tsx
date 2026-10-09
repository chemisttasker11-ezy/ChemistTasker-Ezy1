import PublicHeader from '@/public/header';
import PublicFooter from '@/public/footer';
import type { Metadata } from 'next';
import Calculator from '@/features/paediatric-calculator/components/calculator';
import '../(public)/public.css';
import './calculator.css';

export const metadata: Metadata = {
  title: 'Paediatric anti-infective calculator | ChemistTasker',
  description: 'Source-linked oral paediatric anti-infective calculations for health professionals. Clinical validation pending.',
  robots: { index: false, follow: false },
};

export default function CalculatorPage() {
  return (
    <>
      <PublicHeader skipTarget="workspace" />
      <div className="calculator-app"><Calculator /></div>
      <PublicFooter />
    </>
  );
}
