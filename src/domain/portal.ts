import { ServiceError } from "./errors";

/**
 * Firm requirement from Seb, for trade customers only.
 * Bellwoods retail customers must never be given a portal login or portal data.
 * Due dates will later be filled from Camden Direct. That source is reserved
 * and is not written by this version.
 */
export const CAMDEN_DIRECT_SOURCE = "CAMDEN_DIRECT";
export const PAYMENT_DUE_SOURCES = ["UNSET", "MANUAL"] as const;

export function assertTradePortalCustomer(customer: { type: string }) {
  if (customer.type !== "TRADE") {
    throw new ServiceError(403, "Portal access is only for trade customers");
  }
}

export function paymentDueSourceFor(date: Date | null) {
  return date ? "MANUAL" : "UNSET";
}

export function assertWritableDueSource(source: string) {
  if (source === CAMDEN_DIRECT_SOURCE) {
    throw new ServiceError(400, "Due dates are not read from Camden Direct yet");
  }
  if (!PAYMENT_DUE_SOURCES.includes(source as (typeof PAYMENT_DUE_SOURCES)[number]) && source !== "") {
    throw new ServiceError(400, "Unknown due date source");
  }
}
