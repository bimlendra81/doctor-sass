import { useQuery } from "@apollo/client";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { DASHBOARD_QUERY, APPOINTMENTS_QUERY } from "../features/appointments/api.js";

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CARD_STYLES = {
  total: "border-gray-200",
  CONFIRMED: "border-blue-200",
  COMPLETED: "border-green-200",
  CANCELLED: "border-gray-300",
  NO_SHOW: "border-red-200",
};

export function Home() {
  const user = useSelector((state) => state.auth.user);
  const today = toDateStr(new Date());

  const { data: statsData } = useQuery(DASHBOARD_QUERY, { variables: { date: today } });
  const { data: queueData } = useQuery(APPOINTMENTS_QUERY, { variables: { date: today } });

  const byStatus = Object.fromEntries(
    (statsData?.dashboard?.byStatus ?? []).map((s) => [s.status, s.count])
  );
  const cards = [
    { key: "total", label: "Total today", value: statsData?.dashboard?.total ?? 0 },
    { key: "CONFIRMED", label: "Confirmed", value: byStatus.CONFIRMED ?? 0 },
    { key: "COMPLETED", label: "Completed", value: byStatus.COMPLETED ?? 0 },
    { key: "CANCELLED", label: "Cancelled", value: byStatus.CANCELLED ?? 0 },
    { key: "NO_SHOW", label: "No-shows", value: byStatus.NO_SHOW ?? 0 },
  ];

  const now = Date.now();
  const queue = queueData?.appointments ?? [];
  const upcoming = queue.filter((a) => new Date(a.startTime).getTime() >= now);
  const past = queue.filter((a) => new Date(a.startTime).getTime() < now);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""} · {user?.role}
          </p>
        </div>
        <Link to="/booking" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Book appointment
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.key} className={`rounded-xl border bg-white p-4 shadow ${CARD_STYLES[c.key] ?? ""}`}>
            <p className="text-2xl font-bold text-gray-900">{c.value}</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Queue</h2>
        {queue.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No appointments today.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {upcoming.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Upcoming</p>
                <ul className="divide-y">
                  {upcoming.map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="w-16 font-mono text-sm font-medium text-gray-900">{fmtTime(a.startTime)}</span>
                        <p className="font-medium text-gray-900">{a.patient?.name}</p>
                        <p className="text-xs text-gray-500">{a.doctor?.user?.name}</p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                        {a.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Earlier today</p>
                <ul className="divide-y">
                  {past.map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2.5 opacity-70">
                      <div className="flex items-center gap-3">
                        <span className="w-16 font-mono text-sm text-gray-900">{fmtTime(a.startTime)}</span>
                        <p className="font-medium text-gray-900">{a.patient?.name}</p>
                        <p className="text-xs text-gray-500">{a.doctor?.user?.name}</p>
                      </div>
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200">
                        {a.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
