import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { allow, type Actor } from "@/domain/permissions";
import { ServiceError } from "@/domain/errors";
import { vatFromNet } from "@/domain/money";
import { READY_TO_ORDER_SLUG, COMPLETE_SLUG } from "@/domain/labels";
import { readyToOrderGate, stageRequiresReadyGate } from "@/domain/ready-to-order";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "./activity";
import { emitEvent } from "./webhooks";
import { getSettings } from "./settings";
import { formatContractNumber, takeNext } from "./numbers";
import { formatAddress } from "./customers";
import { insertCustomerInvoice } from "./finance";
import { normaliseLines, sumNet, type SpecLineInput } from "./lines";

const CONTRACT_TYPES = new Set(["BW", "TC", "CM"]);

export function depositPaidFrom(invoices: { type: string; status: string }[]) {
  const deposits = invoices.filter((invoice) => invoice.type === "DEPOSIT" && invoice.status !== "VOID");
  return deposits.length > 0 && deposits.every((invoice) => invoice.status === "PAID");
}

export async function loadGate(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { customerInvoices: true, stage: true },
  });
  if (!contract) throw new ServiceError(404, "Contract not found");
  const depositPaid = depositPaidFrom(contract.customerInvoices);
  const gate = readyToOrderGate({
    depositSkipped: contract.depositSkipped,
    depositPaid,
    surveyUploaded: contract.surveyUploaded,
  });
  return { contract, depositPaid, gate };
}

async function stageBySlug(slug: string) {
  const stage = await prisma.stage.findUnique({ where: { slug } });
  if (!stage) throw new ServiceError(500, `Pipeline stage “${slug}” is missing`);
  return stage;
}

export async function moveStage(actor: Actor, contractId: string, stageSlug: string) {
  allow(actor, "write");
  const { contract, gate } = await loadGate(contractId);
  const target = await prisma.stage.findUnique({ where: { slug: stageSlug } });
  if (!target) throw new ServiceError(400, "Unknown stage");
  if (target.id === contract.stageId) return contract;
  const ready = await prisma.stage.findUnique({ where: { slug: READY_TO_ORDER_SLUG } });
  if (stageRequiresReadyGate(target.sortOrder, ready?.sortOrder ?? null) && !gate.ok) {
    throw new ServiceError(400, `Not ready to order. ${gate.reasons.join(". ")}.`);
  }
  if (target.slug === COMPLETE_SLUG) {
    const finals = contract.customerInvoices.filter((invoice) => invoice.type === "FINAL" && invoice.status !== "VOID");
    if (finals.length === 0) throw new ServiceError(400, "Raise a final invoice before completing the job");
  }
  const updated = await prisma.contract.update({
    where: { id: contractId },
    data: {
      stageId: target.id,
      completedAt: target.slug === COMPLETE_SLUG ? new Date() : target.sortOrder < contract.stage.sortOrder && contract.stage.slug === COMPLETE_SLUG ? null : contract.completedAt,
      soldAt: contract.soldAt ?? (target.sortOrder >= (await soldSortOrder()) ? new Date() : null),
    },
    include: { stage: true, customer: true },
  });
  if (target.slug !== COMPLETE_SLUG && contract.stage.slug === COMPLETE_SLUG) {
    await prisma.contract.update({ where: { id: contractId }, data: { completedAt: null } });
    updated.completedAt = null;
  }
  await recordActivity({
    actor,
    contractId,
    entityType: "contract",
    entityId: contractId,
    kind: "stage",
    body: `moved ${contract.number} from ${contract.stage.name} to ${target.name}`,
  });
  await emitEvent("contract.stage_changed", {
    contractId,
    number: contract.number,
    type: contract.type,
    from: contract.stage.slug,
    to: target.slug,
    customerName: updated.customer.name,
  });
  if (target.slug === READY_TO_ORDER_SLUG) {
    await emitEvent("contract.ready_to_order", { contractId, number: contract.number, type: contract.type });
  }
  return updated;
}

async function soldSortOrder() {
  const sold = await prisma.stage.findUnique({ where: { slug: "sold" } });
  return sold?.sortOrder ?? 4;
}

