import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useColorMode } from '../../../theme/sleekTheme';
import apiClient from '../../../utils/apiClient';
import PageHeader from '../../../components/ui/PageHeader';
import PostShiftForm from '../../../../shared/postShift/PostShiftForm';
import ShiftBoardPreview from './ShiftsBoard/components/ShiftBoardPreview';

/** Vite host for the shared Post shift wizard. */
export default function PostShiftPage({ onCompleted }: { onCompleted?: () => void }) {
  const { user, activePersona, activeAdminPharmacyId } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { mode } = useColorMode();
  return (
    <PostShiftForm onCompleted={onCompleted} user={user} activePersona={activePersona} activeAdminPharmacyId={activeAdminPharmacyId}
      navigate={to => (typeof to === 'number' ? navigate(to) : navigate(to))} search={search} isDarkMode={mode === 'dark'}
      apiClient={apiClient} renderHeader={(title, subtitle) => <PageHeader title={title} subtitle={subtitle} />}
      renderPreview={draft => <ShiftBoardPreview shift={draft} />} />
  );
}
