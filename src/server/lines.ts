import { lineNet } from "@/domain/money";
import { ServiceError } from "@/domain/errors";
import { PRODUCT_TYPES } from "@/domain/labels";

export type SpecLineInput = {
  productType: string;
  description: string;
  widthMm?: number | null;
  heightMm?: number | null;
  specification?: string;
  quantity: number;
  unitPricePence: number;
};

const PRODUCT_SET = new Set<string>(PRODUCT_TYPES.map(([value]) => value));

export function normaliseLines(lines: SpecLineInput[]) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ServiceError(400, "Add at least one line");
  }
  return lines.map((line, index) => {
    const productType = line.productType || "OTHER";
    if (!PRODUCT_SET.has(productType)) throw new ServiceError(400, "Unknown product type");
    const description = (line.description ?? "").trim();
    if (!description) throw new ServiceError(400, "Each line needs a description");
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ServiceError(400, "Quantity must be a whole number of at least 1");
    }
    const unitPricePence = Math.round(Number(line.unitPricePence));
    if (!Number.isFinite(unitPricePence) || unitPricePence < 0) {
      throw new ServiceError(400, "Unit price cannot be negative");
    }
    const widthMm = line.widthMm == null || line.widthMm === ("" as unknown) ? null : Number(line.widthMm);
    const heightMm = line.heightMm == null || line.heightMm === ("" as unknown) ? null : Number(line.heightMm);
    if (widthMm != null && (!Number.isInteger(widthMm) || widthMm <= 0)) {
      throw new ServiceError(400, "Width must be a positive number of millimetres");
    }
    if (heightMm != null && (!Number.isInteger(heightMm) || heightMm <= 0)) {
      throw new ServiceError(400, "Height must be a positive number of millimetres");
    }
    return {
      productType,
      description,
      widthMm,
      heightMm,
      specification: line.specification?.trim() ?? "",
      quantity,
      unitPricePence,
      netPence: lineNet(quantity, unitPricePence),
      sortOrder: index,
    };
  });
}

export function sumNet(lines: { netPence: number }[]) {
  return lines.reduce((sum, line) => sum + line.netPence, 0);
}
