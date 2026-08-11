import { useQuery } from "@apollo/client";
import { MY_PRESCRIPTIONS_QUERY } from "./api.js";

const STATUS_STYLES = {
  DRAFT: "bg-amber-50 text-amber-700",
  ACTIVE: "bg-blue-50 text-blue-700",
  VOID: "bg-gray-100 text-gray-500",
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");

export function PortalPrescriptions() {
  const { data, loading } = useQuery(MY_PRESCRIPTIONS_QUERY);
  const prescriptions = data?.myPrescriptions ?? [];

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-gray-900">Prescriptions</h2>
      {loading ? (
        <p className="mt-3 text-sm text-gray-500">Loading…</p>
      ) : prescriptions.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No prescriptions yet.</p>
      ) : (
        <ul className="mt-4 divide-y">
          {prescriptions.map((rx) => (
            <li key={rx.id} className="py-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900">
                  #{rx.scriptNo ?? "—"} · {rx.doctor?.user?.name ?? "Doctor"}
                </p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[rx.status] ?? ""}`}>
                  {rx.status}
                </span>
              </div>
              <p className="text-sm text-gray-500">Issued {fmtDate(rx.issuedAt ?? rx.createdAt)}</p>
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                {rx.items.map((item) => (
                  <li key={item.id}>
                    {item.drugName}
                    {item.strength ? ` ${item.strength}` : ""}
                    {item.dosage ? ` — ${item.dosage}` : ""}
                    {item.frequency ? ` · ${item.frequency}` : ""}
                    {item.duration ? ` · ${item.duration}` : ""}
                    {item.refills > 0 ? ` · ${item.refills} refill${item.refills === 1 ? "" : "s"}` : ""}
                  </li>
                ))}
              </ul>
              {rx.notes && <p className="mt-2 text-sm text-gray-400">{rx.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