export async function createContract(
  actor: Actor,
  input: {
    customerId: string;
    type: string;
    enquiryId?: string | null;
    stageSlug?: string;
    siteAddress?: string;
    salesValuePence?: number;
    notes?: string;
  },
) {
  allow(actor, "write");
  if (!CONTRACT_TYPES.has(input.type)) throw new ServiceError(400, "Contract type must be BW, TC or CM");
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    include: { addresses: true },
  });
  if (!customer) throw new ServiceError(404, "Customer not found");
  if (input.enquiryId) {
    const enquiry = await prisma.enquiry.findUnique({ where: { id: input.enquiryId } });
    if (!enquiry) throw new ServiceError(404, "Enquiry not found");
    if (enquiry.contractId) throw new ServiceError(400, "That enquiry is already on a contract");
    if (enquiry.customerId !== customer.id) throw new ServiceError(400, "Enquiry belongs to a different customer");
  }
  const stage = await stageBySlug(input.stageSlug || "enquiry");
  const primary = customer.addresses.find((address) => address.isPrimary) ?? customer.addresses[0];
  const contract = await prisma.$transaction(async (tx) => {
    const n = await takeNext(tx, "contract");
    const created = await tx.contract.create({
      data: {
        number: formatContractNumber(input.type, n),
        type: input.type,
        customerId: customer.id,
        stageId: stage.id,
        siteAddress: input.siteAddress?.trim() || (primary ? formatAddress(primary) : ""),
        salesValuePence: input.salesValuePence ?? 0,
        notes: input.notes?.trim() ?? "",
        depositPercent: (await getSettings()).defaultDepositPercent,
      },
    });
    if (input.enquiryId) {
      await tx.enquiry.update({ where: { id: input.enquiryId }, data: { contractId: created.id } });
    }
    return created;
  });
  await recordActivity({
    actor,
    contractId: contract.id,
    entityType: "contract",
    entityId: contract.id,
    kind: "stage",
    body: `opened contract ${contract.number}`,
  });
  await emitEvent("contract.created", {
    contractId: contract.id,
    number: contract.number,
    type: contract.type,
    customerId: customer.id,
    customerName: customer.name,
  });
  return contract;
}

export async function updateContract(
  actor: Actor,
  id: string,
  input: {
    siteAddress?: string;
    notes?: string;
    salesValuePence?: number;
    depositPercent?: number;
    fittersNeeded?: number;
    fittersNotes?: string;
    externalWorks?: string;
    surveyUploaded?: boolean;
  },
) {
  allow(actor, "write");
  const existing = await prisma.contract.findUnique({ where: { id }, include: { customerInvoices: true } });
  if (!existing) throw new ServiceError(404, "Contract not found");
  if (input.salesValuePence != null && input.salesValuePence < 0) {
    throw new ServiceError(400, "Sales value cannot be negative");
  }
  if (input.depositPercent != null && (!Number.isInteger(input.depositPercent) || input.depositPercent < 0 || input.depositPercent > 100)) {
    throw new ServiceError(400, "Deposit percent must be between 0 and 100");
  }
  if (input.fittersNeeded != null && (!Number.isInteger(input.fittersNeeded) || input.fittersNeeded < 1)) {
    throw new ServiceError(400, "Enter how many fitters are needed");
  }
  const updated = await prisma.contract.update({
    where: { id },
    data: {
      siteAddress: input.siteAddress !== undefined ? input.siteAddress.trim() : undefined,
      notes: input.notes !== undefined ? input.notes.trim() : undefined,
      salesValuePence: input.salesValuePence,
      depositPercent: input.depositPercent,
      fittersNeeded: input.fittersNeeded,
      fittersNotes: input.fittersNotes !== undefined ? input.fittersNotes.trim() : undefined,
      externalWorks: input.externalWorks !== undefined ? input.externalWorks.trim() : undefined,
      surveyUploaded: input.surveyUploaded,
    },
  });
  if (input.surveyUploaded != null) {
    await recordActivity({
      actor,
      contractId: id,
      entityType: "contract",
      entityId: id,
      kind: "document",
      body: input.surveyUploaded ? "marked the survey as uploaded" : "cleared the survey uploaded flag",
    });
  }
  return updated;
}

