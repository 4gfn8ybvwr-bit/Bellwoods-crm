"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ServiceError } from "@/domain/errors";
import { poundsToPence } from "@/domain/money";
import { parseDateInput, parseDateTimeInput } from "@/domain/dates";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth";
import type { ActionState } from "@/lib/action-state";
import { prisma } from "@/lib/prisma";
import { actorFromSession } from "@/server/actor";
import { checkPassword, createApiKey, createStage, createUser, createWebhook, deleteStage, reorderStages, revokeApiKey, updateAppSettings, updateStage, updateUser, updateWebhook } from "@/server/admin";
import { addAddress, addContact, createCustomer, updateCustomer } from "@/server/customers";
import { raiseDepositInvoice, raiseFinalInvoice, setCustomerInvoiceStatus, skipDeposit, voidCustomerInvoice } from "@/server/finance";
import { addLabourEntry, deleteLabourEntry, savePerson } from "@/server/labour";
import { acceptQuote, addDocument, addNote, createContract, createTask, moveStage, saveSurvey, updateContract, updateTask } from "@/server/pipeline";
import { createPurchaseOrder, createSupplier, recordSupplierInvoice, reviewSupplierInvoice, setPurchaseOrderStatus, updateSupplier } from "@/server/purchasing";
import { assignEmail, enquiryFromEmail, markEmailRead } from "@/server/email/ingest";
import { createAppointment, createEnquiry, createQuote, deleteAppointment, rejectQuote, sendQuote, updateEnquiry, updateQuote } from "@/server/sales";
import { quickAddTradeJob } from "@/server/trade";
import type { SpecLineInput } from "@/server/lines";
import type { PoLineInput } from "@/server/po-lines";

function rethrow(error: unknown) {
  if (typeof error === "object" && error && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_")) {
    throw error;
  }
}

function failure(error: unknown): ActionState {
  rethrow(error);
  if (error instanceof ServiceError) return { error: error.message };
  if (error instanceof Error) return { error: error.message };
  return { error: "Something went wrong" };
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function dateOrThrow(value: string, label: string) {
  try {
    return parseDateInput(value);
  } catch (error) {
    throw new ServiceError(400, error instanceof Error ? error.message : `${label} is not a valid date`);
  }
}

function dateTimeOrThrow(value: string) {
  try {
    return parseDateTimeInput(value);
  } catch (error) {
    throw new ServiceError(400, error instanceof Error ? error.message : "Enter a date and time as dd/mm/yyyy HH:mm");
  }
}

function quoteLines(formData: FormData): SpecLineInput[] {
  const parsed = JSON.parse(text(formData, "linesJson") || "[]") as Record<string, string>[];
  return parsed.map((row) => ({
    productType: row.productType || "WINDOW",
    description: row.description || "",
    widthMm: row.widthMm ? Number(row.widthMm) : null,
    heightMm: row.heightMm ? Number(row.heightMm) : null,
    specification: row.specification || "",
    quantity: Number(row.quantity || 1),
    unitPricePence: poundsToPence(row.unitPrice || "0"),
  }));
}

function poLines(formData: FormData): PoLineInput[] {
  const parsed = JSON.parse(text(formData, "linesJson") || "[]") as Record<string, string>[];
  return parsed.map((row) => ({
    description: row.description || "",
    quantity: Number(row.quantity || 1),
    unitPricePence: poundsToPence(row.unitPrice || "0"),
  }));
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await checkPassword(password, user.passwordHash))) {
    return { error: "Email or password is not recognised" };
  }
  const token = await signSession({ uid: user.id, role: user.role, name: user.name });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  redirect(text(formData, "next") || "/");
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function saveCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "id");
    const payload = {
      type: text(formData, "type"),
      name: text(formData, "name"),
      companyName: text(formData, "companyName"),
      email: text(formData, "email"),
      phone: text(formData, "phone"),
      notes: text(formData, "notes"),
      address: text(formData, "line1")
        ? {
            line1: text(formData, "line1"),
            line2: text(formData, "line2"),
            city: text(formData, "city"),
            county: text(formData, "county"),
            postcode: text(formData, "postcode"),
            label: text(formData, "label") || "Home",
            isPrimary: true,
          }
        : null,
    };
    const customer = id ? await updateCustomer(actor, id, payload) : await createCustomer(actor, payload);
    revalidatePath("/customers");
    redirect(`/customers/${customer.id}?notice=Customer saved`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const customerId = text(formData, "customerId");
    await addContact(actor, customerId, {
      name: text(formData, "name"),
      email: text(formData, "email"),
      phone: text(formData, "phone"),
      role: text(formData, "role"),
      isPrimary: formData.get("isPrimary") === "on",
    });
    revalidatePath(`/customers/${customerId}`);
    redirect(`/customers/${customerId}?notice=Contact added`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveAddress(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const customerId = text(formData, "customerId");
    await addAddress(actor, customerId, {
      label: text(formData, "label") || "Site",
      line1: text(formData, "line1"),
      line2: text(formData, "line2"),
      city: text(formData, "city"),
      county: text(formData, "county"),
      postcode: text(formData, "postcode"),
      isPrimary: formData.get("isPrimary") === "on",
    });
    revalidatePath(`/customers/${customerId}`);
    redirect(`/customers/${customerId}?notice=Address added`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveEnquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "id");
    const channel = text(formData, "channel") === "trade" ? "TRADE" as const : "BELLWOODS" as const;
    const enquiry = id
      ? await updateEnquiry(actor, id, {
          source: text(formData, "source"),
          productInterest: text(formData, "productInterest"),
          status: text(formData, "status") || undefined,
          assignedToId: text(formData, "assignedToId") || null,
          notes: text(formData, "notes"),
          channel,
        })
      : await createEnquiry(actor, {
          customerId: text(formData, "customerId"),
          source: text(formData, "source"),
          productInterest: text(formData, "productInterest"),
          assignedToId: text(formData, "assignedToId") || null,
          notes: text(formData, "notes"),
          channel,
        });
    revalidatePath("/enquiries");
    redirect(`/enquiries/${enquiry.id}?notice=Enquiry saved`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveAppointment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    await createAppointment(actor, {
      customerId: text(formData, "customerId"),
      userId: text(formData, "userId") || undefined,
      enquiryId: text(formData, "enquiryId") || null,
      contractId: text(formData, "contractId") || null,
      type: text(formData, "type"),
      title: text(formData, "title"),
      startsAt: dateTimeOrThrow(text(formData, "startsAt")),
      location: text(formData, "location"),
      notes: text(formData, "notes"),
    });
    const back = text(formData, "back") || "/diary";
    revalidatePath("/diary");
    redirect(`${back}${back.includes("?") ? "&" : "?"}notice=Appointment booked`);
  } catch (error) {
    return failure(error);
  }
}

export async function removeAppointment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    await deleteAppointment(actor, text(formData, "id"));
    revalidatePath("/diary");
    return { ok: "Appointment removed" };
  } catch (error) {
    return failure(error);
  }
}

