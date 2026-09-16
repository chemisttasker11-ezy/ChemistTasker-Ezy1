import React from 'react';
import ReactDOM from 'react-dom/client';

import KioskPage from '../pages/attendance/KioskPage';
import '../index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <KioskPage />
  </React.StrictMode>,
);
