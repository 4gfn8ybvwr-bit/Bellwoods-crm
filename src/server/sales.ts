import { allow, type Actor } from "@/domain/permissions";
import { ServiceError } from "@/domain/errors";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "./activity";
import { emitEvent } from "./webhooks";
import { takeNext } from "./numbers";
import { copyQuoteLines, moveStage } from "./pipeline";
import { normaliseLines, type SpecLineInput } from "./lines";

export async function createEnquiry(
  actor: Actor,
  input: {
    customerId: string;
    source: string;
    productInterest: string;
    assignedToId?: string | null;
    notes?: string;
  },
) {
  allow(actor, "write");
  if (!input.source.trim() || !input.productInterest.trim()) {
    throw new ServiceError(400, "Source and product interest are required");
  }
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ServiceError(404, "Customer not found");
  const enquiry = await prisma.enquiry.create({
    data: {
      customerId: customer.id,
      source: input.source.trim(),
      productInterest: input.productInterest.trim(),
      assignedToId: input.assignedToId || actor.userId,
      notes: input.notes?.trim() ?? "",
      status: "OPEN",
    },
    include: { customer: true, assignedTo: true },
  });
  await emitEvent("enquiry.created", {
    enquiryId: enquiry.id,
    customerId: customer.id,
    customerName: customer.name,
    source: enquiry.source,
    productInterest: enquiry.productInterest,
  });
  return enquiry;
}

export async function updateEnquiry(
  actor: Actor,
  id: string,
  input: {
    source?: string;
    productInterest?: string;
    status?: string;
    assignedToId?: string | null;
    notes?: string;
  },
) {
  allow(actor, "write");
  const existing = await prisma.enquiry.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Enquiry not found");
  if (input.status && !["OPEN", "QUOTED", "WON", "LOST"].includes(input.status)) {
    throw new ServiceError(400, "Unknown enquiry status");
  }
  return prisma.enquiry.update({
    where: { id },
    data: {
      source: input.source?.trim(),
      productInterest: input.productInterest?.trim(),
      status: input.status,
      assignedToId: input.assignedToId === undefined ? undefined : input.assignedToId || null,
      notes: input.notes !== undefined ? input.notes.trim() : undefined,
    },
    include: { customer: true, assignedTo: true },
  });
}

export async function createAppointment(
  actor: Actor,
  input: {
    customerId: string;
    userId?: string;
    enquiryId?: string | null;
    contractId?: string | null;
    type: string;
    title: string;
    startsAt: Date;
    endsAt?: Date | null;
    location?: string;
    notes?: string;
  },
) {
  allow(actor, "write");
  if (!["SURVEY", "SALES", "FIT", "OTHER"].includes(input.type)) {
    throw new ServiceError(400, "Appointment type must be survey, sales, fit or other");
  }
  if (!input.title.trim()) throw new ServiceError(400, "Title is required");
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ServiceError(404, "Customer not found");
  const userId = input.userId || actor.userId;
  if (!userId) throw new ServiceError(400, "Choose a member of staff");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ServiceError(400, "Choose a member of staff");
  const durationMs = input.type === "FIT" ? 8 * 60 * 60 * 1000 : 90 * 60 * 1000;
  const endsAt = input.endsAt ?? new Date(input.startsAt.getTime() + durationMs);
  if (endsAt <= input.startsAt) throw new ServiceError(400, "The appointment must end after it starts");
  const appointment = await prisma.appointment.create({
    data: {
      customerId: customer.id,
      userId,
      enquiryId: input.enquiryId || null,
      contractId: input.contractId || null,
      type: input.type,
      title: input.title.trim(),
      startsAt: input.startsAt,
      endsAt,
      location: input.location?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
    },
    include: { customer: true, user: true, contract: true },
  });
  if (input.contractId && input.type === "SURVEY") {
    const contract = await prisma.contract.findUnique({ where: { id: input.contractId }, include: { stage: true } });
    if (contract && ["enquiry"].includes(contract.stage.slug)) {
      const next = await prisma.stage.findUnique({ where: { slug: "survey-booked" } });
      if (next) await prisma.contract.update({ where: { id: contract.id }, data: { stageId: next.id } });
    }
    await recordActivity({
      actor,
      contractId: input.contractId,
      entityType: "appointment",
      entityId: appointment.id,
      kind: "stage",
      body: `booked a survey appointment`,
    });
  }
  if (input.contractId && input.type === "FIT") {
    await recordActivity({
      actor,
      contractId: input.contractId,
      entityType: "appointment",
      entityId: appointment.id,
      kind: "stage",
      body: `booked a fit appointment`,
    });
    const contract = await prisma.contract.findUnique({ where: { id: input.contractId }, include: { stage: true } });
    const fitStage = await prisma.stage.findUnique({ where: { slug: "fit-booked" } });
    if (contract && fitStage && contract.stage.sortOrder < fitStage.sortOrder) {
      try {
        await moveStage(actor, contract.id, "fit-booked");
      } catch {
        // The ready-to-order gate can refuse the move. The appointment still stands.
      }
    }
  }
  return appointment;
}

export async function updateAppointment(
  actor: Actor,
  id: string,
  input: Partial<{
    userId: string;
    type: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    location: string;
    notes: string;
  }>,
) {
  allow(actor, "write");
  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Appointment not found");
  const startsAt = input.startsAt ?? existing.startsAt;
  const endsAt = input.endsAt ?? existing.endsAt;
  if (endsAt <= startsAt) throw new ServiceError(400, "The appointment must end after it starts");
  return prisma.appointment.update({
    where: { id },
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title?.trim(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location !== undefined ? input.location.trim() : undefined,
      notes: input.notes !== undefined ? input.notes.trim() : undefined,
    },
    include: { customer: true, user: true, contract: true },
  });
}