export async function saveQuote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "id");
    const lines = quoteLines(formData);
    const validUntil = text(formData, "validUntil");
    const quote = id
      ? await updateQuote(actor, id, { notes: text(formData, "notes"), validUntil: validUntil ? dateOrThrow(validUntil, "Valid until") : null, lines })
      : await createQuote(actor, {
          customerId: text(formData, "customerId"),
          enquiryId: text(formData, "enquiryId") || null,
          notes: text(formData, "notes"),
          validUntil: validUntil ? dateOrThrow(validUntil, "Valid until") : null,
          lines,
        });
    revalidatePath("/quotes");
    redirect(`/quotes/${quote.id}?notice=Quote saved`);
  } catch (error) {
    return failure(error);
  }
}

export async function markQuoteSent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "id");
    await sendQuote(actor, id);
    redirect(`/quotes/${id}?notice=Quote marked as sent`);
  } catch (error) {
    return failure(error);
  }
}

export async function markQuoteRejected(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "id");
    await rejectQuote(actor, id);
    redirect(`/quotes/${id}?notice=Quote rejected`);
  } catch (error) {
    return failure(error);
  }
}

export async function convertQuote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "id");
    const trade = text(formData, "channel") === "trade";
    const result = await acceptQuote(actor, id, {
      type: trade ? "TC" : formData.get("commercial") === "on" ? "CM" : "BW",
      depositPercent: text(formData, "depositPercent") ? Number(text(formData, "depositPercent")) : undefined,
      skipDeposit: trade ? formData.get("keepDeposit") !== "on" : formData.get("skipDeposit") === "on",
    });
    revalidatePath("/contracts");
    redirect(`/contracts/${result.contract.id}?notice=Quote accepted and contract opened`);
  } catch (error) {
    return failure(error);
  }
}

