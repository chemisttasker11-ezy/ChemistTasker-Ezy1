import { useAdminScope } from "../../../contexts/AdminScopeContext";
import PosterShiftDetailPage from "../sidebar/PosterShiftDetailPage";

export default function AdminPosterShiftDetailPage() {
  useAdminScope();
  return <PosterShiftDetailPage />;
}
