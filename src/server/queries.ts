import { Prisma } from "@prisma/client";
import { ServiceError } from "@/domain/errors";
import { jobCost, recognisedSalesNet } from "@/domain/job-costing";
import { addLondonDays } from "@/domain/dates";
import { financialYearContaining, previousFinancialYear } from "@/domain/financial-year";
import { prisma } from "@/lib/prisma";
import { getSettings } from "./settings";
import { depositPaidFrom } from "./pipeline";
import { readyToOrderGate } from "@/domain/ready-to-order";
import type { Channel } from "@/domain/channel";

const contractCostInclude = {
  customerInvoices: true,
  purchaseOrders: { include: { invoices: true } },
  labourEntries: true,
} satisfies Prisma.ContractInclude;

export function costOf(contract: Prisma.ContractGetPayload<{ include: typeof contractCostInclude }>) {
  return jobCost({
    customerInvoiceNetPence: recognisedSalesNet(contract.customerInvoices),
    purchaseOrders: contract.purchaseOrders.map((po) => ({
      id: po.id,
      number: po.number,
      netPence: po.netPence,
      invoices: po.invoices.map((invoice) => ({ status: invoice.status, netPence: invoice.netPence })),
    })),
    labourCostPence: contract.labourEntries.reduce((sum, entry) => sum + entry.costPence, 0),
  });
}

const detailInclude = {
  customer: { include: { contacts: true, addresses: true } },
  stage: true,
  quote: true,
  lines: { orderBy: { sortOrder: "asc" as const } },
  enquiry: true,
  tasks: { include: { assignedTo: true }, orderBy: { createdAt: "desc" as const } },
  activities: {
    include: { user: true, apiKey: true },
    orderBy: { createdAt: "desc" as const },
    take: 80,
  },
  documents: { orderBy: { createdAt: "desc" as const } },
  surveyOpenings: true,
  surveyMaterials: true,
  purchaseOrders: {
    include: {
      supplier: true,
      lines: { orderBy: { sortOrder: "asc" as const } },
      invoices: { orderBy: { invoiceDate: "desc" as const } },
    },
    orderBy: { createdAt: "desc" as const },
  },
  customerInvoices: { orderBy: { invoiceDate: "asc" as const } },
  labourEntries: { include: { person: true }, orderBy: { workDate: "desc" as const } },
  appointments: { include: { user: true }, orderBy: { startsAt: "asc" as const } },
} satisfies Prisma.ContractInclude;

export async function getContractView(id: string) {
  const contract = await prisma.contract.findFirst({
    where: { OR: [{ id }, { number: id }] },
    include: detailInclude,
  });
  if (!contract) throw new ServiceError(404, "Contract not found");
  const stages = await prisma.stage.findMany({ orderBy: { sortOrder: "asc" } });
  const depositPaid = depositPaidFrom(contract.customerInvoices);
  const ready = readyToOrderGate({
    depositSkipped: contract.depositSkipped,
    depositPaid,
    surveyUploaded: contract.surveyUploaded,
    surveyWaived: contract.surveyWaived,
  });
  const costing = costOf(contract);
  return {
    ...contract,
    documents: contract.documents.map((document) => ({
      id: document.id,
      filename: document.filename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      kind: document.kind,
      createdAt: document.createdAt,
      downloadUrl: `/api/v1/documents/${document.id}/file`,
    })),
    activities: contract.activities.map((activity) => ({
      id: activity.id,
      kind: activity.kind,
      body: activity.body,
      createdAt: activity.createdAt,
      user: activity.user ? { id: activity.user.id, name: activity.user.name } : null,
      apiKey: activity.apiKey ? { id: activity.apiKey.id, name: activity.apiKey.name, prefix: activity.apiKey.prefix } : null,
    })),
    stages,
    depositPaid,
    readyToOrder: ready,
    costing: {
      ...costing,
      agreedSalesPence: contract.salesValuePence,
    },
  };
}

function channelFilter(channel: Channel | "ALL" | undefined): { channel?: Channel } {
  if (!channel || channel === "ALL") return {};
  return { channel };
}

export async function listContracts(filters: { q?: string; stage?: string; type?: string; channel?: Channel | "ALL"; limit?: number; offset?: number }) {
  const where: Prisma.ContractWhereInput = { ...channelFilter(filters.channel) };
  if (filters.stage) where.stage = { slug: filters.stage };
  if (filters.type) where.type = filters.type;
  if (filters.q) {
    where.OR = [
      { number: { contains: filters.q } },
      { siteAddress: { contains: filters.q } },
      { customer: { name: { contains: filters.q } } },
      { customer: { companyName: { contains: filters.q } } },
    ];
  }
  const [total, data] = await Promise.all([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      include: { customer: true, stage: true, customerInvoices: true },
      orderBy: { updatedAt: "desc" },
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
    }),
  ]);
  return { total, data };
}

