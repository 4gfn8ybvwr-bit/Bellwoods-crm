import { describe, expect, it } from "vitest";
import { classifySupplierInvoice } from "@/domain/invoice-review";
import { jobCost, recognisedSalesNet } from "@/domain/job-costing";
import { readyToOrderGate, stageRequiresReadyGate } from "@/domain/ready-to-order";
import { vatFromNet, poundsToPence } from "@/domain/money";
import { labourCostPence } from "@/domain/labour";
import { financialYearContaining } from "@/domain/financial-year";
import { londonToUtc } from "@/domain/dates";

describe("ready to order", () => {
  it("requires a paid or skipped deposit and an uploaded survey", () => {
    expect(readyToOrderGate({ depositSkipped: false, depositPaid: false, surveyUploaded: true }).ok).toBe(false);
    expect(readyToOrderGate({ depositSkipped: false, depositPaid: true, surveyUploaded: false }).ok).toBe(false);
    expect(readyToOrderGate({ depositSkipped: true, depositPaid: false, surveyUploaded: true }).ok).toBe(true);
    expect(readyToOrderGate({ depositSkipped: false, depositPaid: true, surveyUploaded: true }).ok).toBe(true);
  });

  it("applies the gate from Ready to order onwards", () => {
    expect(stageRequiresReadyGate(5, 6)).toBe(false);
    expect(stageRequiresReadyGate(6, 6)).toBe(true);
    expect(stageRequiresReadyGate(12, 6)).toBe(true);
  });
});

describe("supplier invoice tolerance", () => {
  const tolerance = 100;

  it("accepts an exact match and a variance equal to the tolerance", () => {
    expect(classifySupplierInvoice(100000, 100000, tolerance).status).toBe("ACCEPTED");
    expect(classifySupplierInvoice(100000, 100100, tolerance).status).toBe("ACCEPTED");
    expect(classifySupplierInvoice(100000, 99900, tolerance).status).toBe("ACCEPTED");
  });

  it("holds a larger difference, including a charge on a £0 purchase order", () => {
    const over = classifySupplierInvoice(100000, 100101, tolerance);
    expect(over.status).toBe("PENDING_REVIEW");
    expect(over.variancePence).toBe(101);
    const remake = classifySupplierInvoice(0, 4800, tolerance);
    expect(remake.status).toBe("PENDING_REVIEW");
    expect(classifySupplierInvoice(0, 0, tolerance).status).toBe("ACCEPTED");
  });
});

describe("job cost and margin", () => {
  it("uses accepted invoices, flags an unmatched PO, and ignores a pending review", () => {
    const cost = jobCost({
      customerInvoiceNetPence: recognisedSalesNet([
        { status: "PAID", netPence: 125000 },
        { status: "PAID", netPence: 375000 },
        { status: "VOID", netPence: 999 },
      ]),
      labourCostPence: 76100,
      purchaseOrders: [
        { id: "1", number: "PO-1", netPence: 215000, invoices: [{ status: "ACCEPTED", netPence: 215000 }] },
        { id: "2", number: "PO-2", netPence: 48000, invoices: [{ status: "ACCEPTED", netPence: 48000 }] },
        { id: "3", number: "PO-3", netPence: 10000, invoices: [{ status: "PENDING_REVIEW", netPence: 18000 }] },
      ],
    });
    expect(cost.salesNetPence).toBe(500000);
    expect(cost.materialNetPence).toBe(215000 + 48000 + 10000);
    expect(cost.purchaseOrders[2].unmatched).toBe(true);
    expect(cost.purchaseOrders[2].pendingReview).toBe(true);
    expect(cost.profitPence).toBe(500000 - 273000 - 76100);
    expect(cost.margin).toBeCloseTo(cost.profitPence / 500000);
  });

  it("matches the worked BW23290 example: £1,609.00 profit", () => {
    const cost = jobCost({
      customerInvoiceNetPence: 125000 + 375000,
      labourCostPence: 40000 + 11100 + 25000,
      purchaseOrders: [
        { id: "a", number: "PO-5001", netPence: 215000, invoices: [{ status: "ACCEPTED", netPence: 215000 }] },
        { id: "b", number: "PO-5002", netPence: 48000, invoices: [{ status: "ACCEPTED", netPence: 48000 }] },
      ],
    });
    expect(cost.profitPence).toBe(160900);
    expect(cost.margin).toBeCloseTo(0.3218);
    expect(cost.hasUnmatchedPurchaseOrder).toBe(false);
  });

  it("returns no margin when nothing has been invoiced to the customer", () => {
    const cost = jobCost({ customerInvoiceNetPence: 0, labourCostPence: 20000, purchaseOrders: [] });
    expect(cost.margin).toBeNull();
    expect(cost.profitPence).toBe(-20000);
  });
});

describe("money, labour and the financial year", () => {
  it("calculates UK VAT at 20% and labour from day, hour and week rates", () => {
    expect(vatFromNet(125000).vatPence).toBe(25000);
    expect(poundsToPence("£1,250.50")).toBe(125050);
    expect(labourCostPence({ rateType: "DAY", ratePence: 20000 }, { days: 2, hours: 0 })).toBe(40000);
    expect(labourCostPence({ rateType: "HOUR", ratePence: 1850 }, { days: 0, hours: 6 })).toBe(11100);
    expect(labourCostPence({ rateType: "WEEK", ratePence: 52000 }, { days: 5, hours: 0 })).toBe(52000);
    expect(labourCostPence({ rateType: "WEEK", ratePence: 52000 }, { days: 1, hours: 0 })).toBe(10400);
  });

  it("starts the financial year on 1 November", () => {
    const during = financialYearContaining(londonToUtc(2026, 11, 2, 9, 0));
    expect(during.from.toISOString()).toBe(londonToUtc(2026, 11, 1, 0, 0).toISOString());
    const before = financialYearContaining(londonToUtc(2026, 10, 31, 12, 0));
    expect(before.from.toISOString()).toBe(londonToUtc(2025, 11, 1, 0, 0).toISOString());
  });
});
