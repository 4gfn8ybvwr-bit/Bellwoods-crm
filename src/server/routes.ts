import { readFile } from "fs/promises";
import { resolve } from "path";
import { ServiceError } from "@/domain/errors";
import { londonToUtc, parseDateInput, partsInLondon } from "@/domain/dates";
import { prisma } from "@/lib/prisma";
import { publicApiKey, publicUser } from "./admin";
import * as admin from "./admin";
import * as customers from "./customers";
import * as sales from "./sales";
import * as pipeline from "./pipeline";
import * as purchasing from "./purchasing";
import * as finance from "./finance";
import * as labour from "./labour";
import * as queries from "./queries";
import { exportCsv } from "./exports";
import { getSettings } from "./settings";
import { uploadRoot } from "./pipeline";
import { csv, ok, readJson, type RouteDef } from "./http";
import {
  dateField,
  dateTimeField,
  intField,
  limitOf,
  moneyField,
  offsetOf,
  optionalDate,
  optionalMoney,
  poLines,
  required,
  specLines,
  str,
} from "./parse";

function inclusiveRange(from: string, to: string) {
  try {
    const start = partsInLondon(parseDateInput(from));
    const end = partsInLondon(parseDateInput(to));
    return {
      from: londonToUtc(start.y, start.m, start.d, 0, 0),
      toExclusive: londonToUtc(end.y, end.m, end.d + 1, 0, 0),
    };
  } catch (error) {
    throw new ServiceError(400, error instanceof Error ? error.message : "Enter dates as dd/mm/yyyy");
  }
}

function rangeFrom(query: URLSearchParams) {
  const from = query.get("from");
  const to = query.get("to");
  if (from && to) return inclusiveRange(from, to);
  return null;
}