export async function acceptQuote(
  actor: Actor,
  quoteId: string,
  input: { type: string; depositPercent?: number; skipDeposit?: boolean },
) {
  allow(actor, "write");
  if (!CONTRACT_TYPES.has(input.type)) throw new ServiceError(400, "Contract type must be BW, TC or CM");
  const settings = await getSettings();
  const skipDeposit = Boolean(input.skipDeposit);
  const depositPercent = skipDeposit ? 0 : (input.depositPercent ?? settings.defaultDepositPercent);
  if (!skipDeposit && (!Number.isInteger(depositPercent) || depositPercent < 1 || depositPercent > 100)) {
    throw new ServiceError(400, "Deposit percent must be a whole number from 1 to 100, or skip the deposit");
  }

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, enquiry: true, customer: { include: { addresses: true } } },
  });
  if (!quote) throw new ServiceError(404, "Quote not found");
  if (quote.status === "ACCEPTED") throw new ServiceError(400, "This quote has already been accepted");
  if (quote.status === "REJECTED") throw new ServiceError(400, "A rejected quote cannot be accepted");
  if (quote.lines.length === 0 || quote.netPence <= 0) throw new ServiceError(400, "The quote has no priced lines");

  const sold = await stageBySlug("sold");
  const depositStage = await stageBySlug("deposit-stage");
  const targetStage = skipDeposit ? sold : depositStage;
  const primary = quote.customer.addresses.find((address) => address.isPrimary) ?? quote.customer.addresses[0];

  const result = await prisma.$transaction(async (tx) => {
    let contract = quote.enquiry?.contractId
      ? await tx.contract.findUnique({ where: { id: quote.enquiry.contractId } })
      : null;
    if (!contract) {
      const existing = await tx.contract.findUnique({ where: { quoteId: quote.id } });
      contract = existing;
    }
    if (contract?.quoteId && contract.quoteId !== quote.id) {
      throw new ServiceError(400, "That contract is already linked to another quote");
    }
    if (!contract) {
      const n = await takeNext(tx, "contract");
      contract = await tx.contract.create({
        data: {
          number: formatContractNumber(input.type, n),
          type: input.type,
          customerId: quote.customerId,
          quoteId: quote.id,
          stageId: targetStage.id,
          siteAddress: primary ? formatAddress(primary) : "",
          salesValuePence: quote.netPence,
          depositPercent,
          depositSkipped: skipDeposit,
          soldAt: new Date(),
        },
      });
    } else {
      contract = await tx.contract.update({
        where: { id: contract.id },
        data: {
          type: input.type,
          quoteId: quote.id,
          stageId: targetStage.id,
          salesValuePence: quote.netPence,
          depositPercent,
          depositSkipped: skipDeposit,
          soldAt: contract.soldAt ?? new Date(),
        },
      });
      await tx.contractLine.deleteMany({ where: { contractId: contract.id } });
    }
    await tx.contractLine.createMany({
      data: quote.lines.map((line) => ({
        contractId: contract!.id,
        productType: line.productType,
        description: line.description,
        widthMm: line.widthMm,
        heightMm: line.heightMm,
        specification: line.specification,
        quantity: line.quantity,
        unitPricePence: line.unitPricePence,
        netPence: line.netPence,
        sortOrder: line.sortOrder,
      })),
    });
    await tx.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });
    if (quote.enquiryId) {
      await tx.enquiry.update({
        where: { id: quote.enquiryId },
        data: { status: "WON", contractId: contract.id },
      });
    }
    let deposit = null;
    if (!skipDeposit) {
      const already = await tx.customerInvoice.findFirst({
        where: { contractId: contract.id, type: "DEPOSIT", status: { not: "VOID" } },
      });
      if (already) throw new ServiceError(400, "This contract already has a deposit invoice");
      const netPence = Math.round((quote.netPence * depositPercent) / 100);
      deposit = await insertCustomerInvoice(tx, {
        contractId: contract.id,
        type: "DEPOSIT",
        invoiceDate: new Date(),
        netPence,
        vatRateBps: settings.vatRateBps,
      });
    }
    return { contract, deposit };
  });

  await recordActivity({
    actor,
    contractId: result.contract.id,
    entityType: "quote",
    entityId: quote.id,
    kind: "quote",
    body: `accepted quote ${quote.number} as contract ${result.contract.number}`,
  });
  await emitEvent("quote.accepted", {
    quoteId: quote.id,
    quoteNumber: quote.number,
    contractId: result.contract.id,
    contractNumber: result.contract.number,
    type: result.contract.type,
    netPence: quote.netPence,
  });
  await emitEvent("contract.created", {
    contractId: result.contract.id,
    number: result.contract.number,
    type: result.contract.type,
    customerId: quote.customerId,
    customerName: quote.customer.name,
    fromQuote: quote.number,
  });
  if (result.deposit) {
    await emitEvent("customer_invoice.created", {
      invoiceId: result.deposit.id,
      number: result.deposit.number,
      type: "DEPOSIT",
      contractId: result.contract.id,
      contractNumber: result.contract.number,
      netPence: result.deposit.netPence,
      vatPence: result.deposit.vatPence,
      grossPence: result.deposit.grossPence,
      xeroInvoiceId: null,
    });
  }
  return result;
}