export async function openContract(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const trade = text(formData, "channel") === "trade";
    const contract = await createContract(actor, {
      customerId: text(formData, "customerId"),
      type: trade ? "TC" : formData.get("commercial") === "on" ? "CM" : "BW",
      channel: trade ? "TRADE" : "BELLWOODS",
      enquiryId: text(formData, "enquiryId") || null,
      stageSlug: text(formData, "stage") || "enquiry",
      siteAddress: text(formData, "siteAddress"),
      notes: text(formData, "notes"),
    });
    redirect(`/contracts/${contract.id}?notice=Contract opened`);
  } catch (error) {
    return failure(error);
  }
}

export async function changeStage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "contractId");
    await moveStage(actor, id, text(formData, "stage"));
    revalidatePath(`/contracts/${id}`);
    revalidatePath("/contracts/board");
    redirect(`/contracts/${id}?notice=Stage updated`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveContractDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "contractId");
    await updateContract(actor, id, {
      siteAddress: text(formData, "siteAddress"),
      notes: text(formData, "notes"),
      salesValuePence: text(formData, "salesValue") ? poundsToPence(text(formData, "salesValue")) : undefined,
      depositPercent: text(formData, "depositPercent") ? Number(text(formData, "depositPercent")) : undefined,
      fittersNeeded: text(formData, "fittersNeeded") ? Number(text(formData, "fittersNeeded")) : undefined,
      fittersNotes: text(formData, "fittersNotes"),
      externalWorks: text(formData, "externalWorks"),
    });
    redirect(`/contracts/${id}?notice=Contract updated`);
  } catch (error) {
    return failure(error);
  }
}

export async function setSurveyFlag(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "contractId");
    await updateContract(actor, id, { surveyUploaded: formData.get("surveyUploaded") === "true" });
    redirect(`/contracts/${id}?notice=Survey flag updated`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "contractId");
    await addNote(actor, id, text(formData, "body"));
    redirect(`/contracts/${id}?notice=Note added`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const contractId = text(formData, "contractId");
    const taskId = text(formData, "taskId");
    if (taskId) {
      await updateTask(actor, taskId, { completed: formData.get("completed") === "true" });
    } else {
      await createTask(actor, contractId, {
        title: text(formData, "title"),
        notes: text(formData, "notes"),
        assignedToId: text(formData, "assignedToId") || null,
        dueDate: text(formData, "dueDate") ? dateOrThrow(text(formData, "dueDate"), "Due date") : null,
      });
    }
    redirect(`/contracts/${contractId}?notice=Task saved`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveSurveySheet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "contractId");
    const openings = [0, 1, 2, 3, 4, 5].map((index) => ({
      location: text(formData, `location_${index}`),
      productType: text(formData, `productType_${index}`) || "WINDOW",
      widthMm: Number(text(formData, `width_${index}`) || 0),
      heightMm: Number(text(formData, `height_${index}`) || 0),
      specification: text(formData, `spec_${index}`),
      notes: text(formData, `notes_${index}`),
    }));
    const materials = [0, 1, 2, 3, 4, 5].map((index) => ({
      description: text(formData, `material_${index}`),
      quantity: text(formData, `qty_${index}`),
      unit: text(formData, `unit_${index}`),
    }));
    await saveSurvey(actor, id, {
      fittersNeeded: Number(text(formData, "fittersNeeded") || 2),
      fittersNotes: text(formData, "fittersNotes"),
      externalWorks: text(formData, "externalWorks"),
      openings,
      materials,
    });
    redirect(`/contracts/${id}?notice=Survey saved`);
  } catch (error) {
    return failure(error);
  }
}

export async function uploadContractFile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "contractId");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ServiceError(400, "Choose a file");
    const bytes = Buffer.from(await file.arrayBuffer());
    await addDocument(actor, id, { filename: file.name, mimeType: file.type || "application/octet-stream", bytes }, text(formData, "kind") || "OTHER");
    redirect(`/contracts/${id}?notice=File uploaded`);
  } catch (error) {
    return failure(error);
  }
}

export async function savePurchaseOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const contractId = text(formData, "contractId");
    await createPurchaseOrder(actor, {
      contractId,
      supplierId: text(formData, "supplierId"),
      supplierReference: text(formData, "supplierReference"),
      remake: formData.get("remake") === "on",
      remakeReason: text(formData, "remakeReason"),
      notes: text(formData, "notes"),
      lines: poLines(formData),
    });
    redirect(`/contracts/${contractId}?notice=Purchase order raised`);
  } catch (error) {
    return failure(error);
  }
}

