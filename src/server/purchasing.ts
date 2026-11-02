import { allow, type Actor } from "@/domain/permissions";
import { ServiceError } from "@/domain/errors";
import { vatFromNet } from "@/domain/money";
import { classifySupplierInvoice } from "@/domain/invoice-review";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "./activity";
import { emitEvent } from "./webhooks";
import { getSettings } from "./settings";
import { takeNext } from "./numbers";
import { moveStage } from "./pipeline";
import { normalisePoLines, type PoLineInput } from "./po-lines";

export async function createSupplier(
  actor: Actor,
  input: { name: string; email?: string; phone?: string; accountRef?: string; notes?: string },
) {
  allow(actor, "finance");
  if (!input.name.trim()) throw new ServiceError(400, "Supplier name is required");
  return prisma.supplier.create({
    data: {
      name: input.name.trim(),
      email: input.email?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      accountRef: input.accountRef?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
    },
  });
}

export async function updateSupplier(
  actor: Actor,
  id: string,
  input: Partial<{ name: string; email: string; phone: string; accountRef: string; notes: string }>,
) {
  allow(actor, "finance");
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Supplier not found");
  return prisma.supplier.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      email: input.email !== undefined ? input.email.trim() : undefined,
      phone: input.phone !== undefined ? input.phone.trim() : undefined,
      accountRef: input.accountRef !== undefined ? input.accountRef.trim() : undefined,
      notes: input.notes !== undefined ? input.notes.trim() : undefined,
    },
  });
}

export async function createPurchaseOrder(
  actor: Actor,
  input: {
    contractId: string;
    supplierId: string;
    supplierReference?: string;
    remake?: boolean;
    remakeReason?: string;
    notes?: string;
    lines: PoLineInput[];
  },
) {
  allow(actor, "finance");
  const contract = await prisma.contract.findUnique({ where: { id: input.contractId } });
  if (!contract) throw new ServiceError(404, "Contract not found");
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new ServiceError(404, "Supplier not found");
  if (input.remake && !input.remakeReason?.trim()) {
    throw new ServiceError(400, "A remake or recharge needs a reason");
  }
  const lines = normalisePoLines(input.lines);
  const netPence = lines.reduce((sum, line) => sum + line.netPence, 0);
  const po = await prisma.$transaction(async (tx) => {
    const n = await takeNext(tx, "po");
    return tx.purchaseOrder.create({
      data: {
        number: `PO-${n}`,
        contractId: contract.id,
        supplierId: supplier.id,
        supplierReference: input.supplierReference?.trim() ?? "",
        remake: Boolean(input.remake),
        remakeReason: input.remake ? input.remakeReason!.trim() : "",
        notes: input.notes?.trim() ?? "",
        netPence,
        lines: { create: lines },
      },
      include: { lines: true, supplier: true, contract: true },
    });
  });
  await recordActivity({
    actor,
    contractId: contract.id,
    entityType: "purchase_order",
    entityId: po.id,
    kind: "po",
    body: `raised ${po.number} to ${supplier.name}${po.remake ? " (remake/recharge)" : ""}`,
  });
  await emitEvent("purchase_order.created", {
    purchaseOrderId: po.id,
    number: po.number,
    contractId: contract.id,
    contractNumber: contract.number,
    supplier: supplier.name,
    netPence: po.netPence,
    remake: po.remake,
  });
  return po;
}

export async function updatePurchaseOrder(
  actor: Actor,
  id: string,
  input: Partial<{
    supplierReference: string;
    remake: boolean;
    remakeReason: string;
    notes: string;
    lines: PoLineInput[];
  }>,
) {
  allow(actor, "finance");
  const existing = await prisma.purchaseOrder.findUnique({ where: { id }, include: { supplier: true } });
  if (!existing) throw new ServiceError(404, "Purchase order not found");
  if (existing.status === "DELIVERED" && input.lines) {
    throw new ServiceError(400, "A delivered purchase order cannot be edited");
  }
  const remake = input.remake ?? existing.remake;
  const remakeReason = input.remakeReason !== undefined ? input.remakeReason.trim() : existing.remakeReason;
  if (remake && !remakeReason) throw new ServiceError(400, "A remake or recharge needs a reason");
  const lines = input.lines ? normalisePoLines(input.lines) : null;
  const po = await prisma.$transaction(async (tx) => {
    if (lines) await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierReference: input.supplierReference !== undefined ? input.supplierReference.trim() : undefined,
        remake,
        remakeReason: remake ? remakeReason : "",
        notes: input.notes !== undefined ? input.notes.trim() : undefined,
        netPence: lines ? lines.reduce((sum, line) => sum + line.netPence, 0) : undefined,
        lines: lines ? { create: lines } : undefined,
      },
      include: { lines: true, supplier: true, contract: true, invoices: true },
    });
  });
  return po;
}

async function maybeAdvanceAfterPo(actor: Actor, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { stage: true, purchaseOrders: true },
  });
  if (!contract || contract.purchaseOrders.length === 0) return;
  const statuses = contract.purchaseOrders.map((po) => po.status);
  try {
    if (contract.stage.slug === "ready-to-order" && statuses.some((status) => status === "SENT" || status === "DELIVERED")) {
      await moveStage(actor, contractId, "ordered");
      return;
    }
    if (contract.stage.slug === "ordered" && statuses.every((status) => status === "DELIVERED")) {
      await moveStage(actor, contractId, "delivered");
    }
  } catch (error) {
    if (error instanceof ServiceError && error.status === 400) return;
    throw error;
  }
}

