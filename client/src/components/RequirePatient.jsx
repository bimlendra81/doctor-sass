import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

export function RequirePatient({ children }) {
  const user = useSelector((state) => state.auth.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== "PATIENT") {
    return <Navigate to="/" replace />;
  }
  return children;
}
