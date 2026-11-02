export type InvoiceDecision = {
  status: "ACCEPTED" | "PENDING_REVIEW";
  variancePence: number;
  needsReview: boolean;
};

/**
 * Compare a supplier invoice with its purchase order.
 * A difference beyond the tolerance, including any charge against a £0 remake
 * PO, is held for Invoice Review instead of being accepted.
 * A variance equal to the tolerance is accepted.
 */
export function classifySupplierInvoice(
  poNetPence: number,
  invoiceNetPence: number,
  tolerancePence: number,
): InvoiceDecision {
  const variancePence = invoiceNetPence - poNetPence;
  const needsReview = Math.abs(variancePence) > tolerancePence;
  return {
    status: needsReview ? "PENDING_REVIEW" : "ACCEPTED",
    variancePence,
    needsReview,
  };
}
