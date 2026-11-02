import { Prisma } from "@prisma/client";
import { allow, type Actor } from "@/domain/permissions";
import { ServiceError } from "@/domain/errors";
import { invoiceCompanyStamp } from "@/domain/company";
import { vatFromNet } from "@/domain/money";
import { recognisedSalesNet } from "@/domain/job-costing";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "./activity";
import { emitEvent } from "./webhooks";
import { getSettings } from "./settings";
import { takeNext } from "./numbers";

export async function insertCustomerInvoice(
  tx: Prisma.TransactionClient,
  input: {
    contractId: string;
    type: string;
    invoiceDate: Date;
    netPence: number;
    vatRateBps: number;
    status?: string;
    paidAt?: Date | null;
  },
) {
  if (!Number.isInteger(input.netPence) || input.netPence < 0) {
    throw new ServiceError(400, "Invoice net must be zero or more");
  }
  const n = await takeNext(tx, "invoice");
  const tax = vatFromNet(input.netPence, input.vatRateBps);
  return tx.customerInvoice.create({
    data: {
      number: `INV-${n}`,
      contractId: input.contractId,
      type: input.type,
      invoiceDate: input.invoiceDate,
      netPence: input.netPence,
      vatPence: tax.vatPence,
      grossPence: tax.grossPence,
      status: input.status ?? "UNPAID",
      paidAt: input.paidAt ?? null,
      ...invoiceCompanyStamp(),
      xeroInvoiceId: null,
      xeroStatus: "NOT_SYNCED",
    },
  });
}

export async function raiseDepositInvoice(
  actor: Actor,
  contractId: string,
  input: { percent?: number; invoiceDate?: Date } = {},
) {
  allow(actor, "write");
  const settings = await getSettings();
  const percent = input.percent ?? settings.defaultDepositPercent;
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new ServiceError(400, "Deposit percent must be a whole number from 1 to 100");
  }
  const result = await prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: { customerInvoices: true, customer: true },
    });
    if (!contract) throw new ServiceError(404, "Contract not found");
    const existing = contract.customerInvoices.find((invoice) => invoice.type === "DEPOSIT" && invoice.status !== "VOID");
    if (existing) throw new ServiceError(400, "This contract already has a deposit invoice");
    if (contract.salesValuePence <= 0) throw new ServiceError(400, "Set a sales value before raising a deposit");
    const netPence = Math.round((contract.salesValuePence * percent) / 100);
    if (netPence <= 0) throw new ServiceError(400, "Deposit amount rounded to nothing");
    const invoice = await insertCustomerInvoice(tx, {
      contractId,
      type: "DEPOSIT",
      invoiceDate: input.invoiceDate ?? new Date(),
      netPence,
      vatRateBps: settings.vatRateBps,
    });
    await tx.contract.update({
      where: { id: contractId },
      data: { depositPercent: percent, depositSkipped: false },
    });
    return { invoice, contract };
  });
  await recordActivity({
    actor,
    contractId,
    entityType: "customer_invoice",
    entityId: result.invoice.id,
    kind: "invoice",
    body: `raised deposit invoice ${result.invoice.number} at ${percent}%`,
  });
  await emitEvent("customer_invoice.created", {
    invoiceId: result.invoice.id,
    number: result.invoice.number,
    type: "DEPOSIT",
    contractId,
    contractNumber: result.contract.number,
    netPence: result.invoice.netPence,
    vatPence: result.invoice.vatPence,
    grossPence: result.invoice.grossPence,
    xeroInvoiceId: null,
  });
  return result.invoice;
}

export async function skipDeposit(actor: Actor, contractId: string) {
  allow(actor, "write");
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { customerInvoices: true },
  });
  if (!contract) throw new ServiceError(404, "Contract not found");
  const live = contract.customerInvoices.find((invoice) => invoice.type === "DEPOSIT" && invoice.status !== "VOID");
  if (live) throw new ServiceError(400, "Void the deposit invoice before skipping the deposit");
  await prisma.contract.update({ where: { id: contractId }, data: { depositSkipped: true, depositPercent: 0 } });
  await recordActivity({
    actor,
    contractId,
    entityType: "contract",
    entityId: contractId,
    kind: "invoice",
    body: "skipped the deposit",
  });
  return { ok: true, depositSkipped: true };
}

export async function voidCustomerInvoice(actor: Actor, invoiceId: string) {
  allow(actor, "finance");
  const invoice = await prisma.customerInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new ServiceError(404, "Invoice not found");
  if (invoice.status === "PAID") throw new ServiceError(400, "A paid invoice cannot be voided");
  const updated = await prisma.customerInvoice.update({
    where: { id: invoiceId },
    data: { status: "VOID" },
  });
  await recordActivity({
    actor,
    contractId: invoice.contractId,
    entityType: "customer_invoice",
    entityId: invoice.id,
    kind: "invoice",
    body: `voided customer invoice ${invoice.number}`,
  });
  return updated;
}

