// verify-m9.mjs
// E2E verification for M9 — Invoicing & Billing.
// Requires the server running at http://localhost:4000.
// Usage: node scripts/verify-m9.mjs [BASE_URL]
//
// Covers:
//   - createInvoice: server-computed subtotal/tax/total (client-trusted math rejected by construction)
//   - per-clinic invoiceNo sequence, currency snapshot from Clinic.currency (M7)
//   - recordPayment partial -> OPEN, full -> PAID; balanceDue tracks remaining
//   - guards: overpayment, payment on PAID/VOID, void on PAID, double void
//   - voidInvoice keeps the audit trail (reason, voidedAt, payments preserved)
//   - tenant isolation: cross-clinic invoice(id) NOT_FOUND, empty list
//   - authZ: unauthenticated + role + validation errors

const BASE = process.argv[2] ?? "http://localhost:4000";
const API = `${BASE}/graphql`;

let passed = 0;
let failed = 0;

function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.error(`  \u2717 ${name}${extra ? ` \u2014 ${extra}` : ""}`);
  }
}

class GqlError extends Error {
  constructor(message, code, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

async function gql(query, variables, token) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) {
    const first = body.errors[0];
    throw new GqlError(first.message, first.extensions?.code ?? "GRAPHQL_ERROR", body.data);
  }
  return body.data;
}

const M = {
  signup: `mutation($input: SignupInput!) { signup(input: $input) { accessToken refreshToken user { id role clinicId } } }`,
  createClinic: `mutation($input: CreateClinicInput!) {
    createClinic(input: $input) { accessToken refreshToken clinic { id } user { id role clinicId } }
  }`,
  createPatient: `mutation($input: CreatePatientInput!) { createPatient(input: $input) { id name } }`,
  settings: `mutation($input: UpdateClinicSettingsInput!) { updateClinicSettings(input: $input) { settings { currency timezone } } }`,
  createInvoice: `mutation($input: CreateInvoiceInput!) { createInvoice(input: $input) {
    id invoiceNo subtotal tax total currency status dueDate items { description qty unitPrice amount }
    payments { id amount method } balanceDue } }`,
  getInvoice: `query($id: ID!) { invoice(id: $id) {
    id invoiceNo subtotal tax total balanceDue currency status voidReason voidedAt
    patient { id name } items { description qty unitPrice amount } payments { amount method note } } }`,
  listInvoices: `query($patientId: ID, $status: InvoiceStatus, $date: String) {
    invoices(patientId: $patientId, status: $status, date: $date) { id invoiceNo status total balanceDue } }`,
  recordPayment: `mutation($input: RecordPaymentInput!) { recordPayment(input: $input) {
    id status balanceDue payments { id amount method note } } }`,
  voidInvoice: `mutation($id: ID!, $reason: String!) { voidInvoice(id: $id, reason: $reason) {
    id status voidReason voidedAt payments { id amount } } }`,
};

