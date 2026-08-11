import { useState } from "react";
import { useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import { Button, Input } from "../components/ui/index.js";
import { PATIENTS_QUERY } from "../features/patients/api.js";
import {
  CREATE_RECORD_MUTATION,
  DELETE_RECORD_MUTATION,
  RECORD_FILE_URL_QUERY,
  RECORD_UPLOAD_URL_MUTATION,
  RECORDS_QUERY,
  UPDATE_RECORD_MUTATION,
} from "../features/records/api.js";

const TYPE_LABELS = {
  LAB: "Lab",
  IMAGING: "Imaging",
  CLINICAL_NOTE: "Clinical note",
  REFERRAL: "Referral",
  OTHER: "Other",
};

const TYPES = Object.keys(TYPE_LABELS);

const emptyForm = { type: "CLINICAL_NOTE", title: "", notes: "" };

function fmtBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export function Records() {
  const [params] = useSearchParams();
  const accessToken = useSelector((s) => s.auth.accessToken);
  const [patientId, setPatientId] = useState(params.get("patientId") ?? "");
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const { data: patientsData } = useQuery(PATIENTS_QUERY, {
    variables: { page: 1, pageSize: 100 },
  });
  const { data, loading, refetch } = useQuery(RECORDS_QUERY, {
    variables: {
      patientId: patientId || null,
      type: typeFilter || null,
      page: 1,
      pageSize: 50,
    },
  });
  const [recordUploadUrl] = useMutation(RECORD_UPLOAD_URL_MUTATION);
  const [createRecord, { loading: creating }] = useMutation(CREATE_RECORD_MUTATION);
  const [updateRecord, { loading: updating }] = useMutation(UPDATE_RECORD_MUTATION);
  const [deleteRecord, { loading: deleting }] = useMutation(DELETE_RECORD_MUTATION);
  const [recordFileUrl] = useLazyQuery(RECORD_FILE_URL_QUERY);

  const authHeaders = (url) => (url.startsWith("/") ? { Authorization: `Bearer ${accessToken}` } : {});

  const patients = patientsData?.patients?.items ?? [];
  const records = data?.records?.items ?? [];
  const total = data?.records?.total ?? 0;
  const busy = creating || updating || deleting;

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFile(null);
    setError(null);
  };

  const startEdit = (r) => {
    setEditing(r);
    setForm({ type: r.type, title: r.title, notes: r.notes ?? "" });
    setFile(null);
    setError(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!patientId) {
      setError("Select a patient first");
      return;
    }
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setError(null);
    try {
      if (editing) {
        await updateRecord({
          variables: { id: editing.id, input: { title: form.title, notes: form.notes } },
        });
      } else if (file) {
        const up = await recordUploadUrl({
          variables: { patientId, fileName: file.name, mimeType: file.type || "application/octet-stream" },
        });
        const { url, fileKey } = up.data.recordUploadUrl;
        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream", ...authHeaders(url) },
          body: file,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? `Upload failed (${res.status})`);
        }
        await createRecord({
          variables: {
            input: {
              patientId,
              type: form.type,
              title: form.title,
              notes: form.notes,
              fileKey,
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              sizeBytes: file.size,
            },
          },
        });
      } else {
        await createRecord({
          variables: {
            input: { patientId, type: form.type, title: form.title, notes: form.notes },
          },
        });
      }
      startCreate();
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Save failed");
    }
  };

  const onDownload = async (r) => {
    setError(null);
    try {
      const res = await recordFileUrl({ variables: { id: r.id } });
      const link = res.data?.recordFileUrl;
      if (!link) {
        setError("This record has no file.");
        return;
      }
      if (link.url.startsWith("/")) {
        const raw = await fetch(link.url, { headers: authHeaders(link.url) });
        if (!raw.ok) throw new Error(`Download failed (${raw.status})`);
        const blob = await raw.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = r.fileName ?? "download";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      } else {
        window.open(link.url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Download failed");
    }
  };

  const onDelete = async (r) => {
    if (!window.confirm(`Delete record "${r.title}"?`)) return;
    setError(null);
    try {
      await deleteRecord({ variables: { id: r.id } });
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Delete failed");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Medical Records</h1>
        <p className="mt-1 text-sm text-gray-500">{total} record{total === 1 ? "" : "s"}</p>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Patient</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">All patients</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
            <select
              value={form.type}
              onChange={set("type")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Filter by type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">All</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Title"
            value={form.title}
            onChange={set("title")}
            placeholder="e.g. CBC report, Chest X-ray…"
            required
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Attach file</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
        <div className="mt-4">
          <Input label="Notes" value={form.notes} onChange={set("notes")} placeholder="Findings, summary, instructions…" />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          {editing && (
            <Button variant="secondary" onClick={startCreate}>
              Cancel
            </Button>
          )}
          <Button type="button" onClick={onSubmit} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add record"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-gray-500">No records found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Patient</th>
                <th className="py-2 pr-4">File</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.map((r) => {
                const patient = patients.find((p) => p.id === r.patientId);
                return (
                  <tr key={r.id}>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        {TYPE_LABELS[r.type] ?? r.type}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-medium text-gray-900">{r.title}</td>
                    <td className="py-3 pr-4 text-gray-600">{patient?.name ?? r.patientId}</td>
                    <td className="py-3 pr-4 text-gray-600">
                      {r.fileName ? `${r.fileName} (${fmtBytes(r.sizeBytes)})` : "—"}
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{fmtDate(r.createdAt)}</td>
                    <td className="py-3 text-right">
                      {r.fileKey && (
                        <button onClick={() => onDownload(r)} className="text-teal-600 hover:underline">
                          Download
                        </button>
                      )}
                      <button onClick={() => startEdit(r)} className="ml-3 text-blue-600 hover:underline">
                        Edit
                      </button>
                      <button onClick={() => onDelete(r)} className="ml-3 text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
