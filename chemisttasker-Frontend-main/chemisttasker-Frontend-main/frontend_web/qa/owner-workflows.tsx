// Dev-only harness: actual production components, synthetic context, intercepted API.
// Not a production entry point and never imported by src/.
import React, { useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { configureApi } from '@chemisttasker/shared-core';
import { AuthContext } from '../src/contexts/AuthContext';
import { ColorModeProvider } from '../src/theme/sleekTheme';
import PostShiftPage from '../src/pages/dashboard/sidebar/PostShiftPage';
import { OwnerShiftCenterPage } from '../src/pages/dashboard/shiftCenter/ShiftCenterPage';

if (!import.meta.env.DEV || location.hostname !== 'localhost') throw new Error('Local development fixture only');
configureApi({ baseURL: `${location.origin}/api`, getToken: async () => null });
const query = new URLSearchParams(location.search);
const entry = query.get('entry') || '/dashboard/owner/post-shift';
function Fixture() {
  const defaults = useContext(AuthContext);
  const location = useLocation();
  return <AuthContext.Provider value={{ ...defaults, isLoading: false, user: {
    id: 900001, username: 'Review Owner', role: 'OWNER', is_mobile_verified: true,
    memberships: [{ pharmacy_id: 900001, pharmacy_name: 'Review Pharmacy', role: 'OWNER' }],
  } }}>
    <div style={{ padding: '8px 16px', background: '#06214A', color: '#fff', font: '12px sans-serif' }}>
      Local test fixture · synthetic data · requests intercepted
    </div>
    <output hidden id="fixture-path">{location.pathname}{location.search}</output>
    <main><Routes>
      <Route path="/dashboard/owner/post-shift" element={<PostShiftPage />} />
      <Route path="/dashboard/owner/shift-center/:section?" element={<OwnerShiftCenterPage />} />
    </Routes></main>
  </AuthContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<ColorModeProvider><MemoryRouter initialEntries={[entry]}><Fixture /></MemoryRouter></ColorModeProvider>);
