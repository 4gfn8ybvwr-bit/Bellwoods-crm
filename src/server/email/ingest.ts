import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type { Actor } from "@/domain/permissions";
import { allow } from "@/domain/permissions";
import { ServiceError } from "@/domain/errors";
import { matchInboundEmail } from "@/domain/email-match";
import { prisma } from "@/lib/prisma";
import { uploadRoot } from "../pipeline";
import { quickAddTradeJob } from "../trade";
import { createEnquiry } from "../sales";

export type InboundAttachmentInput = { filename: string; mimeType: string; bytes: Buffer };

export type InboundEmailInput = {
  fromName?: string;
  fromEmail: string;
  subject?: string;
  bodyText?: string;
  receivedAt?: Date;
  messageId?: string | null;
  source?: string;
  attachments?: InboundAttachmentInput[];
};

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "message/rfc822",
]);

export async function ingestEmail(actor: Actor, input: InboundEmailInput) {
  allow(actor, "write");
  const fromEmail = input.fromEmail.trim().toLowerCase();
  if (!fromEmail.includes("@")) throw new ServiceError(400, "A from address is required");
  if (input.messageId) {
    const existing = await prisma.inboundEmail.findUnique({ where: { messageId: input.messageId }, include: { attachments: true, customer: true, contract: true } });
    if (existing) return existing;
  }
  const [customers, contracts] = await Promise.all([
    prisma.customer.findMany({ include: { contacts: true } }),
    prisma.contract.findMany({ select: { id: true, number: true, customerId: true, customerReference: true } }),
  ]);
  const match = matchInboundEmail({
    fromEmail,
    subject: input.subject ?? "",
    body: input.bodyText ?? "",
    customers: customers.map((customer) => ({
      id: customer.id,
      email: customer.email,
      contactEmails: customer.contacts.map((contact) => contact.email),
    })),
    contracts,
  });
  const email = await prisma.inboundEmail.create({
    data: {
      fromName: input.fromName?.trim() ?? "",
      fromEmail,
      subject: input.subject?.trim() ?? "",
      bodyText: (input.bodyText ?? "").slice(0, 20000),
      receivedAt: input.receivedAt ?? new Date(),
      messageId: input.messageId || null,
      source: input.source ?? "API",
      customerId: match.customerId,
      contractId: match.contractId,
      matchNotes: match.notes.join(". "),
    },
    include: { attachments: true, customer: true, contract: true },
  });
  const saved = [];
  for (const file of input.attachments ?? []) {
    if (!file.bytes.byteLength) continue;
    if (file.bytes.byteLength > 12 * 1024 * 1024) continue;
    const mime = file.mimeType || "application/octet-stream";
    if (!ALLOWED_MIME.has(mime)) continue;
    const safe = (file.filename || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
    const dir = path.join(uploadRoot(), "email", email.id);
    await mkdir(dir, { recursive: true });
    const storagePath = path.join(dir, `${Date.now()}-${safe}`);
    await writeFile(storagePath, file.bytes);
    saved.push(
      await prisma.inboundAttachment.create({
        data: { emailId: email.id, filename: file.filename || safe, mimeType: mime, sizeBytes: file.bytes.byteLength, storagePath },
      }),
    );
  }
  return { ...email, attachments: saved.length ? saved : email.attachments };
}

export async function assignEmail(actor: Actor, id: string, input: { customerId?: string | null; contractId?: string | null }) {
  allow(actor, "write");
  const email = await prisma.inboundEmail.findUnique({ where: { id } });
  if (!email) throw new ServiceError(404, "Email not found");
  if (input.contractId) {
    const contract = await prisma.contract.findUnique({ where: { id: input.contractId } });
    if (!contract) throw new ServiceError(404, "Contract not found");
    if (input.customerId && input.customerId !== contract.customerId) {
      throw new ServiceError(400, "That job belongs to a different customer");
    }
    return prisma.inboundEmail.update({
      where: { id },
      data: { contractId: contract.id, customerId: contract.customerId, matchNotes: "Assigned by hand" },
      include: { customer: true, contract: true, attachments: true },
    });
  }
  if (input.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new ServiceError(404, "Customer not found");
  }
  return prisma.inboundEmail.update({
    where: { id },
    data: { customerId: input.customerId || null, contractId: null, matchNotes: "Assigned by hand" },
    include: { customer: true, contract: true, attachments: true },
  });
}

export async function markEmailRead(actor: Actor, id: string, read: boolean) {
  allow(actor, "read");
  const email = await prisma.inboundEmail.findUnique({ where: { id } });
  if (!email) throw new ServiceError(404, "Email not found");
  return prisma.inboundEmail.update({ where: { id }, data: { readAt: read ? new Date() : null } });
}

export async function enquiryFromEmail(actor: Actor, id: string, channel: "BELLWOODS" | "TRADE") {
  allow(actor, "write");
  const email = await prisma.inboundEmail.findUnique({ where: { id } });
  if (!email) throw new ServiceError(404, "Email not found");
  if (!email.customerId) throw new ServiceError(400, "Assign a customer before creating the enquiry");
  if (email.enquiryId) throw new ServiceError(400, "This email is already on an enquiry");
  const enquiry = await createEnquiry(actor, {
    customerId: email.customerId,
    source: "Email",
    productInterest: email.subject || "Email enquiry",
    notes: email.bodyText,
    channel,
    status: "OPEN",
  });
  await prisma.inboundEmail.update({ where: { id }, data: { enquiryId: enquiry.id, readAt: new Date() } });
  return enquiry;
}

export async function tradeJobFromEmail(actor: Actor, id: string) {
  const email = await prisma.inboundEmail.findUnique({ where: { id }, include: { customer: true } });
  if (!email) throw new ServiceError(404, "Email not found");
  if (!email.customerId || email.customer?.type !== "TRADE") {
    throw new ServiceError(400, "Match a trade customer before opening a trade job");
  }
  return quickAddTradeJob(actor, {
    customerId: email.customerId,
    jobType: "Supply and fit",
    description: email.subject || email.bodyText.slice(0, 240),
    emailId: email.id,
    surveyWaived: false,
  });
}
