import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";

export function RequireAuth({ children }) {
  const user = useSelector((state) => state.auth.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (!user.clinicId && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  return children;
}