export const routes: RouteDef[] = [
  {
    method: "GET",
    pattern: "/me",
    permission: "read",
    summary: "Who this credential is",
    tags: ["Admin"],
    handler: async ({ actor }) => ok({ actor: { name: actor.name, source: actor.source, role: actor.role, scopes: actor.scopes } }),
  },
  {
    method: "GET",
    pattern: "/dashboard",
    permission: "read",
    summary: "Office dashboard, including profit for a date range",
    tags: ["Dashboard"],
    handler: async ({ query }) => {
      const preset = query.get("preset") === "previous" ? "previous" : "current";
      const explicit = rangeFrom(query);
      const range = explicit ?? (await queries.defaultDashboardRange(preset));
      const from = explicit ? explicit.from : range.from;
      const toExclusive = explicit ? explicit.toExclusive : range.toExclusive;
      return ok(await queries.getDashboard(from, toExclusive));
    },
  },
  {
    method: "GET",
    pattern: "/customers",
    permission: "read",
    summary: "List customers",
    tags: ["Customers"],
    handler: async ({ query }) => ok(await queries.listCustomers(query.get("q") ?? undefined, query.get("type") ?? undefined)),
  },
  {
    method: "POST",
    pattern: "/customers",
    permission: "write",
    summary: "Create a domestic or trade customer",
    tags: ["Customers"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      const address = body.address as Record<string, unknown> | undefined;
      const contact = body.contact as Record<string, unknown> | undefined;
      return ok(
        await customers.createCustomer(actor, {
          type: required(body.type, "type"),
          name: required(body.name, "name"),
          companyName: str(body.companyName),
          email: str(body.email),
          phone: str(body.phone),
          notes: str(body.notes),
          address: address
            ? {
                label: str(address.label),
                line1: required(address.line1, "address line"),
                line2: str(address.line2),
                city: required(address.city, "city"),
                county: str(address.county),
                postcode: required(address.postcode, "postcode"),
                isPrimary: true,
              }
            : null,
          contact: contact ? { name: required(contact.name, "contact name"), email: str(contact.email), phone: str(contact.phone), role: str(contact.role), isPrimary: true } : null,
        }),
        201,
      );
    },
  },
  {
    method: "GET",
    pattern: "/customers/:id",
    permission: "read",
    summary: "Get a customer, contacts, addresses and jobs",
    tags: ["Customers"],
    handler: async ({ params }) => ok(await queries.getCustomer(params.id)),
  },
  {
    method: "PATCH",
    pattern: "/customers/:id",
    permission: "write",
    summary: "Update a customer",
    tags: ["Customers"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await customers.updateCustomer(actor, params.id, {
        type: body.type ? str(body.type) : undefined,
        name: body.name ? str(body.name) : undefined,
        companyName: body.companyName !== undefined ? str(body.companyName) : undefined,
        email: body.email !== undefined ? str(body.email) : undefined,
        phone: body.phone !== undefined ? str(body.phone) : undefined,
        notes: body.notes !== undefined ? str(body.notes) : undefined,
      }));
    },
  },
  {
    method: "POST",
    pattern: "/customers/:id/addresses",
    permission: "write",
    summary: "Add an address",
    tags: ["Customers"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await customers.addAddress(actor, params.id, {
        label: str(body.label),
        line1: required(body.line1, "line1"),
        line2: str(body.line2),
        city: required(body.city, "city"),
        county: str(body.county),
        postcode: required(body.postcode, "postcode"),
        isPrimary: Boolean(body.isPrimary),
      }), 201);
    },
  },
  {
    method: "PATCH",
    pattern: "/addresses/:id",
    permission: "write",
    summary: "Update an address",
    tags: ["Customers"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await customers.updateAddress(actor, params.id, {
        label: body.label !== undefined ? str(body.label) : undefined,
        line1: body.line1 !== undefined ? str(body.line1) : undefined,
        line2: body.line2 !== undefined ? str(body.line2) : undefined,
        city: body.city !== undefined ? str(body.city) : undefined,
        county: body.county !== undefined ? str(body.county) : undefined,
        postcode: body.postcode !== undefined ? str(body.postcode) : undefined,
        isPrimary: body.isPrimary !== undefined ? Boolean(body.isPrimary) : undefined,
      }));
    },
  },
  {
    method: "DELETE",
    pattern: "/addresses/:id",
    permission: "write",
    summary: "Delete an address",
    tags: ["Customers"],
    handler: async ({ params, actor }) => ok(await customers.deleteAddress(actor, params.id)),
  },
  {
    method: "POST",
    pattern: "/customers/:id/contacts",
    permission: "write",
    summary: "Add a contact",
    tags: ["Customers"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await customers.addContact(actor, params.id, {
        name: required(body.name, "name"),
        email: str(body.email),
        phone: str(body.phone),
        role: str(body.role),
        isPrimary: Boolean(body.isPrimary),
      }), 201);
    },
  },
  {
    method: "PATCH",
    pattern: "/contacts/:id",
    permission: "write",
    summary: "Update a contact",
    tags: ["Customers"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await customers.updateContact(actor, params.id, {
        name: body.name !== undefined ? str(body.name) : undefined,
        email: body.email !== undefined ? str(body.email) : undefined,
        phone: body.phone !== undefined ? str(body.phone) : undefined,
        role: body.role !== undefined ? str(body.role) : undefined,
        isPrimary: body.isPrimary !== undefined ? Boolean(body.isPrimary) : undefined,
      }));
    },
  },
  {
    method: "DELETE",
    pattern: "/contacts/:id",
    permission: "write",
    summary: "Delete a contact",
    tags: ["Customers"],
    handler: async ({ params, actor }) => ok(await customers.deleteContact(actor, params.id)),
  },
  {
    method: "GET",
    pattern: "/enquiries",
    permission: "read",
    summary: "List enquiries",
    tags: ["Enquiries"],
    handler: async ({ query }) => {
      const status = query.get("status") ?? undefined;
      const data = await prisma.enquiry.findMany({
        where: status ? { status } : undefined,
        include: { customer: true, assignedTo: true },
        orderBy: { createdAt: "desc" },
        take: limitOf(query),
        skip: offsetOf(query),
      });
      return ok(data);
    },
  },
  {
    method: "POST",
    pattern: "/enquiries",
    permission: "write",
    summary: "Create an enquiry",
    tags: ["Enquiries"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      return ok(await sales.createEnquiry(actor, {
        customerId: required(body.customerId, "customerId"),
        source: required(body.source, "source"),
        productInterest: required(body.productInterest, "productInterest"),
        assignedToId: str(body.assignedToId) || null,
        notes: str(body.notes),
      }), 201);
    },
  },
  {
    method: "GET",
    pattern: "/enquiries/:id",
    permission: "read",
    summary: "Get an enquiry",
    tags: ["Enquiries"],
    handler: async ({ params }) => {
      const enquiry = await prisma.enquiry.findUnique({
        where: { id: params.id },
        include: { customer: true, assignedTo: true, quotes: true, appointments: true, contract: true },
      });
      if (!enquiry) throw new ServiceError(404, "Enquiry not found");
      return ok(enquiry);
    },
  },
  {
    method: "PATCH",
    pattern: "/enquiries/:id",
    permission: "write",
    summary: "Update an enquiry",
    tags: ["Enquiries"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await sales.updateEnquiry(actor, params.id, {
        source: body.source !== undefined ? str(body.source) : undefined,
        productInterest: body.productInterest !== undefined ? str(body.productInterest) : undefined,
        status: body.status !== undefined ? str(body.status) : undefined,
        assignedToId: body.assignedToId !== undefined ? str(body.assignedToId) || null : undefined,
        notes: body.notes !== undefined ? str(body.notes) : undefined,
      }));
    },
  },
  {
    method: "GET",
    pattern: "/appointments",
    permission: "read",
    summary: "List diary appointments",
    tags: ["Diary"],
    handler: async ({ query }) => {
      const from = query.get("from");
      const to = query.get("to");
      const data = await prisma.appointment.findMany({
        where: from && to ? { startsAt: { gte: parseDateInput(from), lt: new Date(parseDateInput(to).getTime() + 24 * 60 * 60 * 1000) } } : undefined,
        include: { customer: true, user: true, contract: true, enquiry: true },
        orderBy: { startsAt: "asc" },
        take: limitOf(query),
      });
      return ok(data);
    },
  },
  {
    method: "POST",
    pattern: "/appointments",
    permission: "write",
    summary: "Book a diary appointment",
    tags: ["Diary"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      return ok(await sales.createAppointment(actor, {
        customerId: required(body.customerId, "customerId"),
        userId: str(body.userId) || undefined,
        enquiryId: str(body.enquiryId) || null,
        contractId: str(body.contractId) || null,
        type: required(body.type, "type"),
        title: required(body.title, "title"),
        startsAt: dateTimeField(body.startsAt, "startsAt"),
        endsAt: body.endsAt ? dateTimeField(body.endsAt, "endsAt") : null,
        location: str(body.location),
        notes: str(body.notes),
      }), 201);
    },
  },
  {
    method: "PATCH",
    pattern: "/appointments/:id",
    permission: "write",
    summary: "Update an appointment",
    tags: ["Diary"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await sales.updateAppointment(actor, params.id, {
        userId: body.userId ? str(body.userId) : undefined,
        type: body.type ? str(body.type) : undefined,
        title: body.title ? str(body.title) : undefined,
        startsAt: body.startsAt ? dateTimeField(body.startsAt, "startsAt") : undefined,
        endsAt: body.endsAt ? dateTimeField(body.endsAt, "endsAt") : undefined,
        location: body.location !== undefined ? str(body.location) : undefined,
        notes: body.notes !== undefined ? str(body.notes) : undefined,
      }));
    },
  },
  {
    method: "DELETE",
    pattern: "/appointments/:id",
    permission: "write",
    summary: "Delete an appointment",
    tags: ["Diary"],
    handler: async ({ params, actor }) => ok(await sales.deleteAppointment(actor, params.id)),
  },
  {
    method: "GET",
    pattern: "/quotes",
    permission: "read",
    summary: "List quotes",
    tags: ["Quotes"],
    handler: async ({ query }) => ok(await prisma.quote.findMany({
      where: query.get("status") ? { status: query.get("status")! } : undefined,
      include: { customer: true, lines: true },
      orderBy: { createdAt: "desc" },
      take: limitOf(query),
      skip: offsetOf(query),
    })),
  },
  {
    method: "POST",
    pattern: "/quotes",
    permission: "write",
    summary: "Create a quote with window and door lines",
    tags: ["Quotes"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      return ok(await sales.createQuote(actor, {
        customerId: required(body.customerId, "customerId"),
        enquiryId: str(body.enquiryId) || null,
        notes: str(body.notes),
        validUntil: body.validUntil ? dateField(body.validUntil, "validUntil") : null,
        lines: specLines(body.lines),
      }), 201);
    },
  },
  {
    method: "GET",
    pattern: "/quotes/:id",
    permission: "read",
    summary: "Get a quote",
    tags: ["Quotes"],
    handler: async ({ params }) => {
      const quote = await prisma.quote.findFirst({
        where: { OR: [{ id: params.id }, { number: params.id }] },
        include: { customer: true, lines: { orderBy: { sortOrder: "asc" } }, enquiry: true, contract: true },
      });
      if (!quote) throw new ServiceError(404, "Quote not found");
      return ok(quote);
    },
  },
  {
    method: "PATCH",
    pattern: "/quotes/:id",
    permission: "write",
    summary: "Update a quote and replace its lines",
    tags: ["Quotes"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await sales.updateQuote(actor, params.id, {
        notes: body.notes !== undefined ? str(body.notes) : undefined,
        validUntil: body.validUntil !== undefined ? optionalDate(body.validUntil, "validUntil") : undefined,
        enquiryId: body.enquiryId !== undefined ? str(body.enquiryId) || null : undefined,
        lines: body.lines ? specLines(body.lines) : undefined,
      }));
    },
  },
  {
    method: "POST",
    pattern: "/quotes/:id/send",
    permission: "write",
    summary: "Mark a quote as sent",
    tags: ["Quotes"],
    handler: async ({ params, actor }) => ok(await sales.sendQuote(actor, params.id)),
  },
  {
    method: "POST",
    pattern: "/quotes/:id/accept",
    permission: "write",
    summary: "Accept a quote and turn it into a contract",
    tags: ["Quotes"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await pipeline.acceptQuote(actor, params.id, {
        type: required(body.type, "type"),
        depositPercent: body.depositPercent == null ? undefined : intField(body.depositPercent, "depositPercent"),
        skipDeposit: Boolean(body.skipDeposit),
      }), 201);
    },
  },
  {
    method: "POST",
    pattern: "/quotes/:id/reject",
    permission: "write",
    summary: "Reject a quote",
    tags: ["Quotes"],
    handler: async ({ params, actor }) => ok(await sales.rejectQuote(actor, params.id)),
  },
  {
    method: "GET",
    pattern: "/contracts",
    permission: "read",
    summary: "List contracts",
    tags: ["Contracts"],
    handler: async ({ query }) => ok(await queries.listContracts({
      q: query.get("q") ?? undefined,
      stage: query.get("stage") ?? undefined,
      type: query.get("type") ?? undefined,
      limit: limitOf(query),
      offset: offsetOf(query),
    })),
  },
  {
    method: "GET",
    pattern: "/contracts/board",
    permission: "read",
    summary: "Kanban board of contracts by stage",
    tags: ["Contracts"],
    handler: async () => ok(await queries.board()),
  },
  {
    method: "POST",
    pattern: "/contracts",
    permission: "write",
    summary: "Open a contract, including before it is sold",
    tags: ["Contracts"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      return ok(await pipeline.createContract(actor, {
        customerId: required(body.customerId, "customerId"),
        type: required(body.type, "type"),
        enquiryId: str(body.enquiryId) || null,
        stageSlug: str(body.stage) || str(body.stageSlug) || "enquiry",
        siteAddress: str(body.siteAddress),
        salesValuePence: optionalMoney(body.salesValuePence ?? body.salesValue, "sales value"),
        notes: str(body.notes),
      }), 201);
    },
  },
  {
    method: "GET",
    pattern: "/contracts/:id",
    permission: "read",
    summary: "Contract, stage gate, costing, purchasing and labour",
    tags: ["Contracts"],
    handler: async ({ params }) => ok(await queries.getContractView(params.id)),
  },
  {
    method: "PATCH",
    pattern: "/contracts/:id",
    permission: "write",
    summary: "Update contract details, survey flag and fitters needed",
    tags: ["Contracts"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await pipeline.updateContract(actor, params.id, {
        siteAddress: body.siteAddress !== undefined ? str(body.siteAddress) : undefined,
        notes: body.notes !== undefined ? str(body.notes) : undefined,
        salesValuePence: optionalMoney(body.salesValuePence ?? body.salesValue, "sales value"),
        depositPercent: body.depositPercent == null ? undefined : intField(body.depositPercent, "depositPercent"),
        fittersNeeded: body.fittersNeeded == null ? undefined : intField(body.fittersNeeded, "fittersNeeded"),
        fittersNotes: body.fittersNotes !== undefined ? str(body.fittersNotes) : undefined,
        externalWorks: body.externalWorks !== undefined ? str(body.externalWorks) : undefined,
        surveyUploaded: body.surveyUploaded == null ? undefined : Boolean(body.surveyUploaded),
      }));
    },
  },
  {
    method: "POST",
    pattern: "/contracts/:id/stage",
    permission: "write",
    summary: "Move a contract to another pipeline stage",
    tags: ["Contracts"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await pipeline.moveStage(actor, params.id, required(body.stage, "stage")));
    },
  },
  {
    method: "POST",
    pattern: "/contracts/:id/notes",
    permission: "note",
    summary: "Add a note to the activity timeline",
    tags: ["Contracts"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await pipeline.addNote(actor, params.id, required(body.body ?? body.note, "note")), 201);
    },
  },
  {
    method: "GET",
    pattern: "/contracts/:id/tasks",
    permission: "read",
    summary: "List tasks on a contract",
    tags: ["Contracts"],
    handler: async ({ params }) => ok(await prisma.task.findMany({ where: { contractId: params.id }, include: { assignedTo: true }, orderBy: { createdAt: "desc" } })),
  },
  {
    method: "POST",
    pattern: "/contracts/:id/tasks",
    permission: "write",
    summary: "Add a task",
    tags: ["Contracts"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await pipeline.createTask(actor, params.id, {
        title: required(body.title, "title"),
        notes: str(body.notes),
        assignedToId: str(body.assignedToId) || null,
        dueDate: body.dueDate ? dateField(body.dueDate, "dueDate") : null,
      }), 201);
    },
  },
  {
    method: "PATCH",
    pattern: "/tasks/:id",
    permission: "write",
    summary: "Update or complete a task",
    tags: ["Contracts"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await pipeline.updateTask(actor, params.id, {
        title: body.title !== undefined ? str(body.title) : undefined,
        notes: body.notes !== undefined ? str(body.notes) : undefined,
        assignedToId: body.assignedToId !== undefined ? str(body.assignedToId) || null : undefined,
        dueDate: body.dueDate !== undefined ? optionalDate(body.dueDate, "dueDate") : undefined,
        completed: body.completed == null ? undefined : Boolean(body.completed),
      }));
    },
  },
  {
    method: "PUT",
    pattern: "/contracts/:id/survey",
    permission: "write",
    summary: "Save survey openings, materials and fitter notes",
    tags: ["Contracts"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      const openings = Array.isArray(body.openings) ? body.openings : [];
      const materials = Array.isArray(body.materials) ? body.materials : [];
      return ok(await pipeline.saveSurvey(actor, params.id, {
        fittersNeeded: intField(body.fittersNeeded ?? 2, "fittersNeeded"),
        fittersNotes: str(body.fittersNotes),
        externalWorks: str(body.externalWorks),
        openings: openings.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            location: str(row.location),
            productType: str(row.productType, "WINDOW"),
            widthMm: Number(row.widthMm),
            heightMm: Number(row.heightMm),
            specification: str(row.specification),
            notes: str(row.notes),
          };
        }),
        materials: materials.map((item) => {
          const row = item as Record<string, unknown>;
          return { description: str(row.description), quantity: str(row.quantity, "1"), unit: str(row.unit) };
        }),
      }));
    },
  },
  {
    method: "POST",
    pattern: "/contracts/:id/documents",
    permission: "note",
    summary: "Upload a survey, photo or other document",
    tags: ["Contracts"],
    handler: async ({ request, params, actor }) => {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new ServiceError(400, "Attach a file");
      const bytes = Buffer.from(await file.arrayBuffer());
      return ok(await pipeline.addDocument(actor, params.id, { filename: file.name, mimeType: file.type || "application/octet-stream", bytes }, str(form.get("kind"), "OTHER")), 201);
    },
  },
  {
    method: "GET",
    pattern: "/documents/:id/file",
    permission: "read",
    summary: "Download a document",
    tags: ["Contracts"],
    handler: async ({ params }) => {
      const document = await prisma.document.findUnique({ where: { id: params.id } });
      if (!document) throw new ServiceError(404, "Document not found");
      const root = resolve(uploadRoot());
      const full = resolve(document.storagePath);
      if (!full.startsWith(root)) throw new ServiceError(400, "Bad file path");
      const bytes = await readFile(full);
      return new Response(bytes, {
        headers: {
          "content-type": document.mimeType,
          "content-disposition": `inline; filename="${document.filename.replace(/"/g, "")}"`,
        },
      });
    },
  },
  {
    method: "GET",
    pattern: "/suppliers",
    permission: "read",
    summary: "List suppliers",
    tags: ["Purchasing"],
    handler: async () => ok(await prisma.supplier.findMany({ orderBy: { name: "asc" } })),
  },
  {
    method: "POST",
    pattern: "/suppliers",
    permission: "finance",
    summary: "Create a supplier",
    tags: ["Purchasing"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      return ok(await purchasing.createSupplier(actor, {
        name: required(body.name, "name"),
        email: str(body.email),
        phone: str(body.phone),
        accountRef: str(body.accountRef),
        notes: str(body.notes),
      }), 201);
    },
  },
  {
    method: "PATCH",
    pattern: "/suppliers/:id",
    permission: "finance",
    summary: "Update a supplier",
    tags: ["Purchasing"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await purchasing.updateSupplier(actor, params.id, {
        name: body.name !== undefined ? str(body.name) : undefined,
        email: body.email !== undefined ? str(body.email) : undefined,
        phone: body.phone !== undefined ? str(body.phone) : undefined,
        accountRef: body.accountRef !== undefined ? str(body.accountRef) : undefined,
        notes: body.notes !== undefined ? str(body.notes) : undefined,
      }));
    },
  },
  {
    method: "GET",
    pattern: "/purchase-orders",
    permission: "read",
    summary: "List purchase orders",
    tags: ["Purchasing"],
    handler: async ({ query }) => ok(await prisma.purchaseOrder.findMany({
      where: {
        contractId: query.get("contractId") ?? undefined,
        status: query.get("status") ?? undefined,
      },
      include: { supplier: true, contract: true, lines: true, invoices: true },
      orderBy: { createdAt: "desc" },
      take: limitOf(query),
    })),
  },
  {
    method: "POST",
    pattern: "/purchase-orders",
    permission: "finance",
    summary: "Create a purchase order on a contract",
    tags: ["Purchasing"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      return ok(await purchasing.createPurchaseOrder(actor, {
        contractId: required(body.contractId, "contractId"),
        supplierId: required(body.supplierId, "supplierId"),
        supplierReference: str(body.supplierReference),
        remake: Boolean(body.remake),
        remakeReason: str(body.remakeReason),
        notes: str(body.notes),
        lines: poLines(body.lines),
      }), 201);
    },
  },
  {
    method: "GET",
    pattern: "/purchase-orders/:id",
    permission: "read",
    summary: "Get a purchase order",
    tags: ["Purchasing"],
    handler: async ({ params }) => {
      const po = await prisma.purchaseOrder.findFirst({
        where: { OR: [{ id: params.id }, { number: params.id }] },
        include: { supplier: true, contract: true, lines: true, invoices: true },
      });
      if (!po) throw new ServiceError(404, "Purchase order not found");
      return ok(po);
    },
  },
  {
    method: "PATCH",
    pattern: "/purchase-orders/:id",
    permission: "finance",
    summary: "Update a purchase order, including supplier reference and lines",
    tags: ["Purchasing"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await purchasing.updatePurchaseOrder(actor, params.id, {
        supplierReference: body.supplierReference !== undefined ? str(body.supplierReference) : undefined,
        remake: body.remake == null ? undefined : Boolean(body.remake),
        remakeReason: body.remakeReason !== undefined ? str(body.remakeReason) : undefined,
        notes: body.notes !== undefined ? str(body.notes) : undefined,
        lines: body.lines ? poLines(body.lines) : undefined,
      }));
    },
  },
  {
    method: "POST",
    pattern: "/purchase-orders/:id/status",
    permission: "finance",
    summary: "Set a purchase order to draft, sent or delivered",
    tags: ["Purchasing"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      const status = required(body.status, "status").toUpperCase();
      if (status !== "DRAFT" && status !== "SENT" && status !== "DELIVERED") {
        throw new ServiceError(400, "Status must be draft, sent or delivered");
      }
      return ok(await purchasing.setPurchaseOrderStatus(actor, params.id, status));
    },
  },
  {
    method: "POST",
    pattern: "/purchase-orders/:id/supplier-invoices",
    permission: "finance",
    summary: "Record a supplier invoice. Mismatches go to Invoice Review.",
    tags: ["Invoices"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await purchasing.recordSupplierInvoice(actor, params.id, {
        invoiceNumber: required(body.invoiceNumber, "invoiceNumber"),
        invoiceDate: dateField(body.invoiceDate, "invoiceDate"),
        netPence: moneyField(body.netPence ?? body.net, "net"),
        nominalCode: str(body.nominalCode, "5000"),
      }), 201);
    },
  },
  {
    method: "GET",
    pattern: "/supplier-invoices",
    permission: "read",
    summary: "List supplier invoices",
    tags: ["Invoices"],
    handler: async ({ query }) => ok(await prisma.supplierInvoice.findMany({
      where: query.get("status") ? { status: query.get("status")! } : undefined,
      include: { purchaseOrder: { include: { supplier: true, contract: true } } },
      orderBy: { createdAt: "desc" },
      take: limitOf(query),
    })),
  },
  {
    method: "POST",
    pattern: "/supplier-invoices/:id/approve",
    permission: "finance",
    summary: "Approve an invoice in the review queue",
    tags: ["Invoices"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await purchasing.reviewSupplierInvoice(actor, params.id, "APPROVE", str(body.note)));
    },
  },
  {
    method: "POST",
    pattern: "/supplier-invoices/:id/reject",
    permission: "finance",
    summary: "Reject an invoice in the review queue",
    tags: ["Invoices"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await purchasing.reviewSupplierInvoice(actor, params.id, "REJECT", str(body.note)));
    },
  },
  {
    method: "GET",
    pattern: "/customer-invoices",
    permission: "read",
    summary: "List customer invoices",
    tags: ["Invoices"],
    handler: async ({ query }) => ok(await prisma.customerInvoice.findMany({
      where: {
        status: query.get("status") ?? undefined,
        contractId: query.get("contractId") ?? undefined,
        type: query.get("type") ?? undefined,
      },
      include: { contract: { include: { customer: true } } },
      orderBy: { invoiceDate: "desc" },
      take: limitOf(query),
    })),
  },
  {
    method: "POST",
    pattern: "/contracts/:id/deposit-invoice",
    permission: "write",
    summary: "Raise the deposit invoice",
    tags: ["Invoices"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await finance.raiseDepositInvoice(actor, params.id, {
        percent: body.percent == null && body.depositPercent == null ? undefined : intField(body.percent ?? body.depositPercent, "percent"),
        invoiceDate: body.invoiceDate ? dateField(body.invoiceDate, "invoiceDate") : undefined,
      }), 201);
    },
  },
  {
    method: "POST",
    pattern: "/contracts/:id/skip-deposit",
    permission: "write",
    summary: "Skip the deposit",
    tags: ["Invoices"],
    handler: async ({ params, actor }) => ok(await finance.skipDeposit(actor, params.id)),
  },
  {
    method: "POST",
    pattern: "/contracts/:id/final-invoice",
    permission: "finance",
    summary: "Raise the final invoice for the outstanding balance, or a given net",
    tags: ["Invoices"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      const invoice = await finance.raiseFinalInvoice(actor, params.id, {
        netPence: optionalMoney(body.netPence ?? body.net, "net"),
        invoiceDate: body.invoiceDate ? dateField(body.invoiceDate, "invoiceDate") : undefined,
      });
      if (body.advanceStage !== false) {
        try {
          await pipeline.moveStage(actor, params.id, "invoiced");
        } catch (error) {
          if (!(error instanceof ServiceError)) throw error;
        }
      }
      return ok(invoice, 201);
    },
  },
  {
    method: "POST",
    pattern: "/customer-invoices/:id/mark-paid",
    permission: "finance",
    summary: "Mark a customer invoice paid",
    tags: ["Invoices"],
    handler: async ({ params, actor }) => ok(await finance.setCustomerInvoiceStatus(actor, params.id, "PAID")),
  },
  {
    method: "POST",
    pattern: "/customer-invoices/:id/mark-unpaid",
    permission: "finance",
    summary: "Mark a customer invoice unpaid",
    tags: ["Invoices"],
    handler: async ({ params, actor }) => ok(await finance.setCustomerInvoiceStatus(actor, params.id, "UNPAID")),
  },
  {
    method: "POST",
    pattern: "/customer-invoices/:id/void",
    permission: "finance",
    summary: "Void an unpaid customer invoice",
    tags: ["Invoices"],
    handler: async ({ params, actor }) => ok(await finance.voidCustomerInvoice(actor, params.id)),
  },
  {
    method: "GET",
    pattern: "/labour-people",
    permission: "read",
    summary: "List fitters and rates",
    tags: ["Labour"],
    handler: async () => ok(await prisma.labourPerson.findMany({ orderBy: { name: "asc" } })),
  },
  {
    method: "POST",
    pattern: "/labour-people",
    permission: "finance",
    summary: "Add a person and rate",
    tags: ["Labour"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      return ok(await labour.savePerson(actor, {
        name: required(body.name, "name"),
        trade: str(body.trade, "Fitter"),
        employment: str(body.employment, "Employed"),
        rateType: required(body.rateType, "rateType"),
        ratePence: moneyField(body.ratePence ?? body.rate, "rate"),
        notes: str(body.notes),
        active: body.active == null ? true : Boolean(body.active),
      }), 201);
    },
  },
  {
    method: "PATCH",
    pattern: "/labour-people/:id",
    permission: "finance",
    summary: "Update a person or rate",
    tags: ["Labour"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      const existing = await prisma.labourPerson.findUnique({ where: { id: params.id } });
      if (!existing) throw new ServiceError(404, "Person not found");
      return ok(await labour.savePerson(actor, {
        name: body.name !== undefined ? str(body.name) : existing.name,
        trade: body.trade !== undefined ? str(body.trade) : existing.trade,
        employment: body.employment !== undefined ? str(body.employment) : existing.employment,
        rateType: body.rateType !== undefined ? str(body.rateType) : existing.rateType,
        ratePence: body.ratePence != null || body.rate != null ? moneyField(body.ratePence ?? body.rate, "rate") : existing.ratePence,
        notes: body.notes !== undefined ? str(body.notes) : existing.notes,
        active: body.active == null ? existing.active : Boolean(body.active),
      }, params.id));
    },
  },
  {
    method: "GET",
    pattern: "/labour-entries",
    permission: "read",
    summary: "List labour entries",
    tags: ["Labour"],
    handler: async ({ query }) => ok(await prisma.labourEntry.findMany({
      where: query.get("contractId") ? { contractId: query.get("contractId")! } : undefined,
      include: { person: true, contract: true },
      orderBy: { workDate: "desc" },
      take: limitOf(query),
    })),
  },
  {
    method: "POST",
    pattern: "/labour-entries",
    permission: "labour",
    summary: "Log fitter days or hours against a contract",
    tags: ["Labour"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      return ok(await labour.addLabourEntry(actor, {
        contractId: required(body.contractId, "contractId"),
        personId: required(body.personId, "personId"),
        workDate: dateField(body.workDate, "workDate"),
        days: body.days == null ? 0 : Number(body.days),
        hours: body.hours == null ? 0 : Number(body.hours),
        notes: str(body.notes),
      }), 201);
    },
  },
  {
    method: "DELETE",
    pattern: "/labour-entries/:id",
    permission: "labour",
    summary: "Remove a labour entry",
    tags: ["Labour"],
    handler: async ({ params, actor }) => ok(await labour.deleteLabourEntry(actor, params.id)),
  },
  {
    method: "GET",
    pattern: "/stages",
    permission: "read",
    summary: "List pipeline stages",
    tags: ["Admin"],
    handler: async () => ok(await prisma.stage.findMany({ orderBy: { sortOrder: "asc" } })),
  },
  {
    method: "POST",
    pattern: "/stages",
    permission: "admin",
    summary: "Add a pipeline stage",
    tags: ["Admin"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      return ok(await admin.createStage(actor, { name: required(body.name, "name"), slug: required(body.slug, "slug"), colour: str(body.colour) }), 201);
    },
  },
  {
    method: "PATCH",
    pattern: "/stages/:id",
    permission: "admin",
    summary: "Rename a stage or change its colour",
    tags: ["Admin"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await admin.updateStage(actor, params.id, {
        name: body.name !== undefined ? str(body.name) : undefined,
        colour: body.colour !== undefined ? str(body.colour) : undefined,
        slug: body.slug !== undefined ? str(body.slug) : undefined,
      }));
    },
  },
  {
    method: "POST",
    pattern: "/stages/reorder",
    permission: "admin",
    summary: "Reorder the pipeline",
    tags: ["Admin"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      if (!Array.isArray(body.ids)) throw new ServiceError(400, "ids must be a list of stage ids");
      return ok(await admin.reorderStages(actor, body.ids.map(String)));
    },
  },
  {
    method: "DELETE",
    pattern: "/stages/:id",
    permission: "admin",
    summary: "Delete an unused stage",
    tags: ["Admin"],
    handler: async ({ params, actor }) => ok(await admin.deleteStage(actor, params.id)),
  },
  {
    method: "GET",
    pattern: "/users",
    permission: "read",
    summary: "List users",
    tags: ["Admin"],
    handler: async () => ok((await prisma.user.findMany({ orderBy: { name: "asc" } })).map(publicUser)),
  },
  {
    method: "POST",
    pattern: "/users",
    permission: "admin",
    summary: "Create a user",
    tags: ["Admin"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      return ok(await admin.createUser(actor, {
        name: required(body.name, "name"),
        email: required(body.email, "email"),
        password: required(body.password, "password"),
        role: required(body.role, "role"),
      }), 201);
    },
  },
  {
    method: "PATCH",
    pattern: "/users/:id",
    permission: "admin",
    summary: "Update a user",
    tags: ["Admin"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await admin.updateUser(actor, params.id, {
        name: body.name !== undefined ? str(body.name) : undefined,
        role: body.role !== undefined ? str(body.role) : undefined,
        active: body.active == null ? undefined : Boolean(body.active),
        password: body.password ? str(body.password) : undefined,
      }));
    },
  },
  {
    method: "GET",
    pattern: "/api-keys",
    permission: "admin",
    summary: "List API keys. Secrets are never shown again.",
    tags: ["Admin"],
    handler: async () => ok((await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } })).map(publicApiKey)),
  },
  {
    method: "POST",
    pattern: "/api-keys",
    permission: "admin",
    summary: "Create an API key. The secret is returned once.",
    tags: ["Admin"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : [str(body.scope, "read")];
      return ok(await admin.createApiKey(actor, { name: required(body.name, "name"), scopes }), 201);
    },
  },
  {
    method: "POST",
    pattern: "/api-keys/:id/revoke",
    permission: "admin",
    summary: "Revoke an API key",
    tags: ["Admin"],
    handler: async ({ params, actor }) => ok(await admin.revokeApiKey(actor, params.id)),
  },
  {
    method: "GET",
    pattern: "/webhooks",
    permission: "admin",
    summary: "List webhook endpoints",
    tags: ["Admin"],
    handler: async () => ok(await prisma.webhookEndpoint.findMany({ orderBy: { createdAt: "desc" } })),
  },
  {
    method: "POST",
    pattern: "/webhooks",
    permission: "admin",
    summary: "Register a webhook endpoint",
    tags: ["Admin"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      const events = Array.isArray(body.events) ? body.events.map(String) : str(body.events, "*").split(",");
      return ok(await admin.createWebhook(actor, { url: required(body.url, "url"), events, secret: str(body.secret) || undefined }), 201);
    },
  },
  {
    method: "PATCH",
    pattern: "/webhooks/:id",
    permission: "admin",
    summary: "Enable, disable or retarget a webhook",
    tags: ["Admin"],
    handler: async ({ request, params, actor }) => {
      const body = await readJson(request);
      return ok(await admin.updateWebhook(actor, params.id, {
        active: body.active == null ? undefined : Boolean(body.active),
        url: body.url !== undefined ? str(body.url) : undefined,
        events: Array.isArray(body.events) ? body.events.map(String) : undefined,
      }));
    },
  },
  {
    method: "GET",
    pattern: "/webhook-deliveries",
    permission: "admin",
    summary: "Recent webhook deliveries",
    tags: ["Admin"],
    handler: async () => ok(await prisma.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { endpoint: true } })),
  },
  {
    method: "GET",
    pattern: "/settings",
    permission: "read",
    summary: "VAT, deposit default, invoice tolerance and financial year",
    tags: ["Admin"],
    handler: async () => ok(await getSettings()),
  },
  {
    method: "PATCH",
    pattern: "/settings",
    permission: "admin",
    summary: "Update VAT, deposit default or invoice tolerance",
    tags: ["Admin"],
    handler: async ({ request, actor }) => {
      const body = await readJson(request);
      return ok(await admin.updateAppSettings(actor, {
        invoiceTolerancePence: body.invoiceTolerancePence == null ? undefined : intField(body.invoiceTolerancePence, "invoiceTolerancePence"),
        defaultDepositPercent: body.defaultDepositPercent == null ? undefined : intField(body.defaultDepositPercent, "defaultDepositPercent"),
        vatRateBps: body.vatRateBps == null ? undefined : intField(body.vatRateBps, "vatRateBps"),
      }));
    },
  },
  {
    method: "GET",
    pattern: "/exports/:kind",
    permission: "read",
    summary: "CSV export: customers, enquiries, quotes, contracts, purchase-orders, supplier-invoices, customer-invoices",
    tags: ["Exports"],
    handler: async ({ params }) => csv(`${params.kind}.csv`, await exportCsv(params.kind)),
  },
];
