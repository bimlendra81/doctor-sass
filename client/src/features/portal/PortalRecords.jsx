import { useSelector } from "react-redux";
import { useLazyQuery, useQuery } from "@apollo/client";
import { MY_RECORDS_QUERY, MY_RECORD_FILE_URL_QUERY } from "./api.js";

const TYPE_LABELS = {
  LAB: "Lab",
  IMAGING: "Imaging",
  CLINICAL_NOTE: "Clinical note",
  REFERRAL: "Referral",
  OTHER: "Other",
};

const fmtBytes = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");

export function PortalRecords() {
  const accessToken = useSelector((s) => s.auth.accessToken);
  const { data, loading } = useQuery(MY_RECORDS_QUERY);
  const [recordFileUrl] = useLazyQuery(MY_RECORD_FILE_URL_QUERY);

  const records = data?.myRecords ?? [];

  const authHeaders = (url) => (url.startsWith("/") ? { Authorization: `Bearer ${accessToken}` } : {});

  const onDownload = async (r) => {
    try {
      const res = await recordFileUrl({ variables: { id: r.id } });
      const link = res.data?.myRecordFileUrl;
      if (!link) return;
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
    } catch {
      // Ignore download errors in the portal list; file-less records simply have no link.
    }
  };

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-gray-900">Medical records</h2>
      {loading ? (
        <p className="mt-3 text-sm text-gray-500">Loading…</p>
      ) : records.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No records yet.</p>
      ) : (
        <ul className="mt-4 divide-y">
          {records.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900">{r.title}</p>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  {TYPE_LABELS[r.type] ?? r.type}
                </span>
              </div>
              <p className="text-sm text-gray-500">{fmtDate(r.createdAt)}</p>
              {r.notes && <p className="mt-1 text-sm text-gray-600">{r.notes}</p>}
              {r.fileName && (
                <button onClick={() => onDownload(r)} className="mt-1 text-sm text-teal-600 hover:underline">
                  Download {r.fileName} {fmtBytes(r.sizeBytes)}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