export async function raiseFinalInvoice(
  actor: Actor,
  contractId: string,
  input: { netPence?: number; invoiceDate?: Date } = {},
) {
  allow(actor, "finance");
  const settings = await getSettings();
  const result = await prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: { customerInvoices: true, customer: true },
    });
    if (!contract) throw new ServiceError(404, "Contract not found");
    const existingFinal = contract.customerInvoices.find((invoice) => invoice.type === "FINAL" && invoice.status !== "VOID");
    if (existingFinal) throw new ServiceError(400, "This contract already has a final invoice");
    const balance = contract.salesValuePence - recognisedSalesNet(contract.customerInvoices);
    const netPence = input.netPence ?? balance;
    if (!Number.isInteger(netPence) || netPence < 0) throw new ServiceError(400, "Final invoice net must be zero or more");
    const invoice = await insertCustomerInvoice(tx, {
      contractId,
      type: "FINAL",
      invoiceDate: input.invoiceDate ?? new Date(),
      netPence,
      vatRateBps: settings.vatRateBps,
    });
    return { invoice, contract };
  });
  await recordActivity({
    actor,
    contractId,
    entityType: "customer_invoice",
    entityId: result.invoice.id,
    kind: "invoice",
    body: `raised final invoice ${result.invoice.number}`,
  });
  await emitEvent("customer_invoice.created", {
    invoiceId: result.invoice.id,
    number: result.invoice.number,
    type: "FINAL",
    contractId,
    contractNumber: result.contract.number,
    netPence: result.invoice.netPence,
    vatPence: result.invoice.vatPence,
    grossPence: result.invoice.grossPence,
    xeroInvoiceId: null,
  });
  return result.invoice;
}

export async function createCustomerInvoice(
  actor: Actor,
  input: { contractId: string; type: string; netPence: number; invoiceDate: Date },
) {
  if (input.type === "DEPOSIT") {
    const contract = await prisma.contract.findUnique({ where: { id: input.contractId } });
    if (!contract) throw new ServiceError(404, "Contract not found");
    if (contract.salesValuePence <= 0) throw new ServiceError(400, "Set a sales value first");
    const percent = Math.round((input.netPence / contract.salesValuePence) * 100);
    return raiseDepositInvoice(actor, input.contractId, { percent, invoiceDate: input.invoiceDate });
  }
  if (input.type === "FINAL") {
    return raiseFinalInvoice(actor, input.contractId, { netPence: input.netPence, invoiceDate: input.invoiceDate });
  }
  allow(actor, "finance");
  const settings = await getSettings();
  const contract = await prisma.contract.findUnique({ where: { id: input.contractId } });
  if (!contract) throw new ServiceError(404, "Contract not found");
  const invoice = await prisma.$transaction((tx) =>
    insertCustomerInvoice(tx, {
      contractId: input.contractId,
      type: "OTHER",
      invoiceDate: input.invoiceDate,
      netPence: input.netPence,
      vatRateBps: settings.vatRateBps,
    }),
  );
  await recordActivity({
    actor,
    contractId: input.contractId,
    entityType: "customer_invoice",
    entityId: invoice.id,
    kind: "invoice",
    body: `raised invoice ${invoice.number}`,
  });
  await emitEvent("customer_invoice.created", {
    invoiceId: invoice.id,
    number: invoice.number,
    type: invoice.type,
    contractId: input.contractId,
    contractNumber: contract.number,
    netPence: invoice.netPence,
    vatPence: invoice.vatPence,
    grossPence: invoice.grossPence,
    xeroInvoiceId: null,
  });
  return invoice;
}

export async function setCustomerInvoiceStatus(actor: Actor, invoiceId: string, status: "PAID" | "UNPAID") {
  allow(actor, "finance");
  const invoice = await prisma.customerInvoice.findUnique({
    where: { id: invoiceId },
    include: { contract: true },
  });
  if (!invoice) throw new ServiceError(404, "Invoice not found");
  if (invoice.status === "VOID") throw new ServiceError(400, "A void invoice cannot be marked paid");
  const updated = await prisma.customerInvoice.update({
    where: { id: invoiceId },
    data: { status, paidAt: status === "PAID" ? new Date() : null },
  });
  await recordActivity({
    actor,
    contractId: invoice.contractId,
    entityType: "customer_invoice",
    entityId: invoice.id,
    kind: "invoice",
    body: status === "PAID" ? `marked ${invoice.number} as paid` : `marked ${invoice.number} as unpaid`,
  });
  if (status === "PAID") {
    await emitEvent("customer_invoice.paid", {
      invoiceId: invoice.id,
      number: invoice.number,
      type: invoice.type,
      contractId: invoice.contractId,
      contractNumber: invoice.contract.number,
      netPence: invoice.netPence,
      grossPence: invoice.grossPence,
      xeroInvoiceId: invoice.xeroInvoiceId,
    });
  }
  return updated;
}
