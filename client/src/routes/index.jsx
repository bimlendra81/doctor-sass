import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "../components/AppLayout.jsx";
import { RequireAuth } from "../components/RequireAuth.jsx";
import { Home } from "../pages/Home.jsx";
import { Login } from "../pages/Login.jsx";
import { Signup } from "../pages/Signup.jsx";
import { SetupClinic } from "../pages/SetupClinic.jsx";
import { Team } from "../pages/Team.jsx";
import { Patients } from "../pages/Patients.jsx";
import { Schedule } from "../pages/Schedule.jsx";
import { Booking } from "../pages/Booking.jsx";
import { Availability } from "../pages/Availability.jsx";
import { Settings } from "../pages/Settings.jsx";
import { Prescriptions } from "../pages/Prescriptions.jsx";
import { Invoices } from "../pages/Invoices.jsx";

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/login", element: <Login /> },
      { path: "/signup", element: <Signup /> },
      {
        path: "/setup",
        element: (
          <RequireAuth>
            <SetupClinic />
          </RequireAuth>
        ),
      },
      {
        path: "/team",
        element: (
          <RequireAuth>
            <Team />
          </RequireAuth>
        ),
      },
      {
        path: "/patients",
        element: (
          <RequireAuth>
            <Patients />
          </RequireAuth>
        ),
      },
      {
        path: "/schedule",
        element: (
          <RequireAuth>
            <Schedule />
          </RequireAuth>
        ),
      },
      {
        path: "/booking",
        element: (
          <RequireAuth>
            <Booking />
          </RequireAuth>
        ),
      },
      {
        path: "/availability",
        element: (
          <RequireAuth>
            <Availability />
          </RequireAuth>
        ),
      },
      {
        path: "/prescriptions",
        element: (
          <RequireAuth>
            <Prescriptions />
          </RequireAuth>
        ),
      },
      {
        path: "/invoices",
        element: (
          <RequireAuth>
            <Invoices />
          </RequireAuth>
        ),
      },
      {
        path: "/settings",
        element: (
          <RequireAuth>
            <Settings />
          </RequireAuth>
        ),
      },
      {
        path: "/",
        element: (
          <RequireAuth>
            <Home />
          </RequireAuth>
        ),
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