async function main() {
  const suffix = Date.now().toString(36);
  const password = "m9-verify-pass";

  // --- 1. Onboard clinic A with a non-default currency (M7 consumption) ---
  let res = await gql(M.signup, { input: { name: "M9 Admin", email: `m9-a-${suffix}@test.dev`, password } });
  res = await gql(M.createClinic, { input: { name: "M9 Clinic A", subdomain: `m9a${suffix}` } }, res.signup.accessToken);
  const tokenA = res.createClinic.accessToken;
  const clinicA = res.createClinic.clinic.id;
  check("clinic A onboarded", !!clinicA);

  await gql(M.settings, { input: { currency: "eur", timezone: "UTC" } }, tokenA);

  res = await gql(M.createPatient, { input: { name: "M9 Patient A", phone: "555-0301" } }, tokenA);
  const patientA = res.createPatient.id;
  check("patient A created", !!patientA);

  // --- 2. Create invoice; totals computed server-side ---
  res = await gql(
    M.createInvoice,
    {
      input: {
        patientId: patientA,
        items: [
          { description: "Consultation", qty: 1, unitPrice: 100.0 },
          { description: "Blood test", qty: 2, unitPrice: 75.0 },
        ],
        taxRate: 10,
        dueDate: "2026-09-01",
      },
    },
    tokenA,
  );
  const inv1 = res.createInvoice;
  check("invoiceNo starts at 1", inv1.invoiceNo === 1, `got ${inv1.invoiceNo}`);
  check("subtotal = 100 + 2*75 = 250", inv1.subtotal === 250, `got ${inv1.subtotal}`);
  check("tax = 10% = 25", inv1.tax === 25, `got ${inv1.tax}`);
  check("total = 275", inv1.total === 275, `got ${inv1.total}`);
  check("line amounts computed server-side", inv1.items.every((it, i) => it.amount === it.qty * it.unitPrice));
  check("currency snapshots clinic currency (eur)", inv1.currency === "eur", `got ${inv1.currency}`);
  check("starts as DRAFT", inv1.status === "DRAFT");
  check("dueDate round-trips", inv1.dueDate === "2026-09-01T00:00:00.000Z", `got ${inv1.dueDate}`);
  check("balanceDue == total on new invoice", inv1.balanceDue === 275);
  check("no payments yet", inv1.payments.length === 0);

  // --- 3. Partial payment -> OPEN ---
  res = await gql(
    M.recordPayment,
    { input: { invoiceId: inv1.id, amount: 100, method: "CASH", note: "deposit" } },
    tokenA,
  );
  const p1 = res.recordPayment;
  check("partial payment -> OPEN", p1.status === "OPEN", `got ${p1.status}`);
  check("balanceDue drops to 175", p1.balanceDue === 175, `got ${p1.balanceDue}`);
  check("payment row recorded with method+note", p1.payments.length === 1 && p1.payments[0].method === "CASH" && p1.payments[0].note === "deposit");

  // --- 4. Full payment -> PAID ---
  res = await gql(
    M.recordPayment,
    { input: { invoiceId: inv1.id, amount: 175, method: "CARD" } },
    tokenA,
  );
  const p2 = res.recordPayment;
  check("full payment -> PAID", p2.status === "PAID", `got ${p2.status}`);
  check("balanceDue is 0", p2.balanceDue === 0, `got ${p2.balanceDue}`);

  // --- 5. Guards on the paid invoice ---
  let payPaid = false;
  try {
    await gql(M.recordPayment, { input: { invoiceId: inv1.id, amount: 5, method: "CASH" } }, tokenA);
  } catch (err) {
    payPaid = err.code === "INVOICE_ALREADY_PAID";
  }
  check("payment on PAID invoice rejected", payPaid);

  let voidPaid = false;
  try {
    await gql(M.voidInvoice, { id: inv1.id, reason: "oops" }, tokenA);
  } catch (err) {
    voidPaid = err.code === "INVALID_STATUS";
  }
  check("voiding a PAID invoice rejected", voidPaid);

  // --- 6. Overpayment guard on an OPEN invoice ---
  res = await gql(
    M.createInvoice,
    {
      input: {
        patientId: patientA,
        items: [{ description: "Follow-up", qty: 1, unitPrice: 50 }],
      },
    },
    tokenA,
  );
  const inv2 = res.createInvoice;
  check("second invoice gets invoiceNo 2", inv2.invoiceNo === 2, `got ${inv2.invoiceNo}`);
  check("zero-tax total is 50", inv2.total === 50);

  let overpay = false;
  try {
    await gql(M.recordPayment, { input: { invoiceId: inv2.id, amount: 60, method: "CASH" } }, tokenA);
  } catch (err) {
    overpay = err.code === "OVERPAYMENT";
  }
  check("overpayment rejected (OVERPAYMENT)", overpay);

  // --- 7. Void keeps the audit trail ---
  await gql(M.recordPayment, { input: { invoiceId: inv2.id, amount: 20, method: "ONLINE" } }, tokenA);
  res = await gql(M.voidInvoice, { id: inv2.id, reason: "Billing error — duplicate" }, tokenA);
  const v2 = res.voidInvoice;
  check("void -> VOID with reason", v2.status === "VOID" && v2.voidReason === "Billing error — duplicate");
  check("voidedAt stamped", !!v2.voidedAt);
  check("payments preserved for audit trail", v2.payments.length === 1, `${v2.payments.length}`);

  let doubleVoid = false;
  try {
    await gql(M.voidInvoice, { id: inv2.id, reason: "again" }, tokenA);
  } catch (err) {
    doubleVoid = err.code === "INVALID_STATUS";
  }
  check("double void rejected", doubleVoid);

  let payVoid = false;
  try {
    await gql(M.recordPayment, { input: { invoiceId: inv2.id, amount: 1, method: "CASH" } }, tokenA);
  } catch (err) {
    payVoid = err.code === "INVALID_STATUS";
  }
  check("payment on VOID invoice rejected", payVoid);

  // --- 8. getInvoice detail + list filters ---
  res = await gql(M.getInvoice, { id: inv1.id }, tokenA);
  check("invoice(id) returns patient + items + payments",
    res.invoice.patient.id === patientA && res.invoice.items.length === 2 && res.invoice.payments.length === 2);

  res = await gql(M.listInvoices, { patientId: patientA, status: "PAID" }, tokenA);
  check("list by patient + status finds the paid invoice",
    res.invoices.length === 1 && res.invoices[0].id === inv1.id);

  const today = new Date().toISOString().slice(0, 10);
  res = await gql(M.listInvoices, { date: today }, tokenA);
  check("list by clinic-local date finds all", res.invoices.length === 2, `${res.invoices.length}`);

  res = await gql(M.listInvoices, { status: "VOID" }, tokenA);
  check("list by status VOID finds inv2", res.invoices.length === 1 && res.invoices[0].id === inv2.id);

  // --- 9. Tenant isolation ---
  res = await gql(M.signup, { input: { name: "M9 Admin B", email: `m9-b-${suffix}@test.dev`, password } });
  res = await gql(M.createClinic, { input: { name: "M9 Clinic B", subdomain: `m9b${suffix}` } }, res.signup.accessToken);
  const tokenB = res.createClinic.accessToken;
  check("clinic B onboarded", !!res.createClinic.clinic.id);

  let crossTenant = false;
  try {
    await gql(M.getInvoice, { id: inv1.id }, tokenB);
  } catch (err) {
    crossTenant = err.code === "NOT_FOUND";
  }
  check("cross-clinic invoice(id) -> NOT_FOUND", crossTenant);

  res = await gql(M.listInvoices, {}, tokenB);
  check("clinic B sees no invoices", res.invoices.length === 0);

  // --- 10. AuthZ + validation ---
  let anonList = false;
  try {
    await gql(M.listInvoices, {});
  } catch (err) {
    anonList = err.code === "UNAUTHORIZED";
  }
  check("unauthenticated invoices -> UNAUTHORIZED", anonList);

  let unknownPatient = false;
  try {
    await gql(M.createInvoice, { input: { patientId: "does-not-exist", items: [{ description: "X", qty: 1, unitPrice: 10 }] } }, tokenA);
  } catch (err) {
    unknownPatient = err.code === "NOT_FOUND";
  }
  check("unknown patient -> NOT_FOUND", unknownPatient);

  let emptyItems = false;
  try {
    await gql(M.createInvoice, { input: { patientId: patientA, items: [] } }, tokenA);
  } catch (err) {
    emptyItems = err.code === "VALIDATION_ERROR";
  }
  check("empty items rejected (VALIDATION_ERROR)", emptyItems);

  let zeroAmount = false;
  try {
    await gql(M.recordPayment, { input: { invoiceId: inv1.id, amount: 0, method: "CASH" } }, tokenA);
  } catch (err) {
    zeroAmount = err.code === "VALIDATION_ERROR";
  }
  check("zero payment rejected (VALIDATION_ERROR)", zeroAmount);

  let badMethod = false;
  try {
    await gql(M.recordPayment, { input: { invoiceId: inv1.id, amount: 1, method: "BITCOIN" } }, tokenA);
  } catch (err) {
    badMethod = err.code === "VALIDATION_ERROR" || err.code === "BAD_USER_INPUT";
  }
  check("invalid payment method rejected", badMethod);

  let noVoidReason = false;
  try {
    await gql(M.voidInvoice, { id: inv1.id, reason: "  " }, tokenA);
  } catch (err) {
    noVoidReason = err.code === "VALIDATION_ERROR";
  }
  check("void without reason rejected", noVoidReason);

  console.log(`\nM9 verify: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nM9 verify crashed:", err.message);
  process.exit(1);
});
