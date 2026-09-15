import { useAdminScope } from "../../../contexts/AdminScopeContext";
import PostShiftPage from "../sidebar/PostShiftPage";

export default function AdminPostShiftPage() {
  useAdminScope();
  return <PostShiftPage />;
}