export async function savePoStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const status = text(formData, "status") as "DRAFT" | "SENT" | "DELIVERED";
    await setPurchaseOrderStatus(actor, text(formData, "id"), status);
    const contractId = text(formData, "contractId");
    redirect(`/contracts/${contractId}?notice=Purchase order updated`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveSupplierInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const invoice = await recordSupplierInvoice(actor, text(formData, "purchaseOrderId"), {
      invoiceNumber: text(formData, "invoiceNumber"),
      invoiceDate: dateOrThrow(text(formData, "invoiceDate"), "Invoice date"),
      netPence: poundsToPence(text(formData, "net")),
      nominalCode: text(formData, "nominalCode") || "5000",
    });
    const contractId = text(formData, "contractId");
    const notice = invoice.status === "PENDING_REVIEW" ? "Invoice sent to the review queue" : "Supplier invoice recorded";
    redirect(`/contracts/${contractId}?notice=${encodeURIComponent(notice)}`);
  } catch (error) {
    return failure(error);
  }
}

export async function decideSupplierInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const decision = text(formData, "decision") === "REJECT" ? "REJECT" : "APPROVE";
    await reviewSupplierInvoice(actor, text(formData, "id"), decision, text(formData, "note"));
    revalidatePath("/purchasing/review");
    redirect("/purchasing/review?notice=Review saved");
  } catch (error) {
    return failure(error);
  }
}

export async function saveDeposit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "contractId");
    if (formData.get("skip") === "true") await skipDeposit(actor, id);
    else await raiseDepositInvoice(actor, id, { percent: Number(text(formData, "percent") || 25) });
    redirect(`/contracts/${id}?notice=Deposit updated`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveFinalInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "contractId");
    const net = text(formData, "net");
    await raiseFinalInvoice(actor, id, { netPence: net ? poundsToPence(net) : undefined });
    if (formData.get("advance") !== "off") {
      try {
        await moveStage(actor, id, "invoiced");
      } catch (error) {
        if (!(error instanceof ServiceError)) throw error;
      }
    }
    redirect(`/contracts/${id}?notice=Final invoice raised`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveInvoiceStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "contractId");
    const status = text(formData, "status") === "UNPAID" ? "UNPAID" : "PAID";
    if (text(formData, "void") === "true") await voidCustomerInvoice(actor, text(formData, "invoiceId"));
    else await setCustomerInvoiceStatus(actor, text(formData, "invoiceId"), status);
    redirect(`/contracts/${id}?notice=Invoice updated`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveLabour(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const contractId = text(formData, "contractId");
    await addLabourEntry(actor, {
      contractId,
      personId: text(formData, "personId"),
      workDate: dateOrThrow(text(formData, "workDate"), "Date"),
      days: Number(text(formData, "days") || 0),
      hours: Number(text(formData, "hours") || 0),
      notes: text(formData, "notes"),
    });
    redirect(`/contracts/${contractId}?notice=Labour logged`);
  } catch (error) {
    return failure(error);
  }
}

export async function removeLabour(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    await deleteLabourEntry(actor, text(formData, "id"));
    redirect(`/contracts/${text(formData, "contractId")}?notice=Labour removed`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveLabourPerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    await savePerson(
      actor,
      {
        name: text(formData, "name"),
        trade: text(formData, "trade"),
        employment: text(formData, "employment"),
        rateType: text(formData, "rateType"),
        ratePence: poundsToPence(text(formData, "rate")),
        notes: text(formData, "notes"),
        active: formData.get("active") !== "off",
      },
      text(formData, "id") || undefined,
    );
    redirect("/labour?notice=Rate saved");
  } catch (error) {
    return failure(error);
  }
}

export async function saveSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "id");
    if (id) {
      await updateSupplier(actor, id, {
        name: text(formData, "name"),
        email: text(formData, "email"),
        phone: text(formData, "phone"),
        accountRef: text(formData, "accountRef"),
        notes: text(formData, "notes"),
      });
    } else {
      await createSupplier(actor, {
        name: text(formData, "name"),
        email: text(formData, "email"),
        phone: text(formData, "phone"),
        accountRef: text(formData, "accountRef"),
        notes: text(formData, "notes"),
      });
    }
    redirect("/suppliers?notice=Supplier saved");
  } catch (error) {
    return failure(error);
  }
}

export async function saveUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "id");
    if (id) {
      await updateUser(actor, id, {
        name: text(formData, "name") || undefined,
        role: text(formData, "role") || undefined,
        active: text(formData, "active") ? text(formData, "active") === "true" : undefined,
        password: text(formData, "password") || undefined,
      });
    } else {
      await createUser(actor, {
        name: text(formData, "name"),
        email: text(formData, "email"),
        password: text(formData, "password"),
        role: text(formData, "role"),
      });
    }
    redirect("/settings?notice=User saved");
  } catch (error) {
    return failure(error);
  }
}

