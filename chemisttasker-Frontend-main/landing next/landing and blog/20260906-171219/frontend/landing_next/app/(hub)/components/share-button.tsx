'use client';
import { useState } from 'react';
import { Link as LinkIcon, Check } from 'lucide-react';
export default function ShareButton() {
  const [status, setStatus] = useState('');
  async function share() {
    try { await navigator.clipboard.writeText(window.location.origin + window.location.pathname); setStatus('Link copied'); }
    catch { setStatus('Copy the link from your address bar'); }
  }
  return <span className="hub-share-wrap"><button className="hub-share" onClick={share}>{status === 'Link copied' ? <Check size={17}/> : <LinkIcon size={17}/>}Share article</button><span role="status" className="hub-share-status">{status}</span></span>;
}
