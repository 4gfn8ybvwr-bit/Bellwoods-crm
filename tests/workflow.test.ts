import { beforeAll, describe, expect, it } from "vitest";
import { ServiceError } from "@/domain/errors";
import { prisma } from "@/lib/prisma";
import { getContractView } from "@/server/queries";
import { addLabourEntry } from "@/server/labour";
import { raiseFinalInvoice, setCustomerInvoiceStatus } from "@/server/finance";
import { acceptQuote, moveStage, updateContract } from "@/server/pipeline";
import { createPurchaseOrder, recordSupplierInvoice, reviewSupplierInvoice } from "@/server/purchasing";
import { createQuote } from "@/server/sales";
import { seedReference } from "./fixture";

describe("enquiry to completed contract", () => {
  let fx: Awaited<ReturnType<typeof seedReference>>;

  beforeAll(async () => {
    fx = await seedReference();
  });

  it("blocks Ready to order, then costs the worked example", async () => {
    const quote = await createQuote(fx.actor, {
      customerId: fx.customer.id,
      lines: [{ productType: "WINDOW", description: "House package", quantity: 1, unitPricePence: 500000, specification: "White uPVC" }],
    });
    const accepted = await acceptQuote(fx.actor, quote.id, { type: "BW", depositPercent: 25 });
    const contractId = accepted.contract.id;

    await expect(moveStage(fx.actor, contractId, "ready-to-order")).rejects.toBeInstanceOf(ServiceError);
    await updateContract(fx.actor, contractId, { surveyUploaded: true });
    await expect(moveStage(fx.actor, contractId, "ready-to-order")).rejects.toMatchObject({ status: 400 });

    const deposit = await prisma.customerInvoice.findFirstOrThrow({ where: { contractId, type: "DEPOSIT" } });
    expect(deposit.netPence).toBe(125000);
    await setCustomerInvoiceStatus(fx.actor, deposit.id, "PAID");
    await moveStage(fx.actor, contractId, "ready-to-order");

    const frames = await createPurchaseOrder(fx.actor, {
      contractId,
      supplierId: fx.supplier.id,
      lines: [{ description: "Frames", quantity: 1, unitPricePence: 215000 }],
    });
    const glassSupplier = await prisma.supplier.create({ data: { name: "Test Glass" } });
    const glass = await createPurchaseOrder(fx.actor, {
      contractId,
      supplierId: glassSupplier.id,
      lines: [{ description: "Units", quantity: 1, unitPricePence: 48000 }],
    });
    const framesInvoice = await recordSupplierInvoice(fx.actor, frames.id, { invoiceNumber: "F-1", invoiceDate: new Date(), netPence: 215000 });
    const glassInvoice = await recordSupplierInvoice(fx.actor, glass.id, { invoiceNumber: "G-1", invoiceDate: new Date(), netPence: 48000 });
    expect(framesInvoice.status).toBe("ACCEPTED");
    expect(glassInvoice.status).toBe("ACCEPTED");

    const remake = await createPurchaseOrder(fx.actor, {
      contractId,
      supplierId: fx.supplier.id,
      remake: true,
      remakeReason: "Scratched sash",
      lines: [{ description: "Remake", quantity: 1, unitPricePence: 0 }],
    });
    const held = await recordSupplierInvoice(fx.actor, remake.id, { invoiceNumber: "R-1", invoiceDate: new Date(), netPence: 4800 });
    expect(held.status).toBe("PENDING_REVIEW");
    await reviewSupplierInvoice(fx.actor, held.id, "REJECT", "Not our recharge");

    await addLabourEntry(fx.actor, { contractId, personId: fx.day.id, workDate: new Date(), days: 2, hours: 0 });
    await addLabourEntry(fx.actor, { contractId, personId: fx.hour.id, workDate: new Date(), days: 0, hours: 6 });
    await addLabourEntry(fx.actor, { contractId, personId: fx.plasterer.id, workDate: new Date(), days: 1, hours: 0 });

    const finalInvoice = await raiseFinalInvoice(fx.actor, contractId);
    expect(finalInvoice.netPence).toBe(375000);
    await moveStage(fx.actor, contractId, "complete");

    const view = await getContractView(contractId);
    expect(view.costing.salesNetPence).toBe(500000);
    expect(view.costing.materialNetPence).toBe(263000);
    expect(view.costing.labourNetPence).toBe(76100);
    expect(view.costing.profitPence).toBe(160900);
    expect(view.costing.margin).toBeCloseTo(0.3218);
    expect(view.stage.slug).toBe("complete");
  });

  it("accepts a variance inside tolerance and reviews one penny over", async () => {
    const quote = await createQuote(fx.actor, {
      customerId: fx.customer.id,
      lines: [{ productType: "DOOR", description: "Door", quantity: 1, unitPricePence: 100000 }],
    });
    const accepted = await acceptQuote(fx.actor, quote.id, { type: "TC", skipDeposit: true });
    const within = await createPurchaseOrder(fx.actor, {
      contractId: accepted.contract.id,
      supplierId: fx.supplier.id,
      lines: [{ description: "Within", quantity: 1, unitPricePence: 100000 }],
    });
    const over = await createPurchaseOrder(fx.actor, {
      contractId: accepted.contract.id,
      supplierId: fx.supplier.id,
      lines: [{ description: "Over", quantity: 1, unitPricePence: 100000 }],
    });
    const ok = await recordSupplierInvoice(fx.actor, within.id, { invoiceNumber: "T-1", invoiceDate: new Date(), netPence: 100100 });
    const review = await recordSupplierInvoice(fx.actor, over.id, { invoiceNumber: "T-2", invoiceDate: new Date(), netPence: 100101 });
    expect(ok.status).toBe("ACCEPTED");
    expect(review.status).toBe("PENDING_REVIEW");
  });
});
