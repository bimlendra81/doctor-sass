import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Button, Input } from "../components/ui/index.js";
import {
  BOOK_APPOINTMENT_MUTATION,
  DOCTOR_SLOTS_QUERY,
  DOCTORS_QUERY,
} from "../features/appointments/api.js";
import { PATIENTS_QUERY } from "../features/patients/api.js";

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Booking() {
  const [date, setDate] = useState(toDateStr(new Date()));
  const [doctorId, setDoctorId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [type, setType] = useState("IN_PERSON");
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const { data: doctorsData } = useQuery(DOCTORS_QUERY);
  const { data: patientsData } = useQuery(PATIENTS_QUERY, { variables: { pageSize: 200 } });
  const { data: slotsData, refetch: refetchSlots } = useQuery(DOCTOR_SLOTS_QUERY, {
    variables: { doctorId: doctorId || null, date },
    skip: !doctorId,
  });
  const [bookAppointment, { loading }] = useMutation(BOOK_APPOINTMENT_MUTATION);

  const doctors = doctorsData?.doctors ?? [];
  const patients = patientsData?.patients?.items ?? [];
  const slots = slotsData?.doctorSlots ?? [];

  const onBook = async (slot) => {
    setError(null);
    setSuccess(null);
    if (!patientId) {
      setError("Choose a patient first");
      return;
    }
    try {
      const { data } = await bookAppointment({
        variables: { input: { patientId, doctorId, startTime: slot.startTime, type, note: note || null } },
      });
      setSuccess(`Booked for ${data.bookAppointment.patient.name} at ${fmtTime(data.bookAppointment.startTime)}`);
      setNote("");
      refetchSlots();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Booking failed");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Book appointment</h1>

      <div className="grid grid-cols-1 gap-4 rounded-xl bg-white p-6 shadow sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Doctor</span>
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Select a doctor…</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.user.name}{d.specialization ? ` — ${d.specialization}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Patient</span>
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Select a patient…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.phone ? ` — ${p.phone}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Visit type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="IN_PERSON">In person</option>
            <option value="VIDEO">Video</option>
          </select>
        </label>
        <div className="sm:col-span-2">
          <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for visit…" />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm font-medium text-green-700">{success}</p>}

      {doctorId && (
        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900">Available slots</h2>
          {slots.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No availability for this doctor on that day.</p>
          ) : (
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {slots.map((slot, i) => (
                <button
                  key={i}
                  disabled={slot.booked}
                  onClick={() => onBook(slot)}
                  className={`rounded-lg border px-2 py-2 font-mono text-xs transition-colors ${
                    slot.booked
                      ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
                      : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                  title={slot.booked ? "Already booked" : "Tap to book"}
                >
                  {fmtTime(slot.startTime)}
                  {loading && "…"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
