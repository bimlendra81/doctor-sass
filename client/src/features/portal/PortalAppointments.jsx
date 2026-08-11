import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Input } from "../../components/ui/index.js";
import {
  BOOK_MY_APPOINTMENT_MUTATION,
  CANCEL_MY_APPOINTMENT_MUTATION,
  MY_APPOINTMENTS_QUERY,
  PORTAL_DOCTOR_SLOTS_QUERY,
  PORTAL_DOCTORS_QUERY,
} from "./api.js";

const STATUS_STYLES = {
  PENDING: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-red-50 text-red-600",
  NO_SHOW: "bg-gray-100 text-gray-500",
};

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const fmtDate = (iso) => new Date(iso).toLocaleDateString();

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PortalAppointments() {
  const [date, setDate] = useState(toDateStr(new Date()));
  const [doctorId, setDoctorId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const { data: doctorsData } = useQuery(PORTAL_DOCTORS_QUERY);
  const { data: apptsData, refetch: refetchAppts } = useQuery(MY_APPOINTMENTS_QUERY, {
    variables: { page: 1, pageSize: 50 },
  });
  const { data: slotsData, refetch: refetchSlots } = useQuery(PORTAL_DOCTOR_SLOTS_QUERY, {
    variables: { doctorId: doctorId || null, date },
    skip: !doctorId,
  });
  const [bookAppointment, { loading: booking }] = useMutation(BOOK_MY_APPOINTMENT_MUTATION);
  const [cancelAppointment] = useMutation(CANCEL_MY_APPOINTMENT_MUTATION);

  const doctors = doctorsData?.portalDoctors ?? [];
  const slots = slotsData?.portalDoctorSlots ?? [];
  const appointments = apptsData?.myAppointments?.items ?? [];

  const onBook = async (slot) => {
    setError(null);
    setSuccess(null);
    try {
      const { data } = await bookAppointment({
        variables: { input: { doctorId, startTime: slot.startTime, note: note || null } },
      });
      setSuccess(`Booked ${fmtDate(data.bookMyAppointment.startTime)} at ${fmtTime(data.bookMyAppointment.startTime)}`);
      setNote("");
      refetchSlots();
      refetchAppts();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Booking failed");
    }
  };

  const onCancel = async (appt) => {
    if (!window.confirm("Cancel this appointment?")) return;
    setError(null);
    setSuccess(null);
    try {
      await cancelAppointment({ variables: { id: appt.id, cancelReason: "Cancelled from patient portal" } });
      refetchSlots();
      refetchAppts();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Cancel failed");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My appointments</h1>
        <p className="mt-1 text-sm text-gray-500">Book a visit or manage your upcoming appointments.</p>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Book a new appointment</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Doctor</span>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">Select a doctor…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name}
                  {d.specialization ? ` — ${d.specialization}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for visit…" />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-3 text-sm font-medium text-green-700">{success}</p>}

        {doctorId && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700">Available slots</h3>
            {slots.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No availability for this doctor on that day.</p>
            ) : (
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {slots.map((slot, i) => (
                  <button
                    key={i}
                    disabled={slot.booked || booking}
                    onClick={() => onBook(slot)}
                    className={`rounded-lg border px-2 py-2 font-mono text-xs transition-colors ${
                      slot.booked
                        ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
                        : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    }`}
                    title={slot.booked ? "Already booked" : "Tap to book"}
                  >
                    {fmtTime(slot.startTime)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Upcoming & recent</h2>
        {appointments.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No appointments yet.</p>
        ) : (
          <ul className="mt-4 divide-y">
            {appointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {fmtDate(a.startTime)} · {fmtTime(a.startTime)}–{fmtTime(a.endTime)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {a.doctor?.user?.name ?? "Doctor"} · {a.type}
                  </p>
                  {a.note && <p className="text-sm text-gray-400">{a.note}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status] ?? ""}`}>
                    {a.status}
                  </span>
                  {(a.status === "PENDING" || a.status === "CONFIRMED") && (
                    <button onClick={() => onCancel(a)} className="text-sm text-red-600 hover:underline">
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