export async function deleteAppointment(actor: Actor, id: string) {
  allow(actor, "write");
  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Appointment not found");
  await prisma.appointment.delete({ where: { id } });
  return { ok: true };
}

async function saveQuoteRecord(
  actor: Actor,
  input: {
    customerId: string;
    enquiryId?: string | null;
    notes?: string;
    validUntil?: Date | null;
    lines: SpecLineInput[];
    status?: string;
  },
  quoteId?: string,
) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ServiceError(404, "Customer not found");
  if (input.enquiryId) {
    const enquiry = await prisma.enquiry.findUnique({ where: { id: input.enquiryId } });
    if (!enquiry || enquiry.customerId !== customer.id) throw new ServiceError(400, "Enquiry does not match the customer");
  }
  const priced = await copyQuoteLines(input.lines);
  if (quoteId) {
    const existing = await prisma.quote.findUnique({ where: { id: quoteId } });
    if (!existing) throw new ServiceError(404, "Quote not found");
    if (existing.status === "ACCEPTED") throw new ServiceError(400, "An accepted quote is locked");
    const quote = await prisma.$transaction(async (tx) => {
      await tx.quoteLine.deleteMany({ where: { quoteId } });
      return tx.quote.update({
        where: { id: quoteId },
        data: {
          customerId: customer.id,
          enquiryId: input.enquiryId === undefined ? existing.enquiryId : input.enquiryId || null,
          notes: input.notes !== undefined ? input.notes.trim() : existing.notes,
          validUntil: input.validUntil === undefined ? existing.validUntil : input.validUntil,
          netPence: priced.netPence,
          vatPence: priced.vatPence,
          grossPence: priced.grossPence,
          lines: { create: priced.normalised },
        },
        include: { lines: true, customer: true, enquiry: true },
      });
    });
    return quote;
  }
  const quote = await prisma.$transaction(async (tx) => {
    const n = await takeNext(tx, "quote");
    return tx.quote.create({
      data: {
        number: `Q-${n}`,
        customerId: customer.id,
        enquiryId: input.enquiryId || null,
        notes: input.notes?.trim() ?? "",
        validUntil: input.validUntil ?? null,
        netPence: priced.netPence,
        vatPence: priced.vatPence,
        grossPence: priced.grossPence,
        createdById: actor.userId,
        status: "DRAFT",
        lines: { create: priced.normalised },
      },
      include: { lines: true, customer: true, enquiry: true },
    });
  });
  if (input.enquiryId) {
    await prisma.enquiry.updateMany({
      where: { id: input.enquiryId, status: "OPEN" },
      data: { status: "QUOTED" },
    });
  }
  return quote;
}

export async function createQuote(
  actor: Actor,
  input: {
    customerId: string;
    enquiryId?: string | null;
    notes?: string;
    validUntil?: Date | null;
    lines: SpecLineInput[];
  },
) {
  allow(actor, "write");
  normaliseLines(input.lines);
  return saveQuoteRecord(actor, input);
}

export async function updateQuote(
  actor: Actor,
  id: string,
  input: {
    notes?: string;
    validUntil?: Date | null;
    lines?: SpecLineInput[];
    enquiryId?: string | null;
  },
) {
  allow(actor, "write");
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Quote not found");
  if (!input.lines) {
    if (existing.status === "ACCEPTED") throw new ServiceError(400, "An accepted quote is locked");
    return prisma.quote.update({
      where: { id },
      data: {
        notes: input.notes !== undefined ? input.notes.trim() : undefined,
        validUntil: input.validUntil === undefined ? undefined : input.validUntil,
        enquiryId: input.enquiryId === undefined ? undefined : input.enquiryId || null,
      },
      include: { lines: true, customer: true, enquiry: true },
    });
  }
  return saveQuoteRecord(
    actor,
    {
      customerId: existing.customerId,
      enquiryId: input.enquiryId === undefined ? existing.enquiryId : input.enquiryId,
      notes: input.notes,
      validUntil: input.validUntil,
      lines: input.lines,
    },
    id,
  );
}

export async function sendQuote(actor: Actor, id: string) {
  allow(actor, "write");
  const quote = await prisma.quote.findUnique({ where: { id }, include: { customer: true } });
  if (!quote) throw new ServiceError(404, "Quote not found");
  if (quote.status === "ACCEPTED") throw new ServiceError(400, "This quote is already accepted");
  const updated = await prisma.quote.update({ where: { id }, data: { status: "SENT" } });
  if (quote.enquiryId) {
    await prisma.enquiry.updateMany({ where: { id: quote.enquiryId, status: "OPEN" }, data: { status: "QUOTED" } });
  }
  await emitEvent("quote.sent", {
    quoteId: quote.id,
    quoteNumber: quote.number,
    customerId: quote.customerId,
    customerName: quote.customer.name,
    netPence: quote.netPence,
  });
  return updated;
}

export async function rejectQuote(actor: Actor, id: string) {
  allow(actor, "write");
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) throw new ServiceError(404, "Quote not found");
  if (quote.status === "ACCEPTED") throw new ServiceError(400, "An accepted quote cannot be rejected");
  const updated = await prisma.quote.update({ where: { id }, data: { status: "REJECTED" } });
  await emitEvent("quote.rejected", { quoteId: quote.id, quoteNumber: quote.number });
  return updated;
}
