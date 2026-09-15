import { useAdminScope } from "../../../contexts/AdminScopeContext";
import HistoryShiftsPage from "../sidebar/HistoryShiftsPage";

export default function AdminHistoryShiftsPage() {
  useAdminScope();
  return <HistoryShiftsPage />;
}
