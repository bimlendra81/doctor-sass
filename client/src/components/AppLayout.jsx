import { Link, Outlet } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { useAuth } from "../hooks/useAuth.js";
import { useUiStore } from "../stores/uiStore.js";
import { Button } from "./ui/index.js";
import { CLINIC_SETTINGS_QUERY } from "../features/settings/api.js";

export function AppLayout() {
  const { user, logout } = useAuth();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { data: settingsData } = useQuery(CLINIC_SETTINGS_QUERY, { skip: !user });
  const plan = settingsData?.clinicSettings?.plan;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          {user && (
            <button
              onClick={toggleSidebar}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
            >
              {sidebarOpen ? "Hide" : "Show"} sidebar
            </button>
          )}
          <Link to="/" className="font-semibold text-gray-900">
            Doctor SaaS
          </Link>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            {plan && (
              <Link
                to="/billing"
                className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 hover:bg-teal-100"
              >
                {plan} plan
              </Link>
            )}
            <span className="text-sm text-gray-600">{user.name}</span>
            <Button variant="secondary" onClick={logout}>
              Logout
            </Button>
          </div>
        )}
      </header>
      <div className="flex">
        {user && sidebarOpen && (
          <aside className="w-48 shrink-0 border-r bg-white p-4 text-sm text-gray-700">
            <p className="font-medium text-gray-500">Workspace</p>
            <nav className="mt-2 space-y-1">
              <Link
                to="/"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Overview
              </Link>
              <Link
                to="/team"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Team
              </Link>
              <Link
                to="/patients"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Patients
              </Link>
              <Link
                to="/schedule"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Schedule
              </Link>
              <Link
                to="/booking"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Book
              </Link>
              <Link
                to="/availability"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Availability
              </Link>
              <Link
                to="/prescriptions"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Prescriptions
              </Link>
              <Link
                to="/records"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Records
              </Link>
              <Link
                to="/invoices"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Invoices
              </Link>
              <Link
                to="/billing"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Billing
              </Link>
              <Link
                to="/notifications"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Notifications
              </Link>
              <Link
                to="/settings"
                className="block rounded-lg px-2 py-1.5 hover:bg-gray-100"
              >
                Settings
              </Link>
            </nav>
          </aside>
        )}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
