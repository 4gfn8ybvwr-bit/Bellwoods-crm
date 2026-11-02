export const PRODUCT_TYPES = [
  ["WINDOW", "Window"],
  ["DOOR", "Door"],
  ["BIFOLD", "Bi-fold"],
  ["PATIO", "Patio door"],
  ["ROOFLINE", "Roofline"],
  ["SEALED_UNIT", "Sealed unit"],
  ["OTHER", "Other"],
] as const;

export const ENQUIRY_SOURCES = [
  "Website",
  "Phone",
  "Recommendation",
  "Showroom",
  "Trade account",
  "Checkatrade",
  "Facebook",
] as const;

export const CONTRACT_TYPES = [
  ["BW", "Bellwoods retail (BW)"],
  ["TC", "NETC trade (TC)"],
  ["CM", "Commercial repair (CM)"],
] as const;

export const ROLES = [
  ["ADMIN", "Admin"],
  ["SALES", "Sales"],
  ["OFFICE", "Office"],
  ["FITTER", "Fitter"],
] as const;

export function labelOf(pairs: readonly (readonly [string, string])[], value: string) {
  return pairs.find((pair) => pair[0] === value)?.[1] ?? value;
}

export function productLabel(value: string) {
  return labelOf(PRODUCT_TYPES, value);
}

export function roleLabel(value: string) {
  return labelOf(ROLES, value);
}

export function contractTypeLabel(value: string) {
  if (value === "BW") return "BW";
  if (value === "TC") return "TC";
  if (value === "CM") return "CM";
  return value;
}

export const STAGE_SLUGS = [
  "enquiry",
  "survey-booked",
  "quoted",
  "sold",
  "deposit-stage",
  "ready-to-order",
  "ordered",
  "delivered",
  "fit-booked",
  "fitted",
  "invoiced",
  "complete",
] as const;

export const READY_TO_ORDER_SLUG = "ready-to-order";
export const COMPLETE_SLUG = "complete";