export async function addNote(actor: Actor, contractId: string, body: string) {
  allow(actor, "note");
  const text = body.trim();
  if (!text) throw new ServiceError(400, "Write a note first");
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new ServiceError(404, "Contract not found");
  return recordActivity({
    actor,
    contractId,
    entityType: "contract",
    entityId: contractId,
    kind: "note",
    body: `noted: ${text}`,
  });
}

export async function createTask(
  actor: Actor,
  contractId: string,
  input: { title: string; notes?: string; assignedToId?: string | null; dueDate?: Date | null },
) {
  allow(actor, "write");
  if (!input.title.trim()) throw new ServiceError(400, "Task title is required");
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new ServiceError(404, "Contract not found");
  const task = await prisma.task.create({
    data: {
      contractId,
      title: input.title.trim(),
      notes: input.notes?.trim() ?? "",
      assignedToId: input.assignedToId || null,
      dueDate: input.dueDate ?? null,
      createdById: actor.userId,
    },
    include: { assignedTo: true },
  });
  await recordActivity({
    actor,
    contractId,
    entityType: "task",
    entityId: task.id,
    kind: "task",
    body: `added task “${task.title}”`,
  });
  return task;
}

export async function updateTask(
  actor: Actor,
  taskId: string,
  input: { title?: string; notes?: string; assignedToId?: string | null; dueDate?: Date | null; completed?: boolean },
) {
  allow(actor, "write");
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new ServiceError(404, "Task not found");
  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      title: input.title?.trim() || undefined,
      notes: input.notes !== undefined ? input.notes.trim() : undefined,
      assignedToId: input.assignedToId === undefined ? undefined : input.assignedToId || null,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate,
      completedAt: input.completed == null ? undefined : input.completed ? new Date() : null,
    },
    include: { assignedTo: true },
  });
  if (input.completed != null) {
    await recordActivity({
      actor,
      contractId: task.contractId,
      entityType: "task",
      entityId: task.id,
      kind: "task",
      body: input.completed ? `completed task “${updated.title}”` : `reopened task “${updated.title}”`,
    });
  }
  return updated;
}

export type SurveyInput = {
  fittersNeeded: number;
  fittersNotes?: string;
  externalWorks?: string;
  openings: {
    location: string;
    productType: string;
    widthMm: number;
    heightMm: number;
    specification?: string;
    notes?: string;
  }[];
  materials: { description: string; quantity: string; unit?: string }[];
};

