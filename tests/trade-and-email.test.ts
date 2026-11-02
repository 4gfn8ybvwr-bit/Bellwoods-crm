import { beforeAll, describe, expect, it } from "vitest";
import { BELLWOODS_COMPANY } from "@/domain/company";
import { matchInboundEmail } from "@/domain/email-match";
import { prisma } from "@/lib/prisma";
import { ingestEmail } from "@/server/email/ingest";
import { raiseFinalInvoice } from "@/server/finance";
import { acceptQuote } from "@/server/pipeline";
import { createQuote } from "@/server/sales";
import { quickAddTradeJob } from "@/server/trade";
import { seedReference } from "./fixture";

const actorBase = {
  apiKeyId: null,
  apiKeyName: null,
  role: "ADMIN",
  scopes: ["read", "write", "admin"],
  source: "user" as const,
};

describe("email matching", () => {
  const customers = [
    { id: "c1", email: "buyer@harbour-joinery.example", contactEmails: [] },
    { id: "c2", email: "a@gmail.com", contactEmails: [] },
    { id: "c3", email: "b@gmail.com", contactEmails: [] },
    { id: "c4", email: "adele@northshore.example", contactEmails: ["orders@northshore.example"] },
  ];
  const contracts = [
    { id: "k1", number: "TC23291", customerId: "c1", customerReference: "HJ-88" },
    { id: "k2", number: "TC23305", customerId: "c4", customerReference: "NS-2044" },
  ];

  it("matches a contract number and the sender", () => {
    const match = matchInboundEmail({
      fromEmail: "buyer@harbour-joinery.example",
      subject: "Extra sashes for TC23291",
      body: "Please add them",
      customers,
      contracts,
    });
    expect(match.contractId).toBe("k1");
    expect(match.customerId).toBe("c1");
  });

  it("matches a customer reference and a company domain, but not a public inbox domain", () => {
    const reference = matchInboundEmail({
      fromEmail: "orders@northshore.example",
      subject: "PO NS-2044",
      body: "Book this",
      customers,
      contracts,
    });
    expect(reference.contractId).toBe("k2");
    expect(reference.customerId).toBe("c4");
    const gmail = matchInboundEmail({
      fromEmail: "someone@gmail.com",
      subject: "Windows",
      body: "Hello",
      customers,
      contracts,
    });
    expect(gmail.customerId).toBeNull();
    expect(gmail.contractId).toBeNull();
  });
});

describe("trade quick-add and the single Bellwoods invoice company", () => {
  let fx: Awaited<ReturnType<typeof seedReference>>;

  beforeAll(async () => {
    fx = await seedReference();
  });

  it("creates the lead and a trade contract, and can repeat the last job", async () => {
    const first = await quickAddTradeJob(fx.actor, {
      newCustomer: { companyName: "Plotline Homes Ltd", contactName: "Nina Plot", email: "nina@plotline.example", phone: "0191 000 1111", city: "Sunderland", postcode: "SR2 0PL" },
      jobType: "Supply and fit",
      description: "Plot 3 anthracite casements",
      customerReference: "PL-3",
    });
    expect(first.contract.type).toBe("TC");
    expect(first.contract.channel).toBe("TRADE");
    expect(first.contract.depositSkipped).toBe(true);
    expect(first.contract.number.startsWith("TC")).toBe(true);
    expect(first.enquiry.channel).toBe("TRADE");
    expect(first.enquiry.contractId).toBe(first.contract.id);
    expect(first.enquiry.productInterest).toContain("Plot 3");

    const repeat = await quickAddTradeJob(fx.actor, {
      customerId: first.customer.id,
      jobType: "Supply and fit",
      repeatLast: true,
      customerReference: "PL-4",
    });
    expect(repeat.contract.id).not.toBe(first.contract.id);
    expect(repeat.contract.notes).toContain("Plot 3");
    expect(repeat.enquiry.id).not.toBe(first.enquiry.id);
    expect(repeat.repeated).toBe(first.contract.number);
  });

  it("raises trade and Bellwoods invoices under one company and one number sequence", async () => {
    const tradeCustomer = await prisma.customer.findFirstOrThrow({ where: { companyName: "Plotline Homes Ltd" } });
    const tradeJob = await prisma.contract.findFirstOrThrow({ where: { customerId: tradeCustomer.id } });
    await prisma.contract.update({ where: { id: tradeJob.id }, data: { salesValuePence: 200000 } });
    const tradeInvoice = await raiseFinalInvoice(fx.actor, tradeJob.id);

    const quote = await createQuote(fx.actor, {
      customerId: fx.customer.id,
      lines: [{ productType: "WINDOW", description: "Retail window", quantity: 1, unitPricePence: 100000 }],
    });
    const accepted = await acceptQuote(fx.actor, quote.id, { type: "BW", depositPercent: 25 });
    const retailInvoice = await prisma.customerInvoice.findFirstOrThrow({ where: { contractId: accepted.contract.id, type: "DEPOSIT" } });

    expect(tradeInvoice.companyLegalName).toBe(BELLWOODS_COMPANY.legalName);
    expect(retailInvoice.companyLegalName).toBe(BELLWOODS_COMPANY.legalName);
    expect(tradeInvoice.companyVatNumber).toBe(BELLWOODS_COMPANY.vatNumber);
    expect(retailInvoice.companyVatNumber).toBe(tradeInvoice.companyVatNumber);
    expect(tradeInvoice.number).not.toBe(retailInvoice.number);
    const numbers = [tradeInvoice.number, retailInvoice.number].map((number) => Number(number.replace("INV-", "")));
    expect(Math.abs(numbers[0] - numbers[1])).toBe(1);
  });

  it("files an inbound email against the customer and the job", async () => {
    const email = await ingestEmail({ ...fx.actor, ...actorBase, name: fx.actor.name, userId: fx.actor.userId }, {
      fromName: "Nina Plot",
      fromEmail: "nina@plotline.example",
      subject: "Update on PL-3",
      bodyText: "Please use reference PL-3",
      source: "API",
      messageId: "<test-plotline@example>",
    });
    const contract = await prisma.contract.findFirstOrThrow({ where: { customerReference: "PL-3" } });
    expect(email.customerId).toBe(contract.customerId);
    expect(email.contractId).toBe(contract.id);
  });
});