export async function board(channel: Channel | "ALL" = "ALL") {
  const stages = await prisma.stage.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      contracts: {
        where: channelFilter(channel),
        include: { customer: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  return stages;
}

export async function getDashboard(from: Date, toExclusive: Date, channel: Channel | "ALL" = "ALL") {
  const now = new Date();
  const soon = addLondonDays(now, 14);
  const enquiryWhere = { status: "OPEN" as const, ...channelFilter(channel) };
  const quoteWhere = { status: "SENT" as const, ...channelFilter(channel) };
  const contractWhere = channelFilter(channel);
  const [openEnquiries, quotes, ready, fits, reviews, completed, unmatchedPos] = await Promise.all([
    prisma.enquiry.findMany({
      where: enquiryWhere,
      include: { customer: true, assignedTo: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.quote.findMany({
      where: quoteWhere,
      include: { customer: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.contract.findMany({
      where: { stage: { slug: "ready-to-order" }, ...contractWhere },
      include: { customer: true, stage: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.appointment.findMany({
      where: { type: "FIT", startsAt: { gte: now, lt: soon }, ...(channel === "ALL" ? {} : { contract: { channel } }) },
      include: { customer: true, contract: true, user: true },
      orderBy: { startsAt: "asc" },
      take: 8,
    }),
    prisma.supplierInvoice.findMany({
      where: { status: "PENDING_REVIEW", ...(channel === "ALL" ? {} : { purchaseOrder: { contract: { channel } } }) },
      include: { purchaseOrder: { include: { supplier: true, contract: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.contract.findMany({
      where: { completedAt: { gte: from, lt: toExclusive }, ...contractWhere },
      include: contractCostInclude,
    }),
    prisma.purchaseOrder.findMany({
      where: { invoices: { none: { status: "ACCEPTED" } }, status: { not: "DRAFT" }, ...(channel === "ALL" ? {} : { contract: { channel } }) },
      select: { id: true, number: true, netPence: true, contract: { select: { number: true, type: true } } },
    }),
  ]);

  const buckets = {
    BW: blankBucket(),
    TC: blankBucket(),
    CM: blankBucket(),
  };
  for (const contract of completed) {
    const cost = costOf(contract);
    const key = (contract.type in buckets ? contract.type : "CM") as keyof typeof buckets;
    const bucket = buckets[key];
    bucket.jobs += 1;
    bucket.salesNetPence += cost.salesNetPence;
    bucket.materialNetPence += cost.materialNetPence;
    bucket.labourNetPence += cost.labourNetPence;
    bucket.profitPence += cost.profitPence;
    if (cost.hasUnmatchedPurchaseOrder) bucket.unmatchedJobs += 1;
  }
  const totals = blankBucket();
  for (const bucket of Object.values(buckets)) {
    totals.jobs += bucket.jobs;
    totals.salesNetPence += bucket.salesNetPence;
    totals.materialNetPence += bucket.materialNetPence;
    totals.labourNetPence += bucket.labourNetPence;
    totals.profitPence += bucket.profitPence;
    totals.unmatchedJobs += bucket.unmatchedJobs;
  }
  const withMargin = (bucket: ReturnType<typeof blankBucket>) => ({
    ...bucket,
    margin: bucket.salesNetPence === 0 ? null : bucket.profitPence / bucket.salesNetPence,
  });

  return {
    counts: {
      openEnquiries: await prisma.enquiry.count({ where: enquiryWhere }),
      quotesAwaitingFollowUp: await prisma.quote.count({ where: quoteWhere }),
      readyToOrder: await prisma.contract.count({ where: { stage: { slug: "ready-to-order" }, ...contractWhere } }),
      upcomingFits: await prisma.appointment.count({ where: { type: "FIT", startsAt: { gte: now, lt: soon }, ...(channel === "ALL" ? {} : { contract: { channel } }) } }),
      invoicesAwaitingReview: await prisma.supplierInvoice.count({ where: { status: "PENDING_REVIEW", ...(channel === "ALL" ? {} : { purchaseOrder: { contract: { channel } } }) } }),
    },
    openEnquiries,
    quotesAwaitingFollowUp: quotes,
    readyToOrder: ready,
    upcomingFits: fits,
    invoicesAwaitingReview: reviews,
    profit: {
      from,
      toExclusive,
      byType: {
        BW: withMargin(buckets.BW),
        TC: withMargin(buckets.TC),
        CM: withMargin(buckets.CM),
      },
      total: withMargin(totals),
      unmatchedPurchaseOrders: unmatchedPos,
    },
  };
}

function blankBucket() {
  return { jobs: 0, salesNetPence: 0, materialNetPence: 0, labourNetPence: 0, profitPence: 0, unmatchedJobs: 0 };
}

export async function defaultDashboardRange(which: "current" | "previous" = "current") {
  const settings = await getSettings();
  const today = new Date();
  return which === "previous"
    ? previousFinancialYear(today, settings.financialYearStartMonth, settings.financialYearStartDay)
    : financialYearContaining(today, settings.financialYearStartMonth, settings.financialYearStartDay);
}

export async function listCustomers(q?: string, type?: string) {
  const where: Prisma.CustomerWhereInput = {};
  if (type) where.type = type;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { companyName: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
      { addresses: { some: { postcode: { contains: q } } } },
    ];
  }
  return prisma.customer.findMany({
    where,
    include: { addresses: true, contacts: true, _count: { select: { contracts: true, enquiries: true } } },
    orderBy: { name: "asc" },
  }).then((rows) => rows.map((customer) => ({
    ...customer,
    contacts: customer.contacts.map(({ portalPasswordHash: _hidden, ...contact }) => contact),
  })));
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      addresses: true,
      contacts: true,
      enquiries: { orderBy: { createdAt: "desc" } },
      quotes: { orderBy: { createdAt: "desc" } },
      contracts: { include: { stage: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!customer) throw new ServiceError(404, "Customer not found");
  return {
    ...customer,
    contacts: customer.contacts.map(({ portalPasswordHash: _hidden, ...contact }) => contact),
  };
}
