import { allow, type Actor } from "@/domain/permissions";
import { ServiceError } from "@/domain/errors";
import { labourCostPence } from "@/domain/labour";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "./activity";
import { emitEvent } from "./webhooks";

const RATE_TYPES = new Set(["DAY", "HOUR", "WEEK"]);

export async function savePerson(
  actor: Actor,
  input: {
    name: string;
    trade: string;
    employment: string;
    rateType: string;
    ratePence: number;
    active?: boolean;
    notes?: string;
  },
  id?: string,
) {
  allow(actor, "finance");
  if (!input.name.trim()) throw new ServiceError(400, "Name is required");
  if (!RATE_TYPES.has(input.rateType)) throw new ServiceError(400, "Rate must be per day, per hour or per week");
  if (!Number.isInteger(input.ratePence) || input.ratePence < 0) throw new ServiceError(400, "Rate must be zero or more");
  const data = {
    name: input.name.trim(),
    trade: input.trade.trim() || "Fitter",
    employment: input.employment.trim() || "Employed",
    rateType: input.rateType,
    ratePence: input.ratePence,
    active: input.active ?? true,
    notes: input.notes?.trim() ?? "",
  };
  if (id) {
    const existing = await prisma.labourPerson.findUnique({ where: { id } });
    if (!existing) throw new ServiceError(404, "Person not found");
    return prisma.labourPerson.update({ where: { id }, data });
  }
  return prisma.labourPerson.create({ data });
}

export async function addLabourEntry(
  actor: Actor,
  input: { contractId: string; personId: string; workDate: Date; days?: number; hours?: number; notes?: string },
) {
  allow(actor, "labour");
  const contract = await prisma.contract.findUnique({ where: { id: input.contractId } });
  if (!contract) throw new ServiceError(404, "Contract not found");
  const person = await prisma.labourPerson.findUnique({ where: { id: input.personId } });
  if (!person || !person.active) throw new ServiceError(400, "Choose an active person");
  const days = Number(input.days ?? 0);
  const hours = Number(input.hours ?? 0);
  if (!Number.isFinite(days) || !Number.isFinite(hours) || days < 0 || hours < 0) {
    throw new ServiceError(400, "Days and hours cannot be negative");
  }
  if (person.rateType === "HOUR" && hours <= 0) throw new ServiceError(400, "Enter the hours worked");
  if (person.rateType !== "HOUR" && days <= 0) throw new ServiceError(400, "Enter the days worked");
  const costPence = labourCostPence(person, { days, hours });
  const entry = await prisma.labourEntry.create({
    data: {
      contractId: contract.id,
      personId: person.id,
      workDate: input.workDate,
      days,
      hours,
      costPence,
      notes: input.notes?.trim() ?? "",
    },
    include: { person: true },
  });
  await recordActivity({
    actor,
    contractId: contract.id,
    entityType: "labour",
    entityId: entry.id,
    kind: "labour",
    body: `logged ${person.name} on ${contract.number}`,
  });
  await emitEvent("labour.recorded", {
    labourEntryId: entry.id,
    contractId: contract.id,
    contractNumber: contract.number,
    person: person.name,
    costPence,
    workDate: input.workDate.toISOString(),
  });
  return entry;
}

export async function deleteLabourEntry(actor: Actor, id: string) {
  allow(actor, "labour");
  const entry = await prisma.labourEntry.findUnique({ where: { id }, include: { person: true } });
  if (!entry) throw new ServiceError(404, "Labour entry not found");
  await prisma.labourEntry.delete({ where: { id } });
  await recordActivity({
    actor,
    contractId: entry.contractId,
    entityType: "labour",
    entityId: id,
    kind: "labour",
    body: `removed labour for ${entry.person.name}`,
  });
  return { ok: true };
}
