import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { useSearchParams } from "react-router-dom";
import { Button, Input } from "../components/ui/index.js";
import { CLINIC_SETTINGS_QUERY } from "../features/settings/api.js";
import {
  CREATE_INVOICE_MUTATION,
  INVOICES_QUERY,
  PATIENTS_QUERY,
  RECORD_PAYMENT_MUTATION,
  VOID_INVOICE_MUTATION,
} from "../features/billing/api.js";

const STATUS_FILTERS = [
  { key: null, label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "OPEN", label: "Open" },
  { key: "PAID", label: "Paid" },
  { key: "VOID", label: "Void" },
];

const STATUS_STYLES = {
  DRAFT: "bg-amber-50 text-amber-700 ring-amber-200",
  OPEN: "bg-blue-50 text-blue-700 ring-blue-200",
  PAID: "bg-green-50 text-green-700 ring-green-200",
  VOID: "bg-gray-100 text-gray-500 ring-gray-200",
};

const PAYMENT_METHODS = ["CASH", "CARD", "ONLINE"];

const emptyLine = () => ({ description: "", qty: "1", unitPrice: "" });

function money(amount, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency ?? "usd").toUpperCase(),
    }).format(amount ?? 0);
  } catch {
    return `${(amount ?? 0).toFixed(2)} ${currency ?? "usd"}`.toUpperCase();
  }
}

