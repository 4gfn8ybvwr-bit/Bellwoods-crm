import bcrypt from "bcryptjs";
import type { Actor } from "@/domain/permissions";
import { prisma } from "@/lib/prisma";

export async function resetDatabase() {
  await prisma.inboundAttachment.deleteMany();
  await prisma.inboundEmail.deleteMany();
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.document.deleteMany();
  await prisma.labourEntry.deleteMany();
  await prisma.supplierInvoice.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.customerInvoice.deleteMany();
  await prisma.surveyOpening.deleteMany();
  await prisma.surveyMaterial.deleteMany();
  await prisma.task.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.contractLine.deleteMany();
  await prisma.quoteLine.deleteMany();
  await prisma.enquiry.updateMany({ data: { contractId: null } });
  await prisma.contract.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.enquiry.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.address.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.labourPerson.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.user.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.sequence.deleteMany();
  await prisma.setting.deleteMany();
}

const STAGES = [
  ["enquiry", "Enquiry"],
  ["survey-booked", "Survey booked"],
  ["quoted", "Quoted"],
  ["sold", "Sold"],
  ["deposit-stage", "Deposit stage"],
  ["ready-to-order", "Ready to order"],
  ["ordered", "Ordered"],
  ["delivered", "Delivered"],
  ["fit-booked", "Fit booked"],
  ["fitted", "Fitted"],
  ["invoiced", "Invoiced"],
  ["complete", "Complete"],
] as const;

export async function seedReference() {
  await resetDatabase();
  const passwordHash = await bcrypt.hash("test-password", 4);
  const user = await prisma.user.create({
    data: { name: "Test Admin", email: "admin@test.example", role: "ADMIN", passwordHash },
  });
  for (const [index, [slug, name]] of STAGES.entries()) {
    await prisma.stage.create({ data: { slug, name, sortOrder: index + 1, colour: "#234237" } });
  }
  await prisma.sequence.createMany({
    data: [
      { id: "contract", next: 24000 },
      { id: "quote", next: 2000 },
      { id: "po", next: 6000 },
      { id: "invoice", next: 4000 },
    ],
  });
  await prisma.setting.createMany({
    data: [
      { key: "vatRateBps", value: "2000" },
      { key: "invoiceTolerancePence", value: "100" },
      { key: "defaultDepositPercent", value: "25" },
      { key: "financialYearStartMonth", value: "11" },
      { key: "financialYearStartDay", value: "1" },
    ],
  });
  const supplier = await prisma.supplier.create({ data: { name: "Test Frames" } });
  const day = await prisma.labourPerson.create({ data: { name: "Day Fitter", trade: "Fitter", employment: "Subcontractor", rateType: "DAY", ratePence: 20000 } });
  const hour = await prisma.labourPerson.create({ data: { name: "Hour Fitter", trade: "Fitter", employment: "Employed", rateType: "HOUR", ratePence: 1850 } });
  const plasterer = await prisma.labourPerson.create({ data: { name: "Plasterer", trade: "Plasterer", employment: "Subcontractor", rateType: "DAY", ratePence: 25000 } });
  const customer = await prisma.customer.create({ data: { type: "DOMESTIC", name: "Test Household", email: "house@example.com", phone: "07000 000000" } });
  const actor: Actor = {
    userId: user.id,
    apiKeyId: null,
    apiKeyName: null,
    name: user.name,
    role: "ADMIN",
    scopes: ["read", "write", "admin"],
    source: "user",
  };
  return { actor, user, supplier, day, hour, plasterer, customer };
}
