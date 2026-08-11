import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Button, Input } from "../components/ui/index.js";
import {
  CREATE_PATIENT_MUTATION,
  DELETE_PATIENT_MUTATION,
  PATIENTS_QUERY,
  UPDATE_PATIENT_MUTATION,
} from "../features/patients/api.js";

const emptyForm = { name: "", email: "", phone: "", dob: "", gender: "", bloodGroup: "", address: "" };

function toForm(p) {
  return {
    name: p?.name ?? "",
    email: p?.email ?? "",
    phone: p?.phone ?? "",
    dob: p?.dob ? p.dob.slice(0, 10) : "",
    gender: p?.gender ?? "",
    bloodGroup: p?.bloodGroup ?? "",
    address: p?.address ?? "",
  };
}

export function Patients() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(null);

  const { data, loading, refetch } = useQuery(PATIENTS_QUERY, {
    variables: { search: search || null, page: 1, pageSize: 50 },
  });
  const [createPatient, { loading: creating }] = useMutation(CREATE_PATIENT_MUTATION);
  const [updatePatient, { loading: updating }] = useMutation(UPDATE_PATIENT_MUTATION);
  const [deletePatient, { loading: deleting }] = useMutation(DELETE_PATIENT_MUTATION);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
  };

  const startEdit = (p) => {
    setEditing(p);
    setForm(toForm(p));
    setError(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await updatePatient({ variables: { id: editing.id, input: form } });
      } else {
        await createPatient({ variables: { input: form } });
      }
      setForm(emptyForm);
      setEditing(null);
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Save failed");
    }
  };

  const onDelete = async (p) => {
    if (!window.confirm(`Delete patient ${p.name}?`)) return;
    setError(null);
    try {
      await deletePatient({ variables: { id: p.id } });
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Delete failed");
    }
  };

  const patients = data?.patients?.items ?? [];
  const total = data?.patients?.total ?? 0;
  const busy = creating || updating || deleting;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
          <p className="mt-1 text-sm text-gray-500">{total} patient{total === 1 ? "" : "s"}</p>
        </div>
        <Button onClick={startCreate}>{editing ? "New patient" : "Add patient"}</Button>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Full name" value={form.name} onChange={set("name")} required />
          <Input label="Email" type="email" value={form.email} onChange={set("email")} />
          <Input label="Phone" value={form.phone} onChange={set("phone")} />
          <Input label="Date of birth" type="date" value={form.dob} onChange={set("dob")} />
          <Input label="Gender" value={form.gender} onChange={set("gender")} placeholder="Male / Female / Other" />
          <Input label="Blood group" value={form.bloodGroup} onChange={set("bloodGroup")} placeholder="A+, O-, …" />
          <div className="sm:col-span-2">
            <Input label="Address" value={form.address} onChange={set("address")} />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          {editing && (
            <Button variant="secondary" onClick={startCreate}>
              Cancel
            </Button>
          )}
          <Button type="button" onClick={onSubmit} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create patient"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Records</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, email…"
            className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : patients.length === 0 ? (
          <p className="text-sm text-gray-500">No patients found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Blood</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {patients.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-4 font-medium text-gray-900">{p.name}</td>
                  <td className="py-3 pr-4 text-gray-600">{p.phone || "—"}</td>
                  <td className="py-3 pr-4 text-gray-600">{p.email || "—"}</td>
                  <td className="py-3 pr-4 text-gray-600">{p.bloodGroup || "—"}</td>
                  <td className="py-3 text-right">
                    <button onClick={() => startEdit(p)} className="text-blue-600 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => onDelete(p)} className="ml-3 text-red-600 hover:underline">
                      Delete
                    </button>
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
