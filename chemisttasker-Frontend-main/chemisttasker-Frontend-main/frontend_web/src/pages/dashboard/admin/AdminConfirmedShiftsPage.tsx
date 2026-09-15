import { useAdminScope } from "../../../contexts/AdminScopeContext";
import ConfirmedShiftsPage from "../sidebar/ConfirmedShiftsPage";

export default function AdminConfirmedShiftsPage() {
  useAdminScope();
  return <ConfirmedShiftsPage />;
}
