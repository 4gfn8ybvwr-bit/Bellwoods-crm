import bcrypt from "bcryptjs";
import { allow, type Actor } from "@/domain/permissions";
import { ServiceError } from "@/domain/errors";
import { assertTradePortalCustomer } from "@/domain/portal";
import { recognisedSalesNet } from "@/domain/job-costing";
import { partsInLondon, londonToUtc } from "@/domain/dates";
import { prisma } from "@/lib/prisma";

export async function setCustomerPortalAccess(actor: Actor, customerId: string, enabled: boolean) {
  allow(actor, "write");
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ServiceError(404, "Customer not found");
  if (enabled) assertTradePortalCustomer(customer);
  if (!enabled) {
    await prisma.contact.updateMany({
      where: { customerId },
      data: { portalEnabled: false, portalPasswordHash: "" },
    });
  }
  return prisma.customer.update({
    where: { id: customerId },
    data: { portalEnabled: enabled },
    include: { contacts: true },
  });
}

export async function setContactPortalAccess(
  actor: Actor,
  contactId: string,
  input: { enabled: boolean; password?: string },
) {
  allow(actor, "write");
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, include: { customer: true } });
  if (!contact) throw new ServiceError(404, "Contact not found");
  if (input.enabled) {
    assertTradePortalCustomer(contact.customer);
    if (!contact.customer.portalEnabled) {
      throw new ServiceError(400, "Turn on portal access for the trade account first");
    }
    if (!contact.email.trim()) throw new ServiceError(400, "The contact needs an email address to sign in");
    if (input.password && input.password.length < 8) throw new ServiceError(400, "Portal password must be at least 8 characters");
    if (!input.password && !contact.portalPasswordHash) throw new ServiceError(400, "Set a portal password");
  }
  return prisma.contact.update({
    where: { id: contactId },
    data: {
      portalEnabled: input.enabled,
      portalPasswordHash: input.enabled
        ? input.password
          ? await bcrypt.hash(input.password, 10)
          : undefined
        : "",
    },
  });
}

function startOfToday() {
  const parts = partsInLondon(new Date());
  return londonToUtc(parts.y, parts.m, parts.d, 0, 0);
}

export async function portalAccountForCustomer(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      contracts: {
        orderBy: { createdAt: "desc" },
        include: {
          stage: true,
          customerInvoices: true,
          purchaseOrders: { where: { remake: true }, include: { supplier: true } },
        },
      },
    },
  });
  if (!customer) throw new ServiceError(404, "Customer not found");
  assertTradePortalCustomer(customer);
  if (!customer.portalEnabled) throw new ServiceError(403, "Portal access is switched off for this account");
  const today = startOfToday();
  const jobs = customer.contracts
    .filter((contract) => contract.channel === "TRADE")
    .map((contract) => {
      const live = contract.customerInvoices.filter((invoice) => invoice.status !== "VOID");
      const invoicedNetPence = recognisedSalesNet(live);
      const outstandingNetPence = live.filter((invoice) => invoice.status === "UNPAID").reduce((sum, invoice) => sum + invoice.netPence, 0);
      const outstandingGrossPence = live.filter((invoice) => invoice.status === "UNPAID").reduce((sum, invoice) => sum + invoice.grossPence, 0);
      const overdue = Boolean(contract.paymentDueDate && contract.paymentDueDate < today && outstandingGrossPence > 0);
      return {
        id: contract.id,
        number: contract.number,
        jobType: contract.jobType,
        siteAddress: contract.siteAddress,
        stage: contract.stage.name,
        customerReference: contract.customerReference,
        invoicedNetPence,
        outstandingNetPence,
        outstandingGrossPence,
        paymentDueDate: contract.paymentDueDate,
        paymentDueSource: contract.paymentDueSource,
        overdue,
        remakes: contract.purchaseOrders.map((po) => ({
          id: po.id,
          number: po.number,
          supplier: po.supplier.name,
          reason: po.remakeReason,
          netPence: po.netPence,
          status: po.status,
        })),
      };
    });
  const outstandingGrossPence = jobs.reduce((sum, job) => sum + job.outstandingGrossPence, 0);
  return {
    customer: {
      id: customer.id,
      name: customer.name,
      companyName: customer.companyName,
      type: customer.type,
    },
    jobs,
    overdueCount: jobs.filter((job) => job.overdue).length,
    outstandingGrossPence,
    dueDateNote: "Due dates are office entries until they are read from Camden Direct. This version does not connect to Camden.",
  };
}

export async function authenticatePortalContact(email: string, password: string) {
  const contact = await prisma.contact.findFirst({
    where: { email: email.trim().toLowerCase(), portalEnabled: true },
    include: { customer: true },
  });
  if (!contact || !contact.portalPasswordHash) throw new ServiceError(401, "Email or password is not recognised");
  assertTradePortalCustomer(contact.customer);
  if (!contact.customer.portalEnabled) throw new ServiceError(403, "Portal access is switched off for this account");
  const ok = await bcrypt.compare(password, contact.portalPasswordHash);
  if (!ok) throw new ServiceError(401, "Email or password is not recognised");
  return contact;
}
