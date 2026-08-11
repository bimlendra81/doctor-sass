import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Button } from "../components/ui/index.js";
import {
  APPOINTMENTS_QUERY,
  CANCEL_APPOINTMENT_MUTATION,
  COMPLETE_APPOINTMENT_MUTATION,
  CONFIRM_APPOINTMENT_MUTATION,
  DOCTORS_QUERY,
  MARK_NO_SHOW_MUTATION,
} from "../features/appointments/api.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STYLES = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  CONFIRMED: "bg-blue-50 text-blue-700 ring-blue-200",
  COMPLETED: "bg-green-50 text-green-700 ring-green-200",
  CANCELLED: "bg-gray-100 text-gray-500 ring-gray-200",
  NO_SHOW: "bg-red-50 text-red-700 ring-red-200",
};

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Schedule() {
  const [date, setDate] = useState(toDateStr(new Date()));
  const [doctorId, setDoctorId] = useState("");
  const [error, setError] = useState(null);

  const { data: doctorsData } = useQuery(DOCTORS_QUERY);
  const { data, loading, refetch } = useQuery(APPOINTMENTS_QUERY, {
    variables: { doctorId: doctorId || null, date },
  });

  const [confirmAppt] = useMutation(CONFIRM_APPOINTMENT_MUTATION);
  const [completeAppt] = useMutation(COMPLETE_APPOINTMENT_MUTATION);
  const [cancelAppt] = useMutation(CANCEL_APPOINTMENT_MUTATION);
  const [noShow] = useMutation(MARK_NO_SHOW_MUTATION);

  const run = async (fn) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Action failed");
    }
  };

  const onCancel = (a) => {
    const reason = window.prompt("Cancellation reason (optional):");
    if (reason === null) return;
    run(() => cancelAppt({ variables: { id: a.id, cancelReason: reason || null } }));
  };

  const appointments = data?.appointments ?? [];
  const selected = date ? new Date(`${date}T00:00:00`) : null;

  const shiftDay = (delta) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(toDateStr(d));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="mt-1 text-sm text-gray-500">{appointments.length} appointment{appointments.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => shiftDay(-1)}>Prev</Button>
          <Button variant="secondary" onClick={() => shiftDay(1)}>Next</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All doctors</option>
          {(doctorsData?.doctors ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.user.name}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">
          {selected ? `${DAYS[selected.getDay()]}, ${MONTHS[selected.getMonth()]} ${selected.getDate()}` : ""}
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-xl bg-white p-6 shadow">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : appointments.length === 0 ? (
          <p className="text-sm text-gray-500">No appointments for this day.</p>
        ) : (
          <ul className="divide-y">
            {appointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-20 font-mono text-sm font-medium text-gray-900">
                    {fmtTime(a.startTime)}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">{a.patient?.name}</p>
                    <p className="text-xs text-gray-500">
                      {a.patient?.phone || ""} · {a.doctor?.user?.name}
                      {a.note ? ` · ${a.note}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STYLES[a.status]}`}>
                    {a.status}
                  </span>
                  {a.status === "PENDING" && (
                    <>
                      <button onClick={() => run(() => confirmAppt({ variables: { id: a.id } }))} className="text-xs font-medium text-blue-600 hover:underline">Confirm</button>
                      <button onClick={() => onCancel(a)} className="text-xs font-medium text-gray-500 hover:underline">Cancel</button>
                    </>
                  )}
                  {a.status === "CONFIRMED" && (
                    <>
                      <button onClick={() => run(() => completeAppt({ variables: { id: a.id } }))} className="text-xs font-medium text-green-600 hover:underline">Complete</button>
                      <button onClick={() => onCancel(a)} className="text-xs font-medium text-gray-500 hover:underline">Cancel</button>
                      <button onClick={() => run(() => noShow({ variables: { id: a.id } }))} className="text-xs font-medium text-red-600 hover:underline">No-show</button>
                    </>
                  )}
                  {a.status === "COMPLETED" && (
                    <>
                      <a
                        href={`/prescriptions?appointmentId=${a.id}&patientId=${a.patient?.id}`}
                        className="text-xs font-medium text-teal-600 hover:underline"
                      >
                        Rx
                      </a>
                      <a
                        href={`/invoices?appointmentId=${a.id}&patientId=${a.patient?.id}`}
                        className="text-xs font-medium text-teal-600 hover:underline"
                      >
                        Invoice
                      </a>
                    </>
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
