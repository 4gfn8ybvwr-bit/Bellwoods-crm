import { ServiceError } from "@/domain/errors";
import { poundsToPence } from "@/domain/money";
import { parseDateInput, parseDateTimeInput } from "@/domain/dates";
import type { SpecLineInput } from "./lines";
import type { PoLineInput } from "./po-lines";

export function str(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function required(value: unknown, name: string) {
  const text = str(value).trim();
  if (!text) throw new ServiceError(400, `${name} is required`);
  return text;
}

export function intField(value: unknown, name: string) {
  const n = typeof value === "number" ? value : Number(str(value));
  if (!Number.isInteger(n)) throw new ServiceError(400, `${name} must be a whole number`);
  return n;
}

export function moneyField(value: unknown, name: string) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ServiceError(400, `${name} is not a valid amount`);
    if (Number.isInteger(value)) return value;
    return Math.round(value * 100);
  }
  if (typeof value === "string" && value.trim()) return poundsToPence(value);
  throw new ServiceError(400, `${name} is required`);
}

export function optionalMoney(value: unknown, name: string) {
  if (value == null || value === "") return undefined;
  return moneyField(value, name);
}

export function dateField(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new ServiceError(400, `${name} is required`);
  try {
    return parseDateInput(value);
  } catch (error) {
    throw new ServiceError(400, error instanceof Error ? error.message : `${name} is not a valid date`);
  }
}

export function dateTimeField(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new ServiceError(400, `${name} is required`);
  try {
    return parseDateTimeInput(value);
  } catch (error) {
    throw new ServiceError(400, error instanceof Error ? error.message : `${name} is not a valid date`);
  }
}

export function optionalDate(value: unknown, name: string) {
  if (value == null || value === "") return null;
  return dateField(value, name);
}

export function specLines(value: unknown): SpecLineInput[] {
  if (!Array.isArray(value) || value.length === 0) throw new ServiceError(400, "Add at least one line");
  return value.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      productType: str(row.productType, "WINDOW"),
      description: str(row.description),
      widthMm: row.widthMm == null || row.widthMm === "" ? null : Number(row.widthMm),
      heightMm: row.heightMm == null || row.heightMm === "" ? null : Number(row.heightMm),
      specification: str(row.specification),
      quantity: Number(row.quantity ?? 1),
      unitPricePence: moneyField(row.unitPricePence ?? row.unitPrice, "unit price"),
    };
  });
}

export function poLines(value: unknown): PoLineInput[] {
  if (!Array.isArray(value) || value.length === 0) throw new ServiceError(400, "Add at least one line");
  return value.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      description: str(row.description),
      quantity: Number(row.quantity ?? 1),
      unitPricePence: moneyField(row.unitPricePence ?? row.unitPrice, "unit price"),
    };
  });
}

export function limitOf(query: URLSearchParams) {
  const n = Number(query.get("limit") ?? 100);
  if (!Number.isFinite(n) || n < 1) return 100;
  return Math.min(200, Math.floor(n));
}

export function offsetOf(query: URLSearchParams) {
  const n = Number(query.get("offset") ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
