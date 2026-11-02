import { lineNet } from "@/domain/money";
import { ServiceError } from "@/domain/errors";

export type PoLineInput = {
  description: string;
  quantity: number;
  unitPricePence: number;
};

export function normalisePoLines(lines: PoLineInput[]) {
  if (!Array.isArray(lines) || lines.length === 0) throw new ServiceError(400, "Add at least one purchase order line");
  return lines.map((line, index) => {
    const description = (line.description ?? "").trim();
    if (!description) throw new ServiceError(400, "Each purchase order line needs a description");
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw new ServiceError(400, "Quantity must be a whole number of at least 1");
    const unitPricePence = Math.round(Number(line.unitPricePence));
    if (!Number.isFinite(unitPricePence) || unitPricePence < 0) throw new ServiceError(400, "Unit price cannot be negative");
    return {
      description,
      quantity,
      unitPricePence,
      netPence: lineNet(quantity, unitPricePence),
      sortOrder: index,
    };
  });
}
