import { useCallback, useMemo, useState } from "react";
import { useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { useSearchParams } from "react-router-dom";
import { Button, Input } from "../components/ui/index.js";
import { store } from "../store/index.js";
import {
  CREATE_PRESCRIPTION_MUTATION,
  DOCTORS_QUERY,
  DRUG_SEARCH_QUERY,
  ISSUE_PRESCRIPTION_MUTATION,
  PATIENTS_QUERY,
  PRESCRIPTIONS_QUERY,
  UPDATE_PRESCRIPTION_MUTATION,
  VOID_PRESCRIPTION_MUTATION,
} from "../features/prescriptions/api.js";

const STATUS_FILTERS = [
  { key: null, label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "ACTIVE", label: "Active" },
  { key: "VOID", label: "Void" },
];

const STATUS_STYLES = {
  DRAFT: "bg-amber-50 text-amber-700 ring-amber-200",
  ACTIVE: "bg-blue-50 text-blue-700 ring-blue-200",
  VOID: "bg-gray-100 text-gray-500 ring-gray-200",
};

const emptyItem = () => ({ drugName: "", strength: "", dosage: "", frequency: "", duration: "", quantity: "", refills: "0" });

function toItemRow(item) {
  return {
    drugName: item.drugName ?? "",
    strength: item.strength ?? "",
    dosage: item.dosage ?? "",
    frequency: item.frequency ?? "",
    duration: item.duration ?? "",
    quantity: item.quantity != null ? String(item.quantity) : "",
    refills: item.refills != null ? String(item.refills) : "0",
  };
}

export function Prescriptions() {
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(null);
  const [editing, setEditing] = useState(null);
  const [patientId, setPatientId] = useState(searchParams.get("patientId") ?? "");
  const [appointmentId, setAppointmentId] = useState(searchParams.get("appointmentId") ?? "");
  const [doctorId, setDoctorId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [activeRow, setActiveRow] = useState(null);

  const { data, loading, refetch } = useQuery(PRESCRIPTIONS_QUERY, {
    variables: { status: statusFilter },
  });
  const { data: patientsData } = useQuery(PATIENTS_QUERY, { variables: { page: 1, pageSize: 100 } });
  const { data: doctorsData } = useQuery(DOCTORS_QUERY);
  const [searchDrugs] = useLazyQuery(DRUG_SEARCH_QUERY);
  const [createRx] = useMutation(CREATE_PRESCRIPTION_MUTATION);
  const [updateRx] = useMutation(UPDATE_PRESCRIPTION_MUTATION);
  const [issueRx] = useMutation(ISSUE_PRESCRIPTION_MUTATION);
  const [voidRx] = useMutation(VOID_PRESCRIPTION_MUTATION);

  const prescriptions = useMemo(
    () => [...(data?.prescriptions ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data],
  );
  const patients = patientsData?.patients?.items ?? [];
  const doctors = doctorsData?.doctors ?? [];

  const startCreate = () => {
    setEditing(null);
    setPatientId("");
    setAppointmentId("");
    setDoctorId("");
    setNotes("");
    setItems([emptyItem()]);
    setSuggestions([]);
    setError(null);
  };

  const startEdit = (rx) => {
    setEditing(rx);
    setPatientId(rx.patient.id);
    setDoctorId(rx.doctor.id);
    setNotes(rx.notes ?? "");
    setItems(rx.items.length ? rx.items.map(toItemRow) : [emptyItem()]);
    setError(null);
  };

  const patchItem = (index, field, value) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));

  const onDrugInput = async (index, value) => {
    patchItem(index, "drugName", value);
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setActiveRow(null);
      return;
    }
    const { data: d } = await searchDrugs({ variables: { q, limit: 8 } });
    setSuggestions(d?.drugSearch ?? []);
    setActiveRow(index);
  };

  const pickDrug = (index, drug) => {
    patchItem(index, "drugName", drug.name);
    if (drug.strength) patchItem(index, "strength", drug.strength);
    setSuggestions([]);
    setActiveRow(null);
  };

  const submitItems = () =>
    items
      .filter((it) => it.drugName.trim())
      .map((it) => ({
        drugName: it.drugName.trim(),
        strength: it.strength.trim() || undefined,
        dosage: it.dosage.trim() || undefined,
        frequency: it.frequency.trim() || undefined,
        duration: it.duration.trim() || undefined,
        quantity: it.quantity ? Number(it.quantity) : undefined,
        refills: it.refills ? Number(it.refills) : 0,
      }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const input = {
        patientId,
        doctorId,
        appointmentId: appointmentId || undefined,
        notes: notes.trim() || undefined,
        items: submitItems(),
      };
      if (editing) {
        await updateRx({ variables: { id: editing.id, input: { notes: input.notes, items: input.items } } });
      } else {
        await createRx({ variables: { input } });
      }
      startCreate();
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Save failed");
    }
  };

  const onIssue = async (rx) => {
    if (!window.confirm(`Issue prescription #${rx.scriptNo ?? "(draft)"} for ${rx.patient.name}?`)) return;
    setError(null);
    try {
      await issueRx({ variables: { id: rx.id } });
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Issue failed");
    }
  };

  const onVoid = async (rx) => {
    const reason = window.prompt(`Reason to void prescription for ${rx.patient.name}:`);
    if (!reason) return;
    setError(null);
    try {
      await voidRx({ variables: { id: rx.id, reason } });
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Void failed");
    }
  };

  const openPdf = useCallback(async (rx) => {
    setError(null);
    try {
      const token = store.getState().auth.accessToken;
      const res = await fetch(`/prescriptions/${rx.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `PDF request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.download = `prescription-${rx.scriptNo ?? rx.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      setError(err.message ?? "PDF download failed");
    }
  }, []);

  const canEdit = (rx) => rx.status === "DRAFT";
  const canIssue = (rx) => rx.status === "DRAFT";
  const canVoid = (rx) => rx.status !== "VOID";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prescriptions</h1>
          <p className="mt-1 text-sm text-gray-500">{prescriptions.length} total</p>
        </div>
        <Button onClick={startCreate}>{editing ? "New prescription" : "New prescription"}</Button>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <form onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Patient</label>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.phone ? `— ${p.phone}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Doctor</label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Select doctor…</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.user?.name ?? d.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h3 className="mt-5 text-sm font-semibold text-gray-700">Items</h3>
          <div className="mt-2 space-y-3">
            {items.map((it, index) => (
              <div key={index} className="relative rounded-lg border border-gray-200 p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                  <div className="col-span-2 sm:col-span-2">
                    <Input
                      label="Drug"
                      value={it.drugName}
                      onChange={(e) => onDrugInput(index, e.target.value)}
                      placeholder="Search drug…"
                      required
                    />
                    {activeRow === index && suggestions.length > 0 && (
                      <div className="absolute left-3 top-14 z-10 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
                        {suggestions.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => pickDrug(index, d)}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
                          >
                            <span className="font-medium text-gray-900">{d.name}</span>
                            {d.strength && <span className="ml-2 text-gray-500">{d.strength}</span>}
                            {d.category && <span className="ml-1 text-xs text-gray-400">{d.category}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Input label="Strength" value={it.strength} onChange={(e) => patchItem(index, "strength", e.target.value)} placeholder="500mg" />
                  <Input label="Dosage" value={it.dosage} onChange={(e) => patchItem(index, "dosage", e.target.value)} placeholder="1-0-1" />
                  <Input label="Frequency" value={it.frequency} onChange={(e) => patchItem(index, "frequency", e.target.value)} placeholder="3x/day" />
                  <Input label="Duration" value={it.duration} onChange={(e) => patchItem(index, "duration", e.target.value)} placeholder="7 days" />
                  <Input label="Qty" type="number" min="1" value={it.quantity} onChange={(e) => patchItem(index, "quantity", e.target.value)} />
                  <Input label="Refills" type="number" min="0" max="12" value={it.refills} onChange={(e) => patchItem(index, "refills", e.target.value)} />
                </div>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  className="mt-2 text-xs text-red-600 hover:underline"
                  disabled={items.length === 1}
                >
                  Remove item
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, emptyItem()])}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            + Add item
          </button>

          <div className="mt-4">
            <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions, follow-up…" />
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            {editing && (
              <Button variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={!patientId || !doctorId}>
              {editing ? "Save changes" : "Create draft"}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key ?? "all"}
              onClick={() => setStatusFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${
                statusFilter === f.key
                  ? "bg-blue-600 text-white ring-blue-600"
                  : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : prescriptions.length === 0 ? (
          <p className="text-sm text-gray-500">No prescriptions found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Script #</th>
                <th className="py-2 pr-4">Patient</th>
                <th className="py-2 pr-4">Doctor</th>
                <th className="py-2 pr-4">Items</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {prescriptions.map((rx) => (
                <tr key={rx.id}>
                  <td className="py-3 pr-4 font-medium text-gray-900">
                    {rx.scriptNo != null ? `#${String(rx.scriptNo).padStart(4, "0")}` : "—"}
                  </td>
                  <td className="py-3 pr-4 text-gray-800">{rx.patient?.name ?? "—"}</td>
                  <td className="py-3 pr-4 text-gray-600">{rx.doctor?.user?.name ?? "—"}</td>
                  <td className="py-3 pr-4 text-gray-600">
                    {rx.items.map((it) => it.drugName).join(", ")}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[rx.status] ?? ""}`}>
                      {rx.status}
                    </span>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    {canEdit(rx) && (
                      <button onClick={() => startEdit(rx)} className="text-blue-600 hover:underline">
                        Edit
                      </button>
                    )}
                    {canIssue(rx) && (
                      <button onClick={() => onIssue(rx)} className="ml-3 text-green-600 hover:underline">
                        Issue
                      </button>
                    )}
                    {rx.status === "ACTIVE" && (
                      <button onClick={() => openPdf(rx)} className="ml-3 text-gray-700 hover:underline">
                        PDF
                      </button>
                    )}
                    {canVoid(rx) && (
                      <button onClick={() => onVoid(rx)} className="ml-3 text-red-600 hover:underline">
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