export async function saveApiKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const scope = text(formData, "scope");
    const scopes = scope === "admin" ? ["admin"] : scope === "write" ? ["read", "write"] : ["read"];
    const created = await createApiKey(actor, { name: text(formData, "name"), scopes });
    revalidatePath("/settings/api-keys");
    return { createdKey: created.key, ok: "API key created" };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    await revokeApiKey(actor, text(formData, "id"));
    revalidatePath("/settings/api-keys");
    return { ok: "API key revoked" };
  } catch (error) {
    return failure(error);
  }
}

export async function saveWebhook(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "id");
    if (id) {
      await updateWebhook(actor, id, { active: formData.get("active") === "true" });
    } else {
      await createWebhook(actor, {
        url: text(formData, "url"),
        events: text(formData, "events").split(",").map((item) => item.trim()).filter(Boolean),
      });
    }
    redirect("/settings/webhooks?notice=Webhook saved");
  } catch (error) {
    return failure(error);
  }
}

export async function saveOfficeSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    await updateAppSettings(actor, {
      invoiceTolerancePence: Math.round(Number(text(formData, "tolerancePounds") || "0") * 100),
      defaultDepositPercent: Number(text(formData, "defaultDepositPercent")),
      vatRateBps: Math.round(Number(text(formData, "vatPercent") || "20") * 100),
    });
    redirect("/settings?notice=Settings saved");
  } catch (error) {
    return failure(error);
  }
}

export async function saveStage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "id");
    if (text(formData, "delete") === "true") await deleteStage(actor, id);
    else if (id) await updateStage(actor, id, { name: text(formData, "name"), colour: text(formData, "colour") });
    else await createStage(actor, { name: text(formData, "name"), slug: text(formData, "slug"), colour: text(formData, "colour") });
    redirect("/settings?notice=Pipeline updated");
  } catch (error) {
    return failure(error);
  }
}

export async function saveQuickTrade(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const mode = text(formData, "customerMode");
    const result = await quickAddTradeJob(actor, {
      customerId: mode === "new" ? null : text(formData, "customerId"),
      newCustomer: mode === "new" ? {
        companyName: text(formData, "companyName"),
        contactName: text(formData, "contactName"),
        email: text(formData, "email"),
        phone: text(formData, "phone"),
        city: text(formData, "city"),
        postcode: text(formData, "postcode"),
      } : null,
      jobType: text(formData, "jobType"),
      description: text(formData, "description"),
      customerReference: text(formData, "customerReference"),
      siteAddress: text(formData, "siteAddress"),
      surveyWaived: formData.get("surveyWaived") === "on",
      repeatLast: formData.get("repeatLast") === "on",
      emailId: text(formData, "emailId") || null,
    });
    redirect(`/contracts/${result.contract.id}?notice=Trade job ${result.contract.number} opened`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveJobChannel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "contractId");
    const channel = text(formData, "channel") === "trade" ? "TRADE" : "BELLWOODS";
    await updateContract(actor, id, {
      channel,
      surveyWaived: formData.get("surveyWaived") === "on",
      customerReference: text(formData, "customerReference"),
    });
    if (channel === "TRADE") {
      const liveDeposit = await prisma.customerInvoice.findFirst({ where: { contractId: id, type: "DEPOSIT", status: { not: "VOID" } } });
      if (!liveDeposit) await prisma.contract.update({ where: { id }, data: { depositSkipped: true, depositPercent: 0 } });
    }
    redirect(`/contracts/${id}?notice=Channel updated`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveEmailAssignment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const id = text(formData, "emailId");
    await assignEmail(actor, id, { customerId: text(formData, "customerId") || null, contractId: text(formData, "contractId") || null });
    redirect(`/inbox/${id}?notice=Email assigned`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveEmailEnquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    const channel = text(formData, "channel") === "trade" ? "TRADE" : "BELLWOODS";
    const enquiry = await enquiryFromEmail(actor, text(formData, "emailId"), channel);
    redirect(`/enquiries/${enquiry.id}?notice=Enquiry created from email`);
  } catch (error) {
    return failure(error);
  }
}

export async function markInboxRead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    await markEmailRead(actor, text(formData, "emailId"), text(formData, "read") !== "false");
    revalidatePath("/inbox");
    return { ok: "Updated" };
  } catch (error) {
    return failure(error);
  }
}

export async function moveStageOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await actorFromSession();
    await reorderStages(actor, text(formData, "ids").split(",").filter(Boolean));
    redirect("/settings?notice=Pipeline reordered");
  } catch (error) {
    return failure(error);
  }
}
