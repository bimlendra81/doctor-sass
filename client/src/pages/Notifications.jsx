import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Button } from "../components/ui/index.js";
import {
  MARK_ALL_READ_MUTATION,
  MARK_READ_MUTATION,
  MY_NOTIFICATIONS_QUERY,
  MY_PREFERENCES_QUERY,
  SET_PREFERENCE_MUTATION,
  UNREAD_COUNT_QUERY,
} from "../features/notifications/api.js";

const TYPE_LABELS = {
  APPOINTMENT_BOOKED: "Appointment booked",
  APPOINTMENT_CONFIRMED: "Appointment confirmed",
  APPOINTMENT_CANCELLED: "Appointment cancelled",
  APPOINTMENT_COMPLETED: "Appointment completed",
  APPOINTMENT_NO_SHOW: "Appointment no-show",
  PRESCRIPTION_ISSUED: "Prescription issued",
  INVOICE_CREATED: "Invoice created",
  PAYMENT_RECORDED: "Payment recorded",
  INVOICE_VOIDED: "Invoice voided",
  REMINDER: "Reminder",
};

const CHANNEL_LABELS = {
  EMAIL: "Email",
  SMS: "SMS",
  IN_APP: "In-app",
};

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Notifications() {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data, loading, refetch } = useQuery(MY_NOTIFICATIONS_QUERY, {
    variables: { page, pageSize: PAGE_SIZE },
  });
  const { data: prefsData, refetch: refetchPrefs } = useQuery(MY_PREFERENCES_QUERY);
  const { data: unreadData, refetch: refetchUnread } = useQuery(UNREAD_COUNT_QUERY);
  const [markRead] = useMutation(MARK_READ_MUTATION);
  const [markAll] = useMutation(MARK_ALL_READ_MUTATION);
  const [setPref, { loading: savingPref }] = useMutation(SET_PREFERENCE_MUTATION);

  const [error, setError] = useState(null);

  const notifications = data?.myNotifications?.items ?? [];
  const total = data?.myNotifications?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unread = unreadData?.unreadNotificationCount ?? 0;
  const prefs = Object.fromEntries((prefsData?.myNotificationPreferences ?? []).map((p) => [p.channel, p.enabled]));

  const onMarkRead = async (n) => {
    if (n.isRead) return;
    try {
      await markRead({ variables: { id: n.id } });
      refetch();
      refetchUnread();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Could not update notification");
    }
  };

  const onMarkAll = async () => {
    try {
      await markAll();
      refetch();
      refetchUnread();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Could not update notifications");
    }
  };

  const onTogglePref = async (channel) => {
    try {
      await setPref({ variables: { channel, enabled: !prefs[channel] } });
      refetchPrefs();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Could not update preference");
    }
  };

  const go = (next) => {
    setPage(Math.max(1, Math.min(totalPages, next)));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} notification{total === 1 ? "" : "s"}
            {unread > 0 ? ` · ${unread} unread` : ""}
          </p>
        </div>
        <Button variant="secondary" onClick={onMarkAll} disabled={unread === 0}>
          Mark all read
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Inbox</h2>
        {loading ? (
          <p className="mt-4 text-sm text-gray-500">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No notifications yet.</p>
        ) : (
          <ul className="mt-4 divide-y">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => onMarkRead(n)}
                  className={`flex w-full items-start gap-3 px-2 py-3 text-left hover:bg-gray-50 ${
                    n.isRead ? "opacity-60" : ""
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? "bg-transparent" : "bg-blue-500"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-gray-900">
                        {TYPE_LABELS[n.type] ?? n.type}
                        {!n.isRead && <span className="ml-2 text-xs font-semibold text-blue-600">New</span>}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(n.createdAt)}</span>
                    </span>
                    <span className="block text-sm text-gray-600">{n.body}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <Button variant="secondary" onClick={() => go(page - 1)} disabled={page <= 1}>
              Previous
            </Button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <Button variant="secondary" onClick={() => go(page + 1)} disabled={page >= totalPages}>
              Next
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Delivery preferences</h2>
        <p className="mt-1 text-sm text-gray-500">Choose which channels receive notifications.</p>
        <div className="mt-4 space-y-3">
          {["EMAIL", "SMS", "IN_APP"].map((channel) => (
            <label key={channel} className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700">{CHANNEL_LABELS[channel] ?? channel}</span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[channel]}
                disabled={savingPref}
                onClick={() => onTogglePref(channel)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  prefs[channel] ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    prefs[channel] ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