export async function saveSurvey(actor: Actor, contractId: string, input: SurveyInput) {
  allow(actor, "write");
  if (!Number.isInteger(input.fittersNeeded) || input.fittersNeeded < 1) {
    throw new ServiceError(400, "Enter how many fitters are needed");
  }
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new ServiceError(404, "Contract not found");
  const openings = input.openings.filter((opening) => opening.location.trim() || opening.widthMm || opening.heightMm);
  for (const opening of openings) {
    if (!opening.location.trim()) throw new ServiceError(400, "Each opening needs a location");
    if (!Number.isInteger(opening.widthMm) || opening.widthMm <= 0 || !Number.isInteger(opening.heightMm) || opening.heightMm <= 0) {
      throw new ServiceError(400, "Opening sizes must be in millimetres");
    }
  }
  const materials = input.materials.filter((item) => item.description.trim());
  await prisma.$transaction(async (tx) => {
    await tx.surveyOpening.deleteMany({ where: { contractId } });
    await tx.surveyMaterial.deleteMany({ where: { contractId } });
    if (openings.length) {
      await tx.surveyOpening.createMany({
        data: openings.map((opening) => ({
          contractId,
          location: opening.location.trim(),
          productType: opening.productType || "WINDOW",
          widthMm: opening.widthMm,
          heightMm: opening.heightMm,
          specification: opening.specification?.trim() ?? "",
          notes: opening.notes?.trim() ?? "",
        })),
      });
    }
    if (materials.length) {
      await tx.surveyMaterial.createMany({
        data: materials.map((item) => ({
          contractId,
          description: item.description.trim(),
          quantity: item.quantity.trim() || "1",
          unit: item.unit?.trim() ?? "",
        })),
      });
    }
    await tx.contract.update({
      where: { id: contractId },
      data: {
        fittersNeeded: input.fittersNeeded,
        fittersNotes: input.fittersNotes?.trim() ?? "",
        externalWorks: input.externalWorks?.trim() ?? "",
      },
    });
  });
  await recordActivity({
    actor,
    contractId,
    entityType: "contract",
    entityId: contractId,
    kind: "document",
    body: "updated the survey sheet",
  });
  return { ok: true };
}

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
]);

export function uploadRoot() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
}

export async function addDocument(
  actor: Actor,
  contractId: string,
  file: { filename: string; mimeType: string; bytes: Buffer },
  kind: string,
) {
  allow(actor, "note");
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new ServiceError(404, "Contract not found");
  if (!file.bytes.byteLength) throw new ServiceError(400, "Choose a file");
  if (file.bytes.byteLength > 12 * 1024 * 1024) throw new ServiceError(400, "Files must be 12 MB or smaller");
  const mimeType = file.mimeType || "application/octet-stream";
  if (!ALLOWED_MIME.has(mimeType)) throw new ServiceError(400, "Upload a PDF, image or text file");
  const safeKind = ["SURVEY", "PHOTO", "OTHER"].includes(kind) ? kind : "OTHER";
  const safeName = (file.filename || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
  const dir = path.join(uploadRoot(), contractId);
  await mkdir(dir, { recursive: true });
  const storedName = `${Date.now()}-${safeName}`;
  const storagePath = path.join(dir, storedName);
  await writeFile(storagePath, file.bytes);
  const document = await prisma.document.create({
    data: {
      contractId,
      filename: file.filename || safeName,
      mimeType,
      sizeBytes: file.bytes.byteLength,
      storagePath,
      kind: safeKind,
      uploadedById: actor.userId,
    },
  });
  if (safeKind === "SURVEY") {
    await prisma.contract.update({ where: { id: contractId }, data: { surveyUploaded: true } });
  }
  await recordActivity({
    actor,
    contractId,
    entityType: "document",
    entityId: document.id,
    kind: "document",
    body: `uploaded ${safeKind === "SURVEY" ? "survey" : "document"} ${document.filename}`,
  });
  await emitEvent("document.uploaded", {
    documentId: document.id,
    contractId,
    contractNumber: contract.number,
    filename: document.filename,
    kind: document.kind,
  });
  return document;
}

export async function copyQuoteLines(lines: SpecLineInput[]) {
  const normalised = normaliseLines(lines);
  const netPence = sumNet(normalised);
  const settings = await getSettings();
  const tax = vatFromNet(netPence, settings.vatRateBps);
  return { normalised, netPence, ...tax };
}
