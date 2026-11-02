import { allow, type Actor } from "@/domain/permissions";
import { ServiceError } from "@/domain/errors";
import { TRADE_JOB_TYPES } from "@/domain/channel";
import { prisma } from "@/lib/prisma";
import { createCustomer } from "./customers";
import { createEnquiry } from "./sales";
import { createContract } from "./pipeline";
import { recordActivity } from "./activity";

export type QuickTradeInput = {
  customerId?: string | null;
  newCustomer?: { companyName: string; contactName?: string; email?: string; phone?: string; city?: string; postcode?: string } | null;
  jobType: string;
  description?: string;
  customerReference?: string;
  siteAddress?: string;
  surveyWaived?: boolean;
  repeatLast?: boolean;
  emailId?: string | null;
};

export async function tradeCustomers(query?: string) {
  const q = query?.trim();
  const customers = await prisma.customer.findMany({
    where: {
      type: "TRADE",
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { companyName: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      contracts: { where: { channel: "TRADE" }, orderBy: { createdAt: "desc" }, take: 1 },
      addresses: true,
    },
    orderBy: [{ lastUsedAt: "desc" }, { companyName: "asc" }],
    take: 30,
  });
  return customers.map((customer) => {
    const last = customer.contracts[0];
    const address = customer.addresses.find((item) => item.isPrimary) ?? customer.addresses[0];
    return {
      id: customer.id,
      name: customer.name,
      companyName: customer.companyName,
      email: customer.email,
      phone: customer.phone,
      lastUsedAt: customer.lastUsedAt,
      site: address ? [address.line1, address.city, address.postcode].filter(Boolean).join(", ") : "",
      lastJob: last
        ? {
            number: last.number,
            jobType: last.jobType,
            description: last.notes,
            customerReference: last.customerReference,
            siteAddress: last.siteAddress,
          }
        : null,
    };
  });
}

export async function quickAddTradeJob(actor: Actor, input: QuickTradeInput) {
  allow(actor, "write");
  const jobType = input.jobType.trim();
  if (!TRADE_JOB_TYPES.includes(jobType as (typeof TRADE_JOB_TYPES)[number]) && jobType !== "Repeat") {
    throw new ServiceError(400, "Choose a job type");
  }
  let customerId = input.customerId || "";
  if (!customerId) {
    if (!input.newCustomer?.companyName?.trim()) throw new ServiceError(400, "Choose a trade customer or add the company name");
    const created = await createCustomer(actor, {
      type: "TRADE",
      name: input.newCustomer.contactName?.trim() || input.newCustomer.companyName.trim(),
      companyName: input.newCustomer.companyName.trim(),
      email: input.newCustomer.email,
      phone: input.newCustomer.phone,
      address: input.newCustomer.postcode
        ? {
            line1: input.newCustomer.companyName.trim(),
            city: input.newCustomer.city?.trim() || "Newcastle upon Tyne",
            postcode: input.newCustomer.postcode,
            label: "Site",
            isPrimary: true,
          }
        : null,
    });
    customerId = created.id;
  }
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ServiceError(404, "Customer not found");
  if (customer.type !== "TRADE") throw new ServiceError(400, "Quick-add is for trade customers");

  const previous = input.repeatLast
    ? await prisma.contract.findFirst({
        where: { customerId, channel: "TRADE" },
        orderBy: { createdAt: "desc" },
      })
    : null;
  if (input.repeatLast && !previous) throw new ServiceError(400, "This customer has no earlier trade job to repeat");

  const description = (input.description?.trim() || previous?.notes || "").trim();
  const resolvedType = previous && input.repeatLast ? previous.jobType || jobType : jobType;
  const interest = [resolvedType, description].filter(Boolean).join(" — ");
  const enquiry = await createEnquiry(actor, {
    customerId,
    source: "Trade account",
    productInterest: interest || resolvedType,
    notes: input.customerReference ? `Customer reference ${input.customerReference}` : "",
    channel: "TRADE",
    status: "WON",
  });
  const contract = await createContract(actor, {
    customerId,
    type: "TC",
    channel: "TRADE",
    enquiryId: enquiry.id,
    stageSlug: "sold",
    siteAddress: input.siteAddress?.trim() || previous?.siteAddress || "",
    notes: description,
    jobType: resolvedType,
    customerReference: input.customerReference?.trim() || "",
    depositSkipped: true,
    surveyWaived: Boolean(input.surveyWaived),
    salesValuePence: 0,
  });
  if (description) {
    await prisma.contractLine.create({
      data: {
        contractId: contract.id,
        productType: "OTHER",
        description,
        quantity: 1,
        unitPricePence: 0,
        netPence: 0,
        sortOrder: 0,
      },
    });
  }
  await prisma.customer.update({ where: { id: customerId }, data: { lastUsedAt: new Date() } });
  if (input.emailId) {
    await prisma.inboundEmail.update({
      where: { id: input.emailId },
      data: { customerId, contractId: contract.id, enquiryId: enquiry.id, readAt: new Date() },
    });
  }
  await recordActivity({
    actor,
    contractId: contract.id,
    entityType: "enquiry",
    entityId: enquiry.id,
    kind: "stage",
    body: `opened trade job ${contract.number} from enquiry ${interest}`,
  });
  const linked = await prisma.enquiry.findUniqueOrThrow({ where: { id: enquiry.id } });
  return { customer, enquiry: linked, contract, repeated: previous?.number ?? null };
}
