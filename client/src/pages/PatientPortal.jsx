import { useQuery } from "@apollo/client";
import { MY_PROFILE_QUERY } from "../features/portal/api.js";
import { PortalAppointments } from "../features/portal/PortalAppointments.jsx";
import { PortalPrescriptions } from "../features/portal/PortalPrescriptions.jsx";
import { PortalInvoices } from "../features/portal/PortalInvoices.jsx";
import { PortalRecords } from "../features/portal/PortalRecords.jsx";

export function PatientPortal() {
  const { data } = useQuery(MY_PROFILE_QUERY);
  const profile = data?.myProfile;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Patient portal</h1>
        <p className="mt-1 text-sm text-gray-500">
          {profile ? `Welcome, ${profile.name}.` : "Manage your care."}
        </p>
      </div>

      <PortalAppointments />
      <PortalPrescriptions />
      <PortalInvoices />
      <PortalRecords />
    </div>
  );
}
