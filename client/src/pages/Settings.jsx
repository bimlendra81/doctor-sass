import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { CURRENCIES, IANA_ZONES } from "@doctor-sass/shared";
import { Button, Input } from "../components/ui/index.js";
import {
  CLINIC_SETTINGS_QUERY,
  UPDATE_CLINIC_SETTINGS_MUTATION,
} from "../features/settings/api.js";
import { CHANGE_PASSWORD_MUTATION } from "../features/auth/api.js";

const CURRENCY_LABELS = {
  usd: "USD — US Dollar",
  eur: "EUR — Euro",
  gbp: "GBP — British Pound",
  inr: "INR — Indian Rupee",
  aud: "AUD — Australian Dollar",
  cad: "CAD — Canadian Dollar",
  nzd: "NZD — New Zealand Dollar",
  aed: "AED — UAE Dirham",
  sgd: "SGD — Singapore Dollar",
  zar: "ZAR — South African Rand",
  ngn: "NGN — Nigerian Naira",
  kes: "KES — Kenyan Shilling",
  jpy: "JPY — Japanese Yen",
  brl: "BRL — Brazilian Real",
};

const emptyToNull = (v) => (typeof v === "string" && v.trim() === "" ? null : v);

export function Settings() {
  const { data, loading } = useQuery(CLINIC_SETTINGS_QUERY);
  const [updateSettings, { loading: saving }] = useMutation(UPDATE_CLINIC_SETTINGS_MUTATION);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const [changePassword, { loading: savingPassword }] = useMutation(CHANGE_PASSWORD_MUTATION);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState(null);

  const settings = data?.clinicSettings;

  const setPwField = (field) => (e) => {
    setPw((prev) => ({ ...prev, [field]: e.target.value }));
    setPwSaved(false);
    setPwError(null);
  };

  const onPasswordSubmit = async (e) => {
    e.preventDefault();
    setPwError(null);
    setPwSaved(false);
    if (pw.newPassword !== pw.confirm) {
      setPwError("New passwords do not match");
      return;
    }
    try {
      await changePassword({
        variables: { input: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } },
      });
      setPw({ currentPassword: "", newPassword: "", confirm: "" });
      setPwSaved(true);
    } catch (err) {
      setPwError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Could not change password");
    }
  };

  useEffect(() => {
    if (settings && !form) {
      setForm({
        name: settings.name ?? "",
        brandName: settings.brandName ?? "",
        logoUrl: settings.logoUrl ?? "",
        timezone: settings.timezone ?? "UTC",
        contactEmail: settings.contactEmail ?? "",
        contactPhone: settings.contactPhone ?? "",
        currency: settings.currency ?? "usd",
      });
    }
  }, [settings, form]);

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setSaved(false);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await updateSettings({
        variables: {
          input: {
            name: form.name,
            brandName: emptyToNull(form.brandName),
            logoUrl: emptyToNull(form.logoUrl),
            timezone: form.timezone,
            contactEmail: emptyToNull(form.contactEmail),
            contactPhone: emptyToNull(form.contactPhone),
            currency: form.currency,
          },
        },
      });
      setSaved(true);
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Could not save settings");
    }
  };

  if (loading || !form) {
    return <p className="text-sm text-gray-500">Loading settings…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">{settings.subdomain}.clinic.com</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900">Branding</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Clinic name" value={form.name} onChange={set("name")} required />
            <Input label="Brand name (letterheads, emails)" value={form.brandName} onChange={set("brandName")} placeholder={form.name} />
            <div className="sm:col-span-2">
              <Input
                label="Logo URL"
                value={form.logoUrl}
                onChange={set("logoUrl")}
                placeholder="https://example.com/logo.png"
              />
              <p className="mt-1 text-xs text-gray-400">File upload arrives with medical records (M11).</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900">Region & currency</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Timezone</span>
              <select
                value={form.timezone}
                onChange={set("timezone")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {IANA_ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">Slots and daily views follow this timezone.</p>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Currency</span>
              <select
                value={form.currency}
                onChange={set("currency")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {CURRENCY_LABELS[code] ?? code}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">Used on invoices and prescriptions.</p>
            </label>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Contact email" type="email" value={form.contactEmail} onChange={set("contactEmail")} />
            <Input label="Contact phone" value={form.contactPhone} onChange={set("contactPhone")} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm font-medium text-green-700">Settings saved.</p>}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </form>

      <form onSubmit={onPasswordSubmit} className="space-y-6">
        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900">Password</h2>
          <p className="mt-1 text-sm text-gray-500">Change the password for your account.</p>
          <div className="mt-4 grid grid-cols-1 gap-4">
            <Input
              label="Current password"
              type="password"
              value={pw.currentPassword}
              onChange={setPwField("currentPassword")}
              required
            />
            <Input
              label="New password"
              type="password"
              value={pw.newPassword}
              onChange={setPwField("newPassword")}
              required
            />
            <Input
              label="Confirm new password"
              type="password"
              value={pw.confirm}
              onChange={setPwField("confirm")}
              required
            />
          </div>

          {pwError && <p className="mt-3 text-sm text-red-600">{pwError}</p>}
          {pwSaved && <p className="mt-3 text-sm font-medium text-green-700">Password updated.</p>}

          <div className="mt-4">
            <Button type="submit" disabled={savingPassword}>
              {savingPassword ? "Updating…" : "Update password"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
