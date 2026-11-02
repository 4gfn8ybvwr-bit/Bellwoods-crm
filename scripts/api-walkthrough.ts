/**
 * Walks one fictional job from enquiry to completion over HTTP.
 * Usage: npx tsx scripts/api-walkthrough.ts
 * Expects the app on http://localhost:3000 and the seeded read-write key.
 */
const base = process.env.CRM_URL ?? "http://localhost:3000";
const key = process.env.CRM_API_KEY ?? "bw_live_rw_demo_bellwoods";

async function api(method: string, path: string, body?: unknown) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  }
  return json.data;
}

async function main() {
  const users = await api("GET", "/users");
  const salesperson = users.find((user: { role: string }) => user.role === "SALES") ?? users[0];
  const customer = await api("POST", "/customers", {
    type: "DOMESTIC",
    name: "Walkthrough Household",
    phone: "07700 900999",
    email: "walkthrough@example.com",
    address: { line1: "1 Demo Street", city: "Newcastle upon Tyne", postcode: "NE1 1WW" },
  });
  const enquiry = await api("POST", "/enquiries", {
    customerId: customer.id,
    source: "Phone",
    productInterest: "Two casements and a composite door",
  });
  await api("POST", "/appointments", {
    customerId: customer.id,
    userId: salesperson.id,
    enquiryId: enquiry.id,
    type: "SURVEY",
    title: "Survey · Walkthrough Household",
    startsAt: "03/11/2026 10:00",
    location: "1 Demo Street, Newcastle upon Tyne",
  });
  const quote = await api("POST", "/quotes", {
    customerId: customer.id,
    enquiryId: enquiry.id,
    lines: [
      { productType: "WINDOW", description: "Front casement", widthMm: 1200, heightMm: 1050, specification: "White uPVC", quantity: 2, unitPricePence: 80000 },
      { productType: "DOOR", description: "Composite door", widthMm: 900, heightMm: 2050, specification: "Green", quantity: 1, unitPricePence: 140000 },
    ],
  });
  await api("POST", `/quotes/${quote.id}/send`);
  const accepted = await api("POST", `/quotes/${quote.id}/accept`, { type: "BW", depositPercent: 25 });
  const contractId = accepted.contract.id;
  const blocked = await fetch(`${base}/api/v1/contracts/${contractId}/stage`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ stage: "ready-to-order" }),
  });
  if (blocked.status !== 400) throw new Error(`Expected the ready-to-order gate to refuse, got ${blocked.status}`);

  const file = new FormData();
  file.set("kind", "SURVEY");
  file.set("file", new Blob(["Survey for the walkthrough household.\n"], { type: "text/plain" }), "survey.txt");
  const uploaded = await fetch(`${base}/api/v1/contracts/${contractId}/documents`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: file,
  });
  if (!uploaded.ok) throw new Error(await uploaded.text());

  const detail = await api("GET", `/contracts/${contractId}`);
  const deposit = detail.customerInvoices.find((invoice: { type: string }) => invoice.type === "DEPOSIT");
  await api("POST", `/customer-invoices/${deposit.id}/mark-paid`);
  await api("POST", `/contracts/${contractId}/stage`, { stage: "ready-to-order" });

  const suppliers = await api("GET", "/suppliers");
  const camden = suppliers.find((supplier: { name: string }) => supplier.name === "Camden Group");
  const po = await api("POST", "/purchase-orders", {
    contractId,
    supplierId: camden.id,
    supplierReference: "CG-WALK-1",
    lines: [{ description: "Frames for walkthrough", quantity: 1, unitPricePence: 120000 }],
  });
  await api("POST", `/purchase-orders/${po.id}/status`, { status: "SENT" });
  const supplierInvoice = await api("POST", `/purchase-orders/${po.id}/supplier-invoices`, {
    invoiceNumber: `WALK-${Date.now()}`,
    invoiceDate: "04/11/2026",
    netPence: 120000,
    nominalCode: "5000",
  });
  if (supplierInvoice.status !== "ACCEPTED") throw new Error("Matching invoice should be accepted");
  await api("POST", `/purchase-orders/${po.id}/status`, { status: "DELIVERED" });

  const people = await api("GET", "/labour-people");
  const derek = people.find((person: { name: string }) => person.name === "Derek Walsh");
  await api("POST", "/labour-entries", { contractId, personId: derek.id, workDate: "05/11/2026", days: 1 });
  await api("POST", `/contracts/${contractId}/final-invoice`, { advanceStage: true });
  const afterInvoice = await api("GET", `/contracts/${contractId}`);
  const finalInvoice = afterInvoice.customerInvoices.find((invoice: { type: string }) => invoice.type === "FINAL");
  await api("POST", `/customer-invoices/${finalInvoice.id}/mark-paid`);
  await api("POST", `/contracts/${contractId}/stage`, { stage: "complete" });
  await api("POST", `/contracts/${contractId}/notes`, { body: "Completed via the API walkthrough" });

  const finished = await api("GET", `/contracts/${contractId}`);
  const sales = 80000 * 2 + 140000;
  const depositNet = Math.round(sales * 0.25);
  const expectedProfit = sales - 120000 - 20000;
  if (finished.costing.salesNetPence !== sales) throw new Error(`Sales ${finished.costing.salesNetPence} !== ${sales}`);
  if (finished.costing.profitPence !== expectedProfit) throw new Error(`Profit ${finished.costing.profitPence} !== ${expectedProfit}`);
  if (finished.stage.slug !== "complete") throw new Error("Contract did not complete");
  const note = finished.activities.find((item: { body: string }) => item.body.includes("API walkthrough"));
  if (!note?.apiKey) throw new Error("Activity was not attributed to the API key");
  console.log(JSON.stringify({
    contract: finished.number,
    salesNetPence: finished.costing.salesNetPence,
    depositNet,
    materialNetPence: finished.costing.materialNetPence,
    labourNetPence: finished.costing.labourNetPence,
    profitPence: finished.costing.profitPence,
    margin: finished.costing.margin,
    stage: finished.stage.slug,
    apiKey: note.apiKey.name,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
