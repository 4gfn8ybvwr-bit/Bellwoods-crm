import { ServiceError } from "./errors";

export function formatGbp(pence: number) {
  const value = (pence / 100).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
  });
  return value;
}

export function formatMargin(ratio: number | null) {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

/** Parse a pounds amount such as "1,250.50" or "£1250" into pence. */
export function poundsToPence(value: string | number) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ServiceError(400, "Enter a valid amount");
    return Math.round(value * 100);
  }
  const cleaned = value.replace(/[£,\s]/g, "");
  if (!cleaned) throw new ServiceError(400, "Enter an amount in pounds, for example 1250.00");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new ServiceError(400, "Enter an amount in pounds with up to 2 decimal places");
  }
  const negative = cleaned.startsWith("-");
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  const pence = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -pence : pence;
}

export function vatFromNet(netPence: number, rateBps = 2000) {
  const vatPence = Math.round((netPence * rateBps) / 10000);
  return { vatPence, grossPence: netPence + vatPence };
}

export function lineNet(quantity: number, unitPricePence: number) {
  return Math.round(quantity * unitPricePence);
}
