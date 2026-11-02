export type InvoiceForCost = {
  status: string;
  netPence: number;
};

export type PoForCost = {
  id: string;
  number: string;
  netPence: number;
  invoices: InvoiceForCost[];
};

export type PoCostLine = {
  id: string;
  number: string;
  costPence: number;
  source: "invoice" | "po";
  unmatched: boolean;
  pendingReview: boolean;
};

export type JobCost = {
  salesNetPence: number;
  materialNetPence: number;
  labourNetPence: number;
  profitPence: number;
  margin: number | null;
  purchaseOrders: PoCostLine[];
  hasUnmatchedPurchaseOrder: boolean;
  hasPendingReview: boolean;
};

/**
 * Material cost uses accepted supplier invoices when they exist.
 * Otherwise the PO net is used and the PO is flagged, so a missing invoice
 * cannot quietly disappear from the job cost.
 * Invoices waiting in review are not treated as matched.
 */
export function materialCostForPo(po: PoForCost): PoCostLine {
  const accepted = po.invoices.filter((invoice) => invoice.status === "ACCEPTED");
  const pendingReview = po.invoices.some((invoice) => invoice.status === "PENDING_REVIEW");
  if (accepted.length > 0) {
    return {
      id: po.id,
      number: po.number,
      costPence: accepted.reduce((sum, invoice) => sum + invoice.netPence, 0),
      source: "invoice",
      unmatched: false,
      pendingReview,
    };
  }
  return {
    id: po.id,
    number: po.number,
    costPence: po.netPence,
    source: "po",
    unmatched: true,
    pendingReview,
  };
}

export function jobCost(input: {
  customerInvoiceNetPence: number;
  purchaseOrders: PoForCost[];
  labourCostPence: number;
}): JobCost {
  const purchaseOrders = input.purchaseOrders.map(materialCostForPo);
  const materialNetPence = purchaseOrders.reduce((sum, line) => sum + line.costPence, 0);
  const salesNetPence = input.customerInvoiceNetPence;
  const labourNetPence = input.labourCostPence;
  const profitPence = salesNetPence - materialNetPence - labourNetPence;
  return {
    salesNetPence,
    materialNetPence,
    labourNetPence,
    profitPence,
    margin: salesNetPence === 0 ? null : profitPence / salesNetPence,
    purchaseOrders,
    hasUnmatchedPurchaseOrder: purchaseOrders.some((line) => line.unmatched),
    hasPendingReview: purchaseOrders.some((line) => line.pendingReview),
  };
}

export function recognisedSalesNet(invoices: { status: string; netPence: number }[]) {
  return invoices
    .filter((invoice) => invoice.status !== "VOID")
    .reduce((sum, invoice) => sum + invoice.netPence, 0);
}
