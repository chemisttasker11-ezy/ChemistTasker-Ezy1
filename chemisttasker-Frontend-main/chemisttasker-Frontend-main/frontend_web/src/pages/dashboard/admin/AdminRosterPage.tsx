import { useAdminScope } from "../../../contexts/AdminScopeContext";
import RosterOwnerPage from "../sidebar/RosterOwnerPage";

export default function AdminRosterPage() {
  useAdminScope();
  return <RosterOwnerPage />;
}
