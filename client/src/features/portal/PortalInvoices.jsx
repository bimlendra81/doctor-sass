import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { MY_INVOICES_QUERY, PAY_INVOICE_MUTATION } from "./api.js";

const STATUS_STYLES = {
  DRAFT: "bg-amber-50 text-amber-700",
  OPEN: "bg-blue-50 text-blue-700",
  PAID: "bg-green-50 text-green-700",
  VOID: "bg-gray-100 text-gray-500",
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");

export function PortalInvoices() {
  const [error, setError] = useState(null);
  const { data, loading, refetch } = useQuery(MY_INVOICES_QUERY);
  const [payInvoice, { loading: paying }] = useMutation(PAY_INVOICE_MUTATION);

  const invoices = data?.myInvoices ?? [];

  const onPay = async (invoice) => {
    setError(null);
    try {
      const res = await payInvoice({ variables: { invoiceId: invoice.id } });
      const { devMode, url } = res.data.payInvoice;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      if (devMode) {
        refetch();
      }
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Payment failed");
    }
  };

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-gray-900">Invoices</h2>
      {loading ? (
        <p className="mt-3 text-sm text-gray-500">Loading…</p>
      ) : invoices.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No invoices yet.</p>
      ) : (
        <ul className="mt-4 divide-y">
          {invoices.map((inv) => (
            <li key={inv.id} className="py-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900">
                  #{inv.invoiceNo} · {inv.currency} {inv.total.toFixed(2)}
                </p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[inv.status] ?? ""}`}>
                  {inv.status}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Created {fmtDate(inv.createdAt)}
                {inv.dueDate ? ` · due ${fmtDate(inv.dueDate)}` : ""}
                {inv.status === "OPEN" && ` · balance ${inv.currency} ${inv.balanceDue.toFixed(2)}`}
              </p>
              {inv.items.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  {inv.items.map((item) => (
                    <li key={item.id}>
                      {item.description} — {item.qty} × {item.unitPrice.toFixed(2)} = {item.amount.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}
              {inv.status === "OPEN" && (
                <div className="mt-2">
                  <button
                    onClick={() => onPay(inv)}
                    disabled={paying}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {paying ? "Processing…" : "Pay now"}
                  </button>
                </div>
              )}
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
