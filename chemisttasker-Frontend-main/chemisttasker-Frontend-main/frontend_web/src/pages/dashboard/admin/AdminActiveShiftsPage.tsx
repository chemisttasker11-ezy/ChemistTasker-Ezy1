import { useAdminScope } from "../../../contexts/AdminScopeContext";
import ActiveShiftsPage from "../sidebar/ActiveShiftsPage";

export default function AdminActiveShiftsPage() {
  useAdminScope();
  return <ActiveShiftsPage />;
}
