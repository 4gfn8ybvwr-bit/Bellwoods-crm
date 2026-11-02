import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { londonToUtc } from "../src/domain/dates";
import { loadEnvFile } from "../src/lib/env";

function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

loadEnvFile();

const prisma = new PrismaClient();
const PASSWORD = "Bellwoods-demo-2026";
const READ_WRITE_KEY = "bw_live_rw_demo_bellwoods";
const READ_ONLY_KEY = "bw_live_ro_demo_bellwoods";

function at(y: number, m: number, d: number, hh = 12, mm = 0) {
  return londonToUtc(y, m, d, hh, mm);
}

async function wipe() {
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

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0 && process.env.SEED_FORCE !== "1") {
    console.log("Database already has users. Run npm run db:reset to load the demo again.");
    return;
  }
  if (existing > 0) await wipe();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [david, sarah, helen, tom] = await Promise.all([
    prisma.user.create({ data: { name: "David Bell", email: "david@bellwoods.example", role: "ADMIN", passwordHash } }),
    prisma.user.create({ data: { name: "Sarah Quinn", email: "sarah.quinn@bellwoods.example", role: "SALES", passwordHash } }),
    prisma.user.create({ data: { name: "Helen Crowe", email: "helen.crowe@bellwoods.example", role: "OFFICE", passwordHash } }),
    prisma.user.create({ data: { name: "Tom Adeyemi", email: "tom.adeyemi@bellwoods.example", role: "FITTER", passwordHash } }),
  ]);

  await prisma.apiKey.createMany({
    data: [
      { name: "Demo read-write", prefix: READ_WRITE_KEY.slice(0, 16), keyHash: hashApiKey(READ_WRITE_KEY), scopes: "read,write", createdById: david.id },
      { name: "Demo read-only", prefix: READ_ONLY_KEY.slice(0, 16), keyHash: hashApiKey(READ_ONLY_KEY), scopes: "read", createdById: david.id },
    ],
  });

  const stages = [
    ["enquiry", "Enquiry", "#8d8a82"],
    ["survey-booked", "Survey booked", "#6d7f8a"],
    ["quoted", "Quoted", "#3d6f8f"],
    ["sold", "Sold", "#1f6b4a"],
    ["deposit-stage", "Deposit stage", "#8a5a12"],
    ["ready-to-order", "Ready to order", "#b5521a"],
    ["ordered", "Ordered", "#7a3e2e"],
    ["delivered", "Delivered", "#3f5c4e"],
    ["fit-booked", "Fit booked", "#245c78"],
    ["fitted", "Fitted", "#1d4e3a"],
    ["invoiced", "Invoiced", "#5c4d7a"],
    ["complete", "Complete", "#1b2e26"],
  ];
  const stageId: Record<string, string> = {};
  for (const [index, [slug, name, colour]] of stages.entries()) {
    const stage = await prisma.stage.create({ data: { slug, name, colour, sortOrder: index + 1 } });
    stageId[slug] = stage.id;
  }

  await prisma.sequence.createMany({
    data: [
      { id: "contract", next: 23320 },
      { id: "quote", next: 1100 },
      { id: "po", next: 5100 },
      { id: "invoice", next: 3200 },
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

  const [derek, liam, paul] = await Promise.all([
    prisma.labourPerson.create({ data: { name: "Derek Walsh", trade: "Fitter", employment: "Subcontractor", rateType: "DAY", ratePence: 20000, notes: "Regular subcontractor crew." } }),
    prisma.labourPerson.create({ data: { name: "Liam Hart", trade: "Apprentice", employment: "Employed", rateType: "WEEK", ratePence: 52000, notes: "Weekly wage, costed over a five-day week." } }),
    prisma.labourPerson.create({ data: { name: "Tom Adeyemi", trade: "Fitter", employment: "Employed", rateType: "HOUR", ratePence: 1850 } }),
    prisma.labourPerson.create({ data: { name: "Paul Nesbitt", trade: "Plasterer", employment: "Subcontractor", rateType: "DAY", ratePence: 25000 } }),
  ]);
  const tomFitter = await prisma.labourPerson.findFirstOrThrow({ where: { name: "Tom Adeyemi" } });
  const paulPerson = await prisma.labourPerson.findFirstOrThrow({ where: { name: "Paul Nesbitt" } });

  const [camden, glasscraft, portico, eurocell] = await Promise.all([
    prisma.supplier.create({ data: { name: "Camden Group", accountRef: "BELL-014", phone: "0191 496 0100", email: "orders@camden.example", notes: "Main uPVC windows and doors." } }),
    prisma.supplier.create({ data: { name: "Glasscraft Glass", accountRef: "BW-22", phone: "0191 496 2200", email: "sales@glasscraft.example", notes: "Sealed units." } }),
    prisma.supplier.create({ data: { name: "Portico", accountRef: "P-7781", phone: "0191 496 3300", email: "trade@portico.example", notes: "Composite doors and slabs." } }),
    prisma.supplier.create({ data: { name: "Eurocell", accountRef: "EC-1904", phone: "0191 496 4400", email: "branch@eurocell.example", notes: "Trims, ventilation and ancillaries." } }),
  ]);

  async function customer(data: {
    type: string;
    name: string;
    companyName?: string;
    email: string;
    phone: string;
    line1: string;
    city: string;
    postcode: string;
    contactName?: string;
  }) {
    return prisma.customer.create({
      data: {
        type: data.type,
        name: data.name,
        companyName: data.companyName ?? "",
        email: data.email,
        phone: data.phone,
        addresses: { create: { label: "Home", line1: data.line1, city: data.city, county: "Tyne and Wear", postcode: data.postcode, isPrimary: true } },
        contacts: data.contactName ? { create: { name: data.contactName, phone: data.phone, email: data.email, isPrimary: true, role: "Buyer" } } : undefined,
      },
      include: { addresses: true },
    });
  }

  const ellen = await customer({ type: "DOMESTIC", name: "Ellen Frost", email: "ellen.frost@example.com", phone: "07700 900121", line1: "18 Prior's Terrace", city: "Tynemouth", postcode: "NE30 4BW" });
  const harbour = await customer({ type: "TRADE", name: "Chris Harbour", companyName: "Harbour Joinery Ltd", email: "chris@harbour-joinery.example", phone: "0191 496 1188", line1: "Unit 2, Riverwear Workshops", city: "Sunderland", postcode: "SR1 2TC", contactName: "Chris Harbour" });
  const nora = await customer({ type: "DOMESTIC", name: "Nora Bennett", email: "nora.bennett@example.com", phone: "07700 900188", line1: "4 Percy Street", city: "Tynemouth", postcode: "NE30 4NB" });
  const priya = await customer({ type: "DOMESTIC", name: "Priya Shah", email: "priya.shah@example.com", phone: "07700 900214", line1: "22 Elvet Crescent", city: "Durham", postcode: "DH1 3PS" });
  const northshore = await customer({ type: "TRADE", name: "Adele North", companyName: "Northshore Developments Ltd", email: "adele@northshore.example", phone: "0191 496 7700", line1: "Unit 4, Felling Court", city: "Gateshead", postcode: "NE10 0NS", contactName: "Adele North" });
  const samuel = await customer({ type: "DOMESTIC", name: "Samuel Adebanjo", email: "samuel.adebanjo@example.com", phone: "07700 900301", line1: "5 Saltwell Road", city: "Gateshead", postcode: "NE8 4SA" });
  const claire = await customer({ type: "DOMESTIC", name: "Claire Donnelly", email: "claire.donnelly@example.com", phone: "07700 900418", line1: "41 Church Avenue", city: "Gosforth", postcode: "NE3 1CD" });
  const owen = await customer({ type: "DOMESTIC", name: "Owen Blake", email: "owen.blake@example.com", phone: "07700 900512", line1: "9 Village Lane", city: "Washington", postcode: "NE38 7OB" });
  const riverside = await customer({ type: "TRADE", name: "Megan Shaw", companyName: "Riverside Lettings", email: "megan@riverside-lettings.example", phone: "0191 496 9090", line1: "12 Quayside House", city: "Newcastle upon Tyne", postcode: "NE1 3RL", contactName: "Megan Shaw" });
  const calder = await customer({ type: "DOMESTIC", name: "James Calder", email: "james.calder@example.com", phone: "07700 900640", line1: "8 Harbour View", city: "Whitley Bay", postcode: "NE26 1JC" });
  const margaret = await customer({ type: "DOMESTIC", name: "Margaret Ellison", email: "margaret.ellison@example.com", phone: "07700 900701", line1: "14 Oakdene Terrace", city: "Jesmond", postcode: "NE2 2ME" });
  const helenPark = await customer({ type: "DOMESTIC", name: "Helen Park", email: "helen.park@example.com", phone: "07700 900812", line1: "3 Holly Avenue", city: "Whitley Bay", postcode: "NE26 3HP" });
  const ruth = await customer({ type: "DOMESTIC", name: "Ruth Kenyon", email: "ruth.kenyon@example.com", phone: "07700 900903", line1: "27 Dene Road", city: "South Shields", postcode: "NE33 2RK" });
  const iain = await customer({ type: "DOMESTIC", name: "Iain Moss", email: "iain.moss@example.com", phone: "07700 900155", line1: "6 West Avenue", city: "Gosforth", postcode: "NE3 4IM" });

  async function contract(input: {
    number: string;
    type: string;
    customerId: string;
    stage: string;
    site: string;
    sales: number;
    customerReference?: string;
    depositPercent?: number;
    depositSkipped?: boolean;
    survey?: boolean;
    soldAt?: Date | null;
    completedAt?: Date | null;
    quoteId?: string | null;
    lines?: { productType: string; description: string; widthMm?: number; heightMm?: number; specification?: string; quantity?: number; unitPricePence: number }[];
  }) {
    const created = await prisma.contract.create({
      data: {
        number: input.number,
        type: input.type,
        customerId: input.customerId,
        stageId: stageId[input.stage],
        siteAddress: input.site,
        salesValuePence: input.sales,
        channel: input.type === "TC" ? "TRADE" : "BELLWOODS",
        customerReference: input.customerReference ?? "",
        depositPercent: input.depositPercent ?? 25,
        depositSkipped: input.depositSkipped ?? false,
        surveyUploaded: input.survey ?? false,
        soldAt: input.soldAt ?? null,
        completedAt: input.completedAt ?? null,
        quoteId: input.quoteId ?? null,
        fittersNeeded: 2,
        lines: input.lines
          ? {
              create: input.lines.map((line, index) => ({
                productType: line.productType,
                description: line.description,
                widthMm: line.widthMm ?? null,
                heightMm: line.heightMm ?? null,
                specification: line.specification ?? "",
                quantity: line.quantity ?? 1,
                unitPricePence: line.unitPricePence,
                netPence: (line.quantity ?? 1) * line.unitPricePence,
                sortOrder: index,
              })),
            }
          : undefined,
      },
    });
    if (input.survey) {
      const dir = path.join(process.cwd(), "data", "uploads", created.id);
      await mkdir(dir, { recursive: true });
      const storagePath = path.join(dir, "survey.txt");
      await writeFile(storagePath, `Survey sheet for ${input.number}. Fictional demo file.\n`);
      await prisma.document.create({
        data: { contractId: created.id, filename: `${input.number}-survey.txt`, mimeType: "text/plain", sizeBytes: 48, storagePath, kind: "SURVEY", uploadedById: helen.id },
      });
    }
    return created;
  }

  async function invoice(input: { number: string; contractId: string; type: string; date: Date; net: number; status?: string; paidAt?: Date | null }) {
    const vat = Math.round(input.net * 0.2);
    return prisma.customerInvoice.create({
      data: {
        number: input.number,
        contractId: input.contractId,
        type: input.type,
        invoiceDate: input.date,
        netPence: input.net,
        vatPence: vat,
        grossPence: input.net + vat,
        status: input.status ?? "UNPAID",
        paidAt: input.paidAt ?? null,
        companyLegalName: "Bellwoods Windows and Doors Ltd",
        companyVatNumber: "GB000000000",
        xeroStatus: "NOT_SYNCED",
      },
    });
  }

  async function po(input: {
    number: string;
    contractId: string;
    supplierId: string;
    status: string;
    net: number;
    description: string;
    reference?: string;
    remake?: boolean;
    reason?: string;
    orderedAt?: Date;
    deliveredAt?: Date;
  }) {
    return prisma.purchaseOrder.create({
      data: {
        number: input.number,
        contractId: input.contractId,
        supplierId: input.supplierId,
        status: input.status,
        netPence: input.net,
        supplierReference: input.reference ?? "",
        remake: input.remake ?? false,
        remakeReason: input.reason ?? "",
        orderedAt: input.orderedAt,
        deliveredAt: input.deliveredAt,
        lines: { create: [{ description: input.description, quantity: 1, unitPricePence: input.net, netPence: input.net, sortOrder: 0 }] },
      },
    });
  }

  async function supplierInvoice(input: { poId: string; number: string; date: Date; net: number; poNet: number; nominal?: string; status?: string }) {
    const variance = input.net - input.poNet;
    const vat = Math.round(input.net * 0.2);
    return prisma.supplierInvoice.create({
      data: {
        purchaseOrderId: input.poId,
        invoiceNumber: input.number,
        invoiceDate: input.date,
        netPence: input.net,
        vatPence: vat,
        grossPence: input.net + vat,
        nominalCode: input.nominal ?? "5000",
        status: input.status ?? (Math.abs(variance) > 100 ? "PENDING_REVIEW" : "ACCEPTED"),
        variancePence: variance,
      },
    });
  }

  const ellenJob = await contract({
    number: "BW23290",
    type: "BW",
    customerId: ellen.id,
    stage: "complete",
    site: "18 Prior's Terrace, Tynemouth, NE30 4BW",
    sales: 500000,
    survey: true,
    soldAt: at(2026, 3, 10),
    completedAt: at(2026, 3, 20),
    lines: [
      { productType: "WINDOW", description: "Rear bedroom casement", widthMm: 1200, heightMm: 1050, specification: "White uPVC, A-rated, argon", unitPricePence: 87500, quantity: 2 },
      { productType: "WINDOW", description: "Bay window, lounge", widthMm: 2400, heightMm: 1400, specification: "White uPVC, trickle vents", unitPricePence: 210000 },
      { productType: "DOOR", description: "Composite front door", widthMm: 920, heightMm: 2060, specification: "Anthracite grey, chrome furniture", unitPricePence: 115000 },
    ],
  });
  await invoice({ number: "INV-3001", contractId: ellenJob.id, type: "DEPOSIT", date: at(2026, 3, 10), net: 125000, status: "PAID", paidAt: at(2026, 3, 12) });
  await invoice({ number: "INV-3002", contractId: ellenJob.id, type: "FINAL", date: at(2026, 3, 18), net: 375000, status: "PAID", paidAt: at(2026, 3, 19) });
  const ellenPo1 = await po({ number: "PO-5001", contractId: ellenJob.id, supplierId: camden.id, status: "DELIVERED", net: 215000, description: "Frames and sashes", reference: "CG-88421", orderedAt: at(2026, 3, 11), deliveredAt: at(2026, 3, 16) });
  const ellenPo2 = await po({ number: "PO-5002", contractId: ellenJob.id, supplierId: glasscraft.id, status: "DELIVERED", net: 48000, description: "Sealed units", reference: "GG-1902", orderedAt: at(2026, 3, 11), deliveredAt: at(2026, 3, 16), });
  await supplierInvoice({ poId: ellenPo1.id, number: "CG-INV-44110", date: at(2026, 3, 17), net: 215000, poNet: 215000 });
  await supplierInvoice({ poId: ellenPo2.id, number: "GG-INV-2291", date: at(2026, 3, 17), net: 48000, poNet: 48000, nominal: "5005" });
  await prisma.labourEntry.createMany({
    data: [
      { contractId: ellenJob.id, personId: derek.id, workDate: at(2026, 3, 18), days: 2, hours: 0, costPence: 40000, notes: "Two days, two-person crew lead." },
      { contractId: ellenJob.id, personId: tomFitter.id, workDate: at(2026, 3, 18), days: 0, hours: 6, costPence: 11100 },
      { contractId: ellenJob.id, personId: paulPerson.id, workDate: at(2026, 3, 19), days: 1, hours: 0, costPence: 25000, notes: "Making good after the bay." },
    ],
  });
  await prisma.surveyOpening.createMany({
    data: [
      { contractId: ellenJob.id, location: "Rear bedroom", productType: "WINDOW", widthMm: 1200, heightMm: 1050, specification: "White casement", notes: "" },
      { contractId: ellenJob.id, location: "Lounge bay", productType: "WINDOW", widthMm: 2400, heightMm: 1400, specification: "Three-section bay", notes: "Builder to form the opening" },
      { contractId: ellenJob.id, location: "Front door", productType: "DOOR", widthMm: 920, heightMm: 2060, specification: "Composite", notes: "" },
    ],
  });
  await prisma.surveyMaterial.createMany({
    data: [
      { contractId: ellenJob.id, description: "18mm white fascia", quantity: "6", unit: "m" },
      { contractId: ellenJob.id, description: "Sill extension", quantity: "2", unit: "" },
    ],
  });
  await prisma.contract.update({ where: { id: ellenJob.id }, data: { fittersNeeded: 2, fittersNotes: "Bay needs a plasterer the day after the fit.", externalWorks: "Plasterer and a builder to form the bay opening." } });

  const harbourJob = await contract({
    number: "TC23291",
    type: "TC",
    customerId: harbour.id,
    stage: "complete",
    site: "Plot 6, Riverwear Workshops, Sunderland, SR1 2TC",
    sales: 840000,
    depositPercent: 25,
    survey: true,
    soldAt: at(2026, 5, 2),
    completedAt: at(2026, 6, 12),
    lines: [{ productType: "WINDOW", description: "Trade package, plot 6", specification: "Anthracite uPVC", unitPricePence: 840000 }],
  });
  await invoice({ number: "INV-3010", contractId: harbourJob.id, type: "DEPOSIT", date: at(2026, 5, 2), net: 210000, status: "PAID", paidAt: at(2026, 5, 6) });
  await invoice({ number: "INV-3011", contractId: harbourJob.id, type: "FINAL", date: at(2026, 6, 10), net: 630000, status: "PAID", paidAt: at(2026, 6, 12) });
  const h1 = await po({ number: "PO-5010", contractId: harbourJob.id, supplierId: camden.id, status: "DELIVERED", net: 460000, description: "Plot 6 frames", reference: "CG-89002", orderedAt: at(2026, 5, 4), deliveredAt: at(2026, 6, 2) });
  const h2 = await po({ number: "PO-5011", contractId: harbourJob.id, supplierId: glasscraft.id, status: "DELIVERED", net: 50000, description: "Plot 6 units", reference: "GG-2011", orderedAt: at(2026, 5, 4), deliveredAt: at(2026, 6, 2) });
  await supplierInvoice({ poId: h1.id, number: "CG-INV-45002", date: at(2026, 6, 4), net: 460000, poNet: 460000 });
  await supplierInvoice({ poId: h2.id, number: "GG-INV-2400", date: at(2026, 6, 4), net: 50000, poNet: 50000, nominal: "5005" });
  await prisma.labourEntry.create({ data: { contractId: harbourJob.id, personId: derek.id, workDate: at(2026, 6, 8), days: 5, costPence: 100000, notes: "Five days on site." } });

  const noraJob = await contract({
    number: "BW23318",
    type: "BW",
    customerId: nora.id,
    stage: "complete",
    site: "4 Percy Street, Tynemouth, NE30 4NB",
    sales: 60000,
    depositSkipped: true,
    depositPercent: 0,
    survey: true,
    soldAt: at(2026, 10, 28),
    completedAt: at(2026, 11, 1, 16, 0),
    lines: [{ productType: "SEALED_UNIT", description: "Failed unit, kitchen", widthMm: 620, heightMm: 740, specification: "Low-E, argon", unitPricePence: 60000 }],
  });
  await invoice({ number: "INV-3118", contractId: noraJob.id, type: "FINAL", date: at(2026, 11, 1), net: 60000, status: "PAID", paidAt: at(2026, 11, 1, 16) });
  const noraPo = await po({ number: "PO-5088", contractId: noraJob.id, supplierId: portico.id, status: "DELIVERED", net: 18000, description: "Replacement sealed unit", reference: "POR-118", orderedAt: at(2026, 10, 29), deliveredAt: at(2026, 11, 1) });
  await supplierInvoice({ poId: noraPo.id, number: "POR-9911", date: at(2026, 11, 1), net: 18000, poNet: 18000 });
  await prisma.labourEntry.create({ data: { contractId: noraJob.id, personId: derek.id, workDate: at(2026, 11, 1), days: 1, costPence: 20000 } });

  const priyaQuote = await prisma.quote.create({
    data: {
      number: "Q-1040",
      customerId: priya.id,
      status: "ACCEPTED",
      netPence: 640000,
      vatPence: 128000,
      grossPence: 768000,
      createdById: sarah.id,
      lines: { create: [{ productType: "WINDOW", description: "Full house white uPVC", specification: "A-rated", quantity: 1, unitPricePence: 640000, netPence: 640000, sortOrder: 0 }] },
    },
  });
  const priyaJob = await contract({
    number: "BW23297",
    type: "BW",
    customerId: priya.id,
    stage: "deposit-stage",
    site: "22 Elvet Crescent, Durham, DH1 3PS",
    sales: 640000,
    survey: false,
    soldAt: at(2026, 10, 20),
    quoteId: priyaQuote.id,
    lines: [{ productType: "WINDOW", description: "Full house white uPVC", specification: "A-rated", unitPricePence: 640000 }],
  });
  await invoice({ number: "INV-3090", contractId: priyaJob.id, type: "DEPOSIT", date: at(2026, 10, 20), net: 160000, status: "UNPAID" });
  await prisma.task.create({ data: { contractId: priyaJob.id, title: "Chase Priya's deposit", dueDate: at(2026, 11, 4), assignedToId: sarah.id, createdById: helen.id } });

  const northJob = await contract({
    number: "TC23305",
    type: "TC",
    customerId: northshore.id,
    stage: "ready-to-order",
    site: "Block B, Felling Court, Gateshead, NE10 0NS",
    sales: 1125000,
    customerReference: "NS-2044",
    depositSkipped: true,
    depositPercent: 0,
    survey: true,
    soldAt: at(2026, 10, 22),
    lines: [{ productType: "WINDOW", description: "Block B trade package", specification: "Anthracite", unitPricePence: 1125000 }],
  });
  await prisma.contract.update({ where: { id: northJob.id }, data: { fittersNotes: "Trade account, deposit waived by David.", externalWorks: "None. Openings already formed.", fittersNeeded: 3 } });

  const samuelJob = await contract({
    number: "BW23308",
    type: "BW",
    customerId: samuel.id,
    stage: "ordered",
    site: "5 Saltwell Road, Gateshead, NE8 4SA",
    sales: 410000,
    survey: true,
    soldAt: at(2026, 10, 8),
    lines: [{ productType: "DOOR", description: "French doors", widthMm: 1800, heightMm: 2100, specification: "White, integral blinds", unitPricePence: 410000 }],
  });
  await invoice({ number: "INV-3094", contractId: samuelJob.id, type: "DEPOSIT", date: at(2026, 10, 8), net: 102500, status: "PAID", paidAt: at(2026, 10, 9) });
  const sam1 = await po({ number: "PO-5060", contractId: samuelJob.id, supplierId: camden.id, status: "SENT", net: 240000, description: "French door frame", reference: "CG-90110", orderedAt: at(2026, 10, 15) });
  const sam2 = await po({ number: "PO-5061", contractId: samuelJob.id, supplierId: glasscraft.id, status: "SENT", net: 36000, description: "Sealed units", reference: "GG-3104", orderedAt: at(2026, 10, 15) });
  const sam3 = await po({ number: "PO-5062", contractId: samuelJob.id, supplierId: eurocell.id, status: "SENT", net: 0, description: "Remake trims", reference: "EC-remake-19", remake: true, reason: "Scratch on the sash during delivery", orderedAt: at(2026, 10, 18) });
  await supplierInvoice({ poId: sam2.id, number: "GG-INV-3104", date: at(2026, 10, 28), net: 42000, poNet: 36000, nominal: "5005" });
  await supplierInvoice({ poId: sam3.id, number: "EC-INV-19", date: at(2026, 10, 29), net: 4800, poNet: 0, nominal: "5010" });
  void sam1;

  const claireJob = await contract({
    number: "BW23311",
    type: "BW",
    customerId: claire.id,
    stage: "fit-booked",
    site: "41 Church Avenue, Gosforth, NE3 1CD",
    sales: 320000,
    survey: true,
    soldAt: at(2026, 9, 14),
    lines: [{ productType: "WINDOW", description: "Three casements", specification: "White", unitPricePence: 320000 }],
  });
  await invoice({ number: "INV-3088", contractId: claireJob.id, type: "DEPOSIT", date: at(2026, 9, 14), net: 80000, status: "PAID", paidAt: at(2026, 9, 16) });
  const clairePo = await po({ number: "PO-5070", contractId: claireJob.id, supplierId: camden.id, status: "DELIVERED", net: 140000, description: "Casement frames", reference: "CG-89990", orderedAt: at(2026, 9, 20), deliveredAt: at(2026, 10, 24) });
  await supplierInvoice({ poId: clairePo.id, number: "CG-INV-47020", date: at(2026, 10, 26), net: 140000, poNet: 140000 });
  await prisma.appointment.create({
    data: {
      customerId: claire.id,
      contractId: claireJob.id,
      userId: tom.id,
      type: "FIT",
      title: "Fit · BW23311",
      startsAt: at(2026, 11, 6, 8, 30),
      endsAt: at(2026, 11, 6, 16, 30),
      location: "41 Church Avenue, Gosforth",
    },
  });

  const owenJob = await contract({
    number: "BW23316",
    type: "BW",
    customerId: owen.id,
    stage: "ready-to-order",
    site: "9 Village Lane, Washington, NE38 7OB",
    sales: 215000,
    survey: true,
    soldAt: at(2026, 10, 27),
    lines: [{ productType: "BIFOLD", description: "Three-pane bi-fold", widthMm: 2100, heightMm: 2100, specification: "Anthracite", unitPricePence: 215000 }],
  });
  await invoice({ number: "INV-3102", contractId: owenJob.id, type: "DEPOSIT", date: at(2026, 10, 27), net: 53750, status: "PAID", paidAt: at(2026, 10, 28) });

  await contract({
    number: "CM23312",
    type: "CM",
    customerId: riverside.id,
    stage: "survey-booked",
    site: "Flat 2, Quayside House, Newcastle upon Tyne, NE1 3RL",
    sales: 0,
    depositSkipped: false,
    lines: [],
  });
  await prisma.appointment.create({
    data: {
      customerId: riverside.id,
      userId: sarah.id,
      type: "SURVEY",
      title: "Survey · Riverside Lettings",
      startsAt: at(2026, 11, 5, 11, 0),
      endsAt: at(2026, 11, 5, 12, 0),
      location: "Flat 2, Quayside House",
    },
  });

  const calderQuote = await prisma.quote.create({
    data: {
      number: "Q-1052",
      customerId: calder.id,
      status: "SENT",
      netPence: 468000,
      vatPence: 93600,
      grossPence: 561600,
      validUntil: at(2026, 11, 20),
      createdById: sarah.id,
      notes: "Follow up after the weekend.",
      lines: { create: [{ productType: "PATIO", description: "Patio doors", widthMm: 1800, heightMm: 2100, specification: "White, midrail", quantity: 1, unitPricePence: 468000, netPence: 468000, sortOrder: 0 }] },
    },
  });
  const calderJob = await contract({
    number: "BW23314",
    type: "BW",
    customerId: calder.id,
    stage: "quoted",
    site: "8 Harbour View, Whitley Bay, NE26 1JC",
    sales: 0,
    lines: [],
  });
  await prisma.enquiry.create({
    data: { customerId: calder.id, source: "Showroom", productInterest: "Patio doors", status: "QUOTED", assignedToId: sarah.id, contractId: calderJob.id },
  });

  await prisma.quote.create({
    data: {
      number: "Q-1058",
      customerId: ruth.id,
      status: "SENT",
      netPence: 189000,
      vatPence: 37800,
      grossPence: 226800,
      validUntil: at(2026, 11, 18),
      createdById: sarah.id,
      lines: { create: [{ productType: "DOOR", description: "Composite back door", widthMm: 900, heightMm: 2050, specification: "Blue, silver bar", quantity: 1, unitPricePence: 189000, netPence: 189000, sortOrder: 0 }] },
    },
  });

  await prisma.enquiry.create({ data: { customerId: margaret.id, source: "Website", productInterest: "Front and rear windows", status: "OPEN", assignedToId: sarah.id, notes: "Asked about a bay in the lounge." } });
  await prisma.enquiry.create({ data: { customerId: helenPark.id, source: "Phone", productInterest: "Composite front door", status: "OPEN", assignedToId: sarah.id } });
  await prisma.enquiry.create({ data: { customerId: harbour.id, source: "Trade account", productInterest: "Plot 8 windows", status: "OPEN", channel: "TRADE", assignedToId: sarah.id, notes: "Second plot after TC23291." } });
  await prisma.customer.update({ where: { id: harbour.id }, data: { lastUsedAt: at(2026, 10, 30, 9) } });
  await prisma.customer.update({ where: { id: northshore.id }, data: { lastUsedAt: at(2026, 10, 28, 15) } });

  const iainJob = await contract({
    number: "BW23317",
    type: "BW",
    customerId: iain.id,
    stage: "fit-booked",
    site: "6 West Avenue, Gosforth, NE3 4IM",
    sales: 150000,
    survey: true,
    soldAt: at(2026, 10, 2),
    lines: [{ productType: "WINDOW", description: "Landing window", widthMm: 900, heightMm: 1200, unitPricePence: 150000 }],
  });
  await invoice({ number: "INV-3108", contractId: iainJob.id, type: "DEPOSIT", date: at(2026, 10, 2), net: 37500, status: "PAID", paidAt: at(2026, 10, 3) });
  const iainPo = await po({ number: "PO-5077", contractId: iainJob.id, supplierId: camden.id, status: "DELIVERED", net: 62000, description: "Landing casement", reference: "CG-90220", orderedAt: at(2026, 10, 6), deliveredAt: at(2026, 10, 30) });
  await supplierInvoice({ poId: iainPo.id, number: "CG-INV-47110", date: at(2026, 10, 31), net: 62000, poNet: 62000 });
  await prisma.appointment.create({
    data: {
      customerId: iain.id,
      contractId: iainJob.id,
      userId: tom.id,
      type: "FIT",
      title: "Fit · BW23317",
      startsAt: at(2026, 11, 12, 8, 0),
      endsAt: at(2026, 11, 12, 16, 0),
      location: "6 West Avenue, Gosforth",
    },
  });

  await prisma.activity.createMany({
    data: [
      { contractId: ellenJob.id, entityType: "contract", entityId: ellenJob.id, kind: "stage", body: "Helen Crowe moved BW23290 to Complete", userId: helen.id, createdAt: at(2026, 3, 20, 16) },
      { contractId: priyaJob.id, entityType: "contract", entityId: priyaJob.id, kind: "note", body: "Sarah Quinn noted: Priya wants to pay the deposit by bank transfer", userId: sarah.id, createdAt: at(2026, 10, 21, 9) },
      { contractId: samuelJob.id, entityType: "supplier_invoice", entityId: samuelJob.id, kind: "invoice", body: "Helen Crowe recorded supplier invoice GG-INV-3104 for review (variance against PO-5061)", userId: helen.id, createdAt: at(2026, 10, 28, 15) },
      { contractId: northJob.id, entityType: "contract", entityId: northJob.id, kind: "stage", body: "David Bell moved TC23305 to Ready to order", userId: david.id, createdAt: at(2026, 10, 24, 11) },
    ],
  });

  const orderMail = await prisma.inboundEmail.create({
    data: {
      fromName: "Chris Harbour",
      fromEmail: "chris@harbour-joinery.example",
      subject: "Extra sashes for TC23291",
      bodyText: "Can you add two obscure sashes to TC23291 at Riverwear? Our reference HJ-88.",
      receivedAt: at(2026, 11, 2, 8, 15),
      source: "SEED",
      customerId: harbour.id,
      contractId: harbourJob.id,
      matchNotes: "Matched contract TC23291 in the message. Matched the sender email address",
      messageId: "<seed-harbour@example>",
    },
  });
  const dir = path.join(process.cwd(), "data", "uploads", "email", orderMail.id);
  await mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, "sketch.txt");
  await writeFile(storagePath, "Fictional sketch note for the extra sashes.\n");
  await prisma.inboundAttachment.create({
    data: { emailId: orderMail.id, filename: "sketch.txt", mimeType: "text/plain", sizeBytes: 46, storagePath },
  });
  await prisma.inboundEmail.create({
    data: {
      fromName: "Ellen Frost",
      fromEmail: "ellen.frost@example.com",
      subject: "Thank you BW23290",
      bodyText: "The bay looks right. Nothing else needed on BW23290.",
      receivedAt: at(2026, 11, 1, 18, 0),
      source: "SEED",
      customerId: ellen.id,
      contractId: ellenJob.id,
      matchNotes: "Matched contract BW23290 in the message",
      readAt: at(2026, 11, 1, 18, 30),
      messageId: "<seed-ellen@example>",
    },
  });
  await prisma.inboundEmail.create({
    data: {
      fromName: "Northshore orders",
      fromEmail: "orders@northshore.example",
      subject: "PO NS-2044 windows for block C",
      bodyText: "Please book PO NS-2044, same spec as the last block.",
      receivedAt: at(2026, 11, 2, 9, 5),
      source: "SEED",
      customerId: northshore.id,
      contractId: northJob.id,
      matchNotes: "Matched customer reference NS-2044. Matched the sender domain northshore.example",
      messageId: "<seed-northshore@example>",
    },
  });
  await prisma.inboundEmail.create({
    data: {
      fromName: "Pat Newbuild",
      fromEmail: "pat@newbuild-site.example",
      subject: "Quote for a show home",
      bodyText: "We have a show home in Morpeth that needs windows. Please call.",
      receivedAt: at(2026, 11, 2, 7, 40),
      source: "SEED",
      matchNotes: "No customer or job matched",
      messageId: "<seed-unmatched@example>",
    },
  });

  await prisma.webhookEndpoint.create({
    data: {
      url: "https://example.invalid/bellwoods/hooks",
      secret: "whsec_demo_only",
      events: "contract.stage_changed,supplier_invoice.recorded,supplier_invoice.needs_review,customer_invoice.created",
      active: false,
    },
  });

  void liam;
  console.log("Seeded Bellwoods CRM.");
  console.log(`Sign in: david@bellwoods.example / ${PASSWORD}`);
  console.log(`Read-write API key: ${READ_WRITE_KEY}`);
  console.log(`Read-only API key: ${READ_ONLY_KEY}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