function esc(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function printInvoice(invoice, clinic) {
  const rows = invoice.items
    .map(
      (it) => `
        <tr>
          <td>${esc(it.description)}</td>
          <td class="num">${it.qty}</td>
          <td class="num">${money(it.unitPrice, invoice.currency)}</td>
          <td class="num">${money(it.amount, invoice.currency)}</td>
        </tr>`,
    )
    .join("");
  const payments = (invoice.payments ?? [])
    .map(
      (p) => `
        <tr>
          <td>${esc(p.method)}</td>
          <td class="num">${money(p.amount, invoice.currency)}</td>
        </tr>`,
    )
    .join("");
  const title = clinic?.brandName || clinic?.name || "Clinic";

  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;
  win.document.write(`
<!DOCTYPE html>
<html>
<head>
  <title>Invoice #${invoice.invoiceNo}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 32px; }
    .no-print { display: block; margin-bottom: 16px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f766e; padding-bottom: 16px; }
    .brand { font-size: 22px; font-weight: 700; color: #0f766e; }
    .clinic-contact { margin-top: 4px; font-size: 12px; color: #555; }
    h2 { font-size: 18px; margin: 0 0 4px; }
    .meta { display: flex; gap: 48px; margin: 20px 0; }
    .meta div { font-size: 13px; }
    .meta .label { color: #777; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; border-bottom: 2px solid #e5e7eb; padding: 8px; color: #555; }
    td { border-bottom: 1px solid #f3f4f6; padding: 8px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals { margin-left: auto; width: 240px; margin-top: 12px; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { border-top: 2px solid #0f766e; font-weight: 700; font-size: 15px; margin-top: 4px; }
    .status { display: inline-block; border-radius: 9999px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
    .voided { color: #b91c1c; margin-top: 12px; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">Print</button>
  </div>
  <div class="header">
    <div>
      <div class="brand">${esc(title)}</div>
      <div class="clinic-contact">
        ${esc(clinic?.contactEmail ?? "")}${clinic?.contactEmail && clinic?.contactPhone ? " · " : ""}${esc(clinic?.contactPhone ?? "")}
      </div>
    </div>
    <div>
      <h2>INVOICE ${invoice.invoiceNo != null ? `#${String(invoice.invoiceNo).padStart(4, "0")}` : ""}</h2>
      <span class="status" style="background:#f3f4f6;color:#374151;">${invoice.status}</span>
    </div>
  </div>
  <div class="meta">
    <div>
      <div class="label">Billed to</div>
      <div style="font-weight:600;">${esc(invoice.patient?.name)}</div>
      <div>${esc(invoice.patient?.phone ?? "")}</div>
    </div>
    <div>
      <div class="label">Invoice date</div>
      <div>${new Date(invoice.createdAt).toLocaleDateString()}</div>
    </div>
    <div>
      <div class="label">Due date</div>
      <div>${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "—"}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${money(invoice.subtotal, invoice.currency)}</span></div>
    <div><span>Tax</span><span>${money(invoice.tax, invoice.currency)}</span></div>
    <div class="grand"><span>Total</span><span>${money(invoice.total, invoice.currency)}</span></div>
    <div><span>Balance due</span><span>${money(invoice.balanceDue, invoice.currency)}</span></div>
  </div>
  ${payments ? `<h3 style="margin-top:24px;font-size:13px;color:#555;">Payments</h3><table><thead><tr><th>Method</th><th class="num">Amount</th></tr></thead><tbody>${payments}</tbody></table>` : ""}
  ${invoice.voidReason ? `<p class="voided">VOIDED — ${esc(invoice.voidReason)}</p>` : ""}
</body>
</html>`);
  win.document.close();
}

export function Invoices() {
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(null);
  const [patientId, setPatientId] = useState(searchParams.get("patientId") ?? "");
  const [appointmentId, setAppointmentId] = useState(searchParams.get("appointmentId") ?? "");
  const [taxRate, setTaxRate] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [paying, setPaying] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [error, setError] = useState(null);

  const { data, loading, refetch } = useQuery(INVOICES_QUERY, {
    variables: { status: statusFilter },
  });
  const { data: patientsData } = useQuery(PATIENTS_QUERY, { variables: { page: 1, pageSize: 100 } });
  const { data: clinicData } = useQuery(CLINIC_SETTINGS_QUERY);
  const [createInvoice] = useMutation(CREATE_INVOICE_MUTATION);
  const [recordPayment] = useMutation(RECORD_PAYMENT_MUTATION);
  const [voidInvoice] = useMutation(VOID_INVOICE_MUTATION);

  const clinic = clinicData?.clinicSettings;
  const invoices = useMemo(
    () => [...(data?.invoices ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data],
  );
  const patients = patientsData?.patients?.items ?? [];

  const startCreate = () => {
    setPatientId(searchParams.get("patientId") ?? "");
    setAppointmentId(searchParams.get("appointmentId") ?? "");
    setTaxRate("0");
    setDueDate("");
    setLines([emptyLine()]);
    setError(null);
  };

  const patchLine = (index, field, value) =>
    setLines((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));

  const submitLines = () =>
    lines
      .filter((it) => it.description.trim())
      .map((it) => ({
        description: it.description.trim(),
        qty: Number(it.qty) || 1,
        unitPrice: Number(it.unitPrice) || 0,
      }));

  const previewSubtotal = lines.reduce(
    (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const previewTax = Math.round(previewSubtotal * (Number(taxRate) || 0)) / 100;
  const previewTotal = previewSubtotal + previewTax;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const input = {
        patientId,
        appointmentId: appointmentId || undefined,
        items: submitLines(),
        taxRate: Number(taxRate) || undefined,
        dueDate: dueDate || undefined,
      };
      await createInvoice({ variables: { input } });
      startCreate();
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Save failed");
    }
  };

  const openPay = (inv) => {
    setPaying(inv);
    setPayAmount(inv.balanceDue.toFixed(2));
    setPayMethod("CASH");
    setError(null);
  };

  const onPay = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await recordPayment({
        variables: {
          input: { invoiceId: paying.id, amount: Number(payAmount), method: payMethod },
        },
      });
      setPaying(null);
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Payment failed");
    }
  };

  const onVoid = async (inv) => {
    const reason = window.prompt(`Reason to void invoice #${inv.invoiceNo} for ${inv.patient.name}:`);
    if (!reason) return;
    setError(null);
    try {
      await voidInvoice({ variables: { id: inv.id, reason } });
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Void failed");
    }
  };

  const canPay = (inv) => inv.status === "DRAFT" || inv.status === "OPEN";
  const canVoid = (inv) => inv.status === "DRAFT" || inv.status === "OPEN";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="mt-1 text-sm text-gray-500">{invoices.length} total</p>
        </div>
        <Button onClick={startCreate}>New invoice</Button>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <form onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            <Input label="Tax rate (%)" type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <h3 className="mt-5 text-sm font-semibold text-gray-700">Line items</h3>
          <div className="mt-2 space-y-3">
            {lines.map((it, index) => (
              <div key={index} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-6">
                <div className="col-span-3">
                  <Input
                    label="Description"
                    value={it.description}
                    onChange={(e) => patchLine(index, "description", e.target.value)}
                    placeholder="Consultation fee…"
                    required
                  />
                </div>
                <Input label="Qty" type="number" min="1" value={it.qty} onChange={(e) => patchLine(index, "qty", e.target.value)} />
                <Input label="Unit price" type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => patchLine(index, "unitPrice", e.target.value)} />
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    className="mb-1 text-xs text-red-600 hover:underline"
                    disabled={lines.length === 1}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            + Add line
          </button>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>
              Totals (server computes): Subtotal{" "}
              <span className="font-medium text-gray-900">{money(previewSubtotal, clinic?.currency)}</span>
              {" · "}Tax <span className="font-medium text-gray-900">{money(previewTax, clinic?.currency)}</span>
              {" · "}Total <span className="font-medium text-gray-900">{money(previewTotal, clinic?.currency)}</span>
            </span>
            <Button type="submit" disabled={!patientId}>
              Create invoice
            </Button>
          </div>
        </form>
      </div>

      {paying && (
        <div className="rounded-xl bg-white p-6 shadow ring-1 ring-blue-200">
          <h3 className="text-sm font-semibold text-gray-900">
            Record payment — invoice #{paying.invoiceNo} · {paying.patient.name}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Balance due: {money(paying.balanceDue, paying.currency)}
          </p>
          <form onSubmit={onPay} className="mt-3 flex flex-wrap items-end gap-3">
            <Input label="Amount" type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={!Number(payAmount)}>
              Record payment
            </Button>
            <Button variant="secondary" onClick={() => setPaying(null)}>
              Cancel
            </Button>
          </form>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

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
        ) : invoices.length === 0 ? (
          <p className="text-sm text-gray-500">No invoices found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Inv #</th>
                <th className="py-2 pr-4">Patient</th>
                <th className="py-2 pr-4">Items</th>
                <th className="py-2 pr-4 text-right">Total</th>
                <th className="py-2 pr-4 text-right">Balance</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-3 pr-4 font-medium text-gray-900">
                    #{String(inv.invoiceNo).padStart(4, "0")}
                  </td>
                  <td className="py-3 pr-4 text-gray-800">{inv.patient?.name ?? "—"}</td>
                  <td className="py-3 pr-4 text-gray-600">
                    {inv.items.map((it) => it.description).join(", ")}
                  </td>
                  <td className="py-3 pr-4 text-right font-medium text-gray-900 tabular-nums">
                    {money(inv.total, inv.currency)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-gray-600">
                    {money(inv.balanceDue, inv.currency)}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[inv.status] ?? ""}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <button onClick={() => printInvoice(inv, clinic)} className="text-gray-700 hover:underline">
                      Print
                    </button>
                    {canPay(inv) && (
                      <button onClick={() => openPay(inv)} className="ml-3 text-green-600 hover:underline">
                        Pay
                      </button>
                    )}
                    {canVoid(inv) && (
                      <button onClick={() => onVoid(inv)} className="ml-3 text-red-600 hover:underline">
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
