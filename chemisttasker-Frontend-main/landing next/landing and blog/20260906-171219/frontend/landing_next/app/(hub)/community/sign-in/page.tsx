import { Metadata } from 'next';
import SignInForm from './sign-in-form';
export const metadata: Metadata = { title: 'Join the conversation | ChemistTasker', robots: { index: false, follow: false } };
export default function SignIn() { return <div className="container hub-auth"><p className="eyebrow">YOUR COMMUNITY. YOUR PERSPECTIVE.</p><h1>Welcome to the conversation.</h1><p>Use your existing ChemistTasker account to join the public hub.</p><SignInForm/></div>; }
