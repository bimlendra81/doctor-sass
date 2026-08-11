import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { useSelector } from "react-redux";
import { Button, Input } from "../components/ui/index.js";
import {
  CREATE_SCHEDULE_OVERRIDE_MUTATION,
  DELETE_AVAILABILITY_MUTATION,
  DELETE_SCHEDULE_OVERRIDE_MUTATION,
  DOCTOR_AVAILABILITY_QUERY,
  DOCTORS_QUERY,
  SET_AVAILABILITY_MUTATION,
} from "../features/appointments/api.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function Availability() {
  const user = useSelector((state) => state.auth.user);
  const isDoctor = user?.role === "DOCTOR";

  const { data: doctorsData } = useQuery(DOCTORS_QUERY);
  const doctors = doctorsData?.doctors ?? [];
  const myDoctorId = doctors.find((d) => d.user.id === user?.id)?.id ?? "";
  const [doctorId, setDoctorId] = useState("");

  const { data, refetch } = useQuery(DOCTOR_AVAILABILITY_QUERY, {
    variables: { doctorId },
    skip: !doctorId,
  });
  const weekly = data?.doctorAvailability?.weekly ?? [];
  const overrides = data?.doctorAvailability?.overrides ?? [];

  const [setAvailability] = useMutation(SET_AVAILABILITY_MUTATION);
  const [deleteAvailability] = useMutation(DELETE_AVAILABILITY_MUTATION);
  const [createOverride] = useMutation(CREATE_SCHEDULE_OVERRIDE_MUTATION);
  const [deleteOverride] = useMutation(DELETE_SCHEDULE_OVERRIDE_MUTATION);

  const [forms, setForms] = useState({});
  const [overrideForm, setOverrideForm] = useState({ date: "", startTime: "09:00", endTime: "17:00", reason: "" });
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (doctorId === "" && (isDoctor ? myDoctorId : doctors[0]?.id)) {
      setDoctorId(isDoctor ? myDoctorId : doctors[0].id);
    }
  }, [doctorId, isDoctor, myDoctorId, doctors]);

  const run = async (fn, ok) => {
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(ok);
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Action failed");
    }
  };

  const saveDay = (dow) => {
    const f = forms[dow] ?? {};
    run(
      () =>
        setAvailability({
          variables: { input: { doctorId: doctorId || null, dayOfWeek: dow, startTime: f.startTime, endTime: f.endTime, slotDuration: Number(f.slotDuration) || 30 } },
        }),
      `Saved ${DAYS[dow]}`
    );
  };

  const removeDay = (dow) => {
    run(() => deleteAvailability({ variables: { dayOfWeek: dow } }), `Removed ${DAYS[dow]}`);
  };

  const onAddOverride = () => {
    if (!overrideForm.date) {
      setError("Choose a date for the override");
      return;
    }
    run(
      () =>
        createOverride({
          variables: { input: { doctorId, date: overrideForm.date, startTime: overrideForm.startTime, endTime: overrideForm.endTime, reason: overrideForm.reason || null } },
        }),
      "Override saved"
    );
    setOverrideForm({ date: "", startTime: "09:00", endTime: "17:00", reason: "" });
  };

  const rule = (dow) => weekly.find((w) => w.dayOfWeek === dow);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Availability</h1>
      {isDoctor ? (
        <p className="text-sm text-gray-500">You're editing your own availability.</p>
      ) : (
        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">Select a doctor…</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>{d.user.name}</option>
          ))}
        </select>
      )}
    </div>

    {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm font-medium text-green-700">{message}</p>}

      {doctorId && (
        <>
          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900">Weekly schedule</h2>
            <p className="mt-1 text-sm text-gray-500">Recurring availability. An override for a specific day replaces these.</p>
            <ul className="mt-4 divide-y">
              {DAYS.map((day, dow) => {
                const r = rule(dow);
                const f = forms[dow] ?? { startTime: r?.startTime ?? "09:00", endTime: r?.endTime ?? "17:00", slotDuration: r?.slotDuration ?? 30 };
                return (
                  <li key={dow} className="flex flex-wrap items-center gap-2 py-3">
                    <span className="w-24 text-sm font-medium text-gray-700">{day}</span>
                    <input type="time" value={f.startTime} onChange={(e) => setForms((p) => ({ ...p, [dow]: { ...f, startTime: e.target.value } }))} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                    <span className="text-gray-400">to</span>
                    <input type="time" value={f.endTime} onChange={(e) => setForms((p) => ({ ...p, [dow]: { ...f, endTime: e.target.value } }))} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                    <input type="number" min="10" max="120" step="10" value={f.slotDuration} onChange={(e) => setForms((p) => ({ ...p, [dow]: { ...f, slotDuration: e.target.value } }))} className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" title="Slot length (minutes)" />
                    <div className="ml-auto flex gap-2">
                      {r && (
                        <button onClick={() => removeDay(dow)} className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                      )}
                      <Button onClick={() => saveDay(dow)}>{r ? "Update" : "Add"}</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900">One-day overrides</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
              <input type="date" value={overrideForm.date} onChange={(e) => setOverrideForm((p) => ({ ...p, date: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input type="time" value={overrideForm.startTime} onChange={(e) => setOverrideForm((p) => ({ ...p, startTime: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input type="time" value={overrideForm.endTime} onChange={(e) => setOverrideForm((p) => ({ ...p, endTime: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <Input value={overrideForm.reason} onChange={(e) => setOverrideForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Reason" />
              <Button onClick={onAddOverride}>Add override</Button>
            </div>
            {overrides.length > 0 && (
              <ul className="mt-4 divide-y">
                {overrides.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-gray-700">
                      <span className="font-medium">{o.date}</span> · {o.startTime}–{o.endTime}
                      {o.reason ? ` — ${o.reason}` : ""}
                    </span>
                    <button onClick={() => run(() => deleteOverride({ variables: { id: o.id } }), "Override removed")} className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {!doctorId && (
        <p className="text-sm text-gray-500">
          {isDoctor ? "Create your doctor profile first." : "Select a doctor to manage their availability."}
        </p>
      )}
    </div>
  );
}
