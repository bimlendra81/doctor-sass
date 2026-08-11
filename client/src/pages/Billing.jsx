import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Button } from "../components/ui/index.js";
import {
  CREATE_CHECKOUT_MUTATION,
  SUBSCRIPTION_INFO_QUERY,
} from "../features/subscription/api.js";

const PLAN_LABELS = { FREE: "Free", PRO: "Pro", ENTERPRISE: "Enterprise" };

const PLANS = [
  {
    key: "FREE",
    name: "Free",
    price: "$0 / month",
    blurb: "For small clinics getting started.",
    cta: "Current plan",
    current: true,
  },
  {
    key: "PRO",
    name: "Pro",
    price: "Stripe pricing",
    blurb: "Unlocks prescriptions, invoices and higher usage caps.",
    cta: "Upgrade to Pro",
    current: false,
  },
  {
    key: "ENTERPRISE",
    name: "Enterprise",
    price: "Stripe pricing",
    blurb: "Unlimited patients and appointments.",
    cta: "Upgrade to Enterprise",
    current: false,
  },
];

function meter(used, limit) {
  const capped = limit == null ? null : Math.min(used, limit);
  return limit == null ? null : Math.round((used / limit) * 100);
}

export function Billing() {
  const { data, loading, refetch } = useQuery(SUBSCRIPTION_INFO_QUERY);
  const [createCheckout, { loading: checkoutLoading }] = useMutation(CREATE_CHECKOUT_MUTATION);
  const [notice, setNotice] = useState(null);

  const info = data?.subscriptionInfo;
  const plan = info?.plan ?? "FREE";

  const upgrade = async (target) => {
    setNotice(null);
    try {
      const { data: result } = await createCheckout({ variables: { plan: target } });
      const payload = result.createCheckoutSession;
      if (payload.devMode) {
        setNotice(
          `Checkout is in dev mode (Stripe not configured), so no payment page is shown. ` +
            `A ${target} subscription would be activated by the webhook.`,
        );
      } else if (payload.url) {
        window.location.href = payload.url;
      }
    } catch (err) {
      setNotice(err.graphQLErrors?.[0]?.message ?? err.message ?? "Checkout failed");
    }
  };

  const featureRows = [
    { key: "prescriptions", label: "E-prescriptions" },
    { key: "invoices", label: "Invoices & payments" },
  ];

  if (loading) {
    return <div className="text-sm text-gray-500">Loading subscription…</div>;
  }

  const patientPct = meter(info.usage.patients, info.limits.patients);
  const apptPct = meter(info.usage.appointmentsToday, info.limits.appointmentsPerDay);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing & plan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Current plan:{" "}
          <span className="font-semibold text-gray-900">{PLAN_LABELS[plan]}</span>{" "}
          <span className="text-gray-400">·</span> status: {info.subscriptionStatus}
        </p>
      </div>

      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {notice}
        </div>
      )}

      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-sm font-semibold text-gray-700">Usage this period</h2>
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">Patients</span>
              <span className="text-gray-500">
                {info.usage.patients}
                {info.limits.patients != null ? ` / ${info.limits.patients}` : " · unlimited"}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-teal-600"
                style={{ width: `${Math.max(4, Math.min(100, patientPct ?? 100))}%` }}
              />
            </div>
            {info.limits.patients != null && patientPct >= 90 && (
              <p className="mt-1 text-xs text-amber-600">Near the patient limit — consider upgrading.</p>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">Appointments today</span>
              <span className="text-gray-500">
                {info.usage.appointmentsToday}
                {info.limits.appointmentsPerDay != null ? ` / ${info.limits.appointmentsPerDay}` : " · unlimited"}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-teal-600"
                style={{ width: `${Math.max(4, Math.min(100, apptPct ?? 100))}%` }}
              />
            </div>
            {info.limits.appointmentsPerDay != null && apptPct >= 90 && (
              <p className="mt-1 text-xs text-amber-600">Near today’s limit — consider upgrading.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-sm font-semibold text-gray-700">Features on your plan</h2>
        <ul className="mt-3 divide-y divide-gray-100">
          {featureRows.map((f) => {
            const enabled = info.limits.features[f.key];
            return (
              <li key={f.key} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">{f.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {enabled ? "Included" : "Pro+ plan"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = p.key === plan;
          return (
            <div
              key={p.key}
              className={`rounded-xl border bg-white p-5 shadow ${isCurrent ? "border-teal-500 ring-1 ring-teal-200" : "border-gray-200"}`}
            >
              <h3 className="font-semibold text-gray-900">{p.name}</h3>
              <p className="mt-1 text-sm text-gray-500">{p.price}</p>
              <p className="mt-2 text-sm text-gray-600">{p.blurb}</p>
              <div className="mt-4">
                {isCurrent ? (
                  <Button variant="secondary" disabled>
                    Current plan
                  </Button>
                ) : (
                  <Button
                    onClick={() => upgrade(p.key)}
                    disabled={checkoutLoading}
                  >
                    {p.cta}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <div className="flex justify-end">
        <button onClick={() => refetch()} className="text-xs text-gray-400 hover:text-gray-600">
          Refresh usage
        </button>
      </div>
    </div>
  );
}