export async function setPurchaseOrderStatus(actor: Actor, id: string, status: "DRAFT" | "SENT" | "DELIVERED") {
  allow(actor, "finance");
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { supplier: true, contract: true },
  });
  if (!existing) throw new ServiceError(404, "Purchase order not found");
  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status,
      orderedAt: status === "SENT" || status === "DELIVERED" ? existing.orderedAt ?? new Date() : existing.orderedAt,
      deliveredAt: status === "DELIVERED" ? existing.deliveredAt ?? new Date() : status === "DRAFT" ? null : existing.deliveredAt,
    },
  });
  const verb = status === "SENT" ? "sent" : status === "DELIVERED" ? "marked delivered" : "returned to draft";
  await recordActivity({
    actor,
    contractId: existing.contractId,
    entityType: "purchase_order",
    entityId: po.id,
    kind: "po",
    body: `${verb} ${existing.number} (${existing.supplier.name})`,
  });
  if (status === "SENT") {
    await emitEvent("purchase_order.sent", {
      purchaseOrderId: po.id,
      number: po.number,
      contractNumber: existing.contract.number,
      supplier: existing.supplier.name,
      supplierReference: po.supplierReference,
    });
  }
  if (status === "DELIVERED") {
    await emitEvent("purchase_order.delivered", {
      purchaseOrderId: po.id,
      number: po.number,
      contractNumber: existing.contract.number,
    });
  }
  await maybeAdvanceAfterPo(actor, existing.contractId);
  return po;
}

export async function recordSupplierInvoice(
  actor: Actor,
  purchaseOrderId: string,
  input: { invoiceNumber: string; invoiceDate: Date; netPence: number; nominalCode?: string },
) {
  allow(actor, "finance");
  if (!input.invoiceNumber.trim()) throw new ServiceError(400, "Supplier invoice number is required");
  if (!Number.isInteger(input.netPence) || input.netPence < 0) {
    throw new ServiceError(400, "Invoice net must be zero or more");
  }
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { supplier: true, contract: true },
  });
  if (!po) throw new ServiceError(404, "Purchase order not found");
  const duplicate = await prisma.supplierInvoice.findFirst({
    where: { invoiceNumber: input.invoiceNumber.trim(), purchaseOrder: { supplierId: po.supplierId } },
  });
  if (duplicate) throw new ServiceError(400, "That supplier invoice number is already recorded");
  const settings = await getSettings();
  const decision = classifySupplierInvoice(po.netPence, input.netPence, settings.invoiceTolerancePence);
  const tax = vatFromNet(input.netPence, settings.vatRateBps);
  const invoice = await prisma.supplierInvoice.create({
    data: {
      purchaseOrderId: po.id,
      invoiceNumber: input.invoiceNumber.trim(),
      invoiceDate: input.invoiceDate,
      netPence: input.netPence,
      vatPence: tax.vatPence,
      grossPence: tax.grossPence,
      nominalCode: input.nominalCode?.trim() || "5000",
      status: decision.status,
      variancePence: decision.variancePence,
    },
  });
  await recordActivity({
    actor,
    contractId: po.contractId,
    entityType: "supplier_invoice",
    entityId: invoice.id,
    kind: "invoice",
    body: decision.needsReview
      ? `recorded supplier invoice ${invoice.invoiceNumber} for review (variance ${decision.variancePence}p against ${po.number})`
      : `recorded supplier invoice ${invoice.invoiceNumber} against ${po.number}`,
  });
  const payload = {
    supplierInvoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    purchaseOrderId: po.id,
    purchaseOrderNumber: po.number,
    contractId: po.contractId,
    contractNumber: po.contract.number,
    supplier: po.supplier.name,
    netPence: invoice.netPence,
    vatPence: invoice.vatPence,
    grossPence: invoice.grossPence,
    nominalCode: invoice.nominalCode,
    variancePence: invoice.variancePence,
    status: invoice.status,
    poNetPence: po.netPence,
  };
  if (decision.needsReview) await emitEvent("supplier_invoice.needs_review", payload);
  else await emitEvent("supplier_invoice.recorded", payload);
  return invoice;
}

export async function reviewSupplierInvoice(actor: Actor, invoiceId: string, decision: "APPROVE" | "REJECT", note?: string) {
  allow(actor, "finance");
  const invoice = await prisma.supplierInvoice.findUnique({
    where: { id: invoiceId },
    include: { purchaseOrder: { include: { contract: true, supplier: true } } },
  });
  if (!invoice) throw new ServiceError(404, "Supplier invoice not found");
  if (invoice.status !== "PENDING_REVIEW") throw new ServiceError(400, "This invoice is not waiting for review");
  const status = decision === "APPROVE" ? "ACCEPTED" : "REJECTED";
  const updated = await prisma.supplierInvoice.update({
    where: { id: invoiceId },
    data: { status, reviewNote: note?.trim() ?? "", reviewedAt: new Date() },
  });
  await recordActivity({
    actor,
    contractId: invoice.purchaseOrder.contractId,
    entityType: "supplier_invoice",
    entityId: invoice.id,
    kind: "invoice",
    body:
      decision === "APPROVE"
        ? `approved supplier invoice ${invoice.invoiceNumber}`
        : `rejected supplier invoice ${invoice.invoiceNumber}`,
  });
  const payload = {
    supplierInvoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    purchaseOrderNumber: invoice.purchaseOrder.number,
    contractNumber: invoice.purchaseOrder.contract.number,
    netPence: invoice.netPence,
    variancePence: invoice.variancePence,
  };
  await emitEvent(decision === "APPROVE" ? "supplier_invoice.approved" : "supplier_invoice.rejected", payload);
  return updated;
}
