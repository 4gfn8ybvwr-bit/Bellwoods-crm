import { allow, type Actor } from "@/domain/permissions";
import { ServiceError } from "@/domain/errors";
import { prisma } from "@/lib/prisma";

export type AddressInput = {
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  county?: string;
  postcode: string;
  isPrimary?: boolean;
};

export type ContactInput = {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
};

export type CustomerInput = {
  type: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  notes?: string;
  address?: AddressInput | null;
  contact?: ContactInput | null;
};

function assertCustomerType(type: string) {
  if (type !== "DOMESTIC" && type !== "TRADE") {
    throw new ServiceError(400, "Customer type must be domestic or trade");
  }
}

async function setPrimaryAddress(customerId: string, addressId: string) {
  await prisma.address.updateMany({ where: { customerId }, data: { isPrimary: false } });
  await prisma.address.update({ where: { id: addressId }, data: { isPrimary: true } });
}

async function setPrimaryContact(customerId: string, contactId: string) {
  await prisma.contact.updateMany({ where: { customerId }, data: { isPrimary: false } });
  await prisma.contact.update({ where: { id: contactId }, data: { isPrimary: true } });
}

export async function createCustomer(actor: Actor, input: CustomerInput) {
  allow(actor, "write");
  assertCustomerType(input.type);
  if (!input.name.trim()) throw new ServiceError(400, "Customer name is required");
  if (input.type === "TRADE" && !input.companyName?.trim()) {
    throw new ServiceError(400, "A trade customer needs a company name");
  }
  const customer = await prisma.customer.create({
    data: {
      type: input.type,
      name: input.name.trim(),
      companyName: input.companyName?.trim() ?? "",
      email: input.email?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      addresses: input.address
        ? {
            create: {
              label: input.address.label?.trim() || "Home",
              line1: input.address.line1.trim(),
              line2: input.address.line2?.trim() ?? "",
              city: input.address.city.trim(),
              county: input.address.county?.trim() ?? "",
              postcode: input.address.postcode.trim().toUpperCase(),
              isPrimary: true,
            },
          }
        : undefined,
      contacts: input.contact
        ? {
            create: {
              name: input.contact.name.trim(),
              email: input.contact.email?.trim() ?? "",
              phone: input.contact.phone?.trim() ?? "",
              role: input.contact.role?.trim() ?? "",
              isPrimary: true,
            },
          }
        : undefined,
    },
    include: { addresses: true, contacts: true },
  });
  return customer;
}

export async function updateCustomer(actor: Actor, id: string, input: Partial<CustomerInput>) {
  allow(actor, "write");
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Customer not found");
  const type = input.type ?? existing.type;
  assertCustomerType(type);
  const companyName = input.companyName !== undefined ? input.companyName.trim() : existing.companyName;
  if (type === "TRADE" && !companyName) throw new ServiceError(400, "A trade customer needs a company name");
  if (type !== "TRADE" && existing.portalEnabled) {
    await prisma.contact.updateMany({
      where: { customerId: id },
      data: { portalEnabled: false, portalPasswordHash: "" },
    });
  }
  return prisma.customer.update({
    where: { id },
    data: {
      type,
      name: input.name?.trim() || existing.name,
      companyName,
      email: input.email !== undefined ? input.email.trim() : existing.email,
      phone: input.phone !== undefined ? input.phone.trim() : existing.phone,
      notes: input.notes !== undefined ? input.notes.trim() : existing.notes,
      portalEnabled: type === "TRADE" ? undefined : false,
    },
    include: { addresses: true, contacts: true },
  });
}

export async function addAddress(actor: Actor, customerId: string, input: AddressInput) {
  allow(actor, "write");
  if (!input.line1?.trim() || !input.city?.trim() || !input.postcode?.trim()) {
    throw new ServiceError(400, "Address line, city and postcode are required");
  }
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ServiceError(404, "Customer not found");
  const address = await prisma.address.create({
    data: {
      customerId,
      label: input.label?.trim() || "Site",
      line1: input.line1.trim(),
      line2: input.line2?.trim() ?? "",
      city: input.city.trim(),
      county: input.county?.trim() ?? "",
      postcode: input.postcode.trim().toUpperCase(),
      isPrimary: Boolean(input.isPrimary),
    },
  });
  if (input.isPrimary) await setPrimaryAddress(customerId, address.id);
  return prisma.address.findUniqueOrThrow({ where: { id: address.id } });
}

export async function updateAddress(actor: Actor, id: string, input: Partial<AddressInput>) {
  allow(actor, "write");
  const existing = await prisma.address.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Address not found");
  const address = await prisma.address.update({
    where: { id },
    data: {
      label: input.label?.trim() ?? existing.label,
      line1: input.line1?.trim() ?? existing.line1,
      line2: input.line2 !== undefined ? input.line2.trim() : existing.line2,
      city: input.city?.trim() ?? existing.city,
      county: input.county !== undefined ? input.county.trim() : existing.county,
      postcode: input.postcode?.trim().toUpperCase() ?? existing.postcode,
    },
  });
  if (input.isPrimary) await setPrimaryAddress(existing.customerId, id);
  return prisma.address.findUniqueOrThrow({ where: { id: address.id } });
}

export async function deleteAddress(actor: Actor, id: string) {
  allow(actor, "write");
  const existing = await prisma.address.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Address not found");
  await prisma.address.delete({ where: { id } });
  return { ok: true };
}

export async function addContact(actor: Actor, customerId: string, input: ContactInput) {
  allow(actor, "write");
  if (!input.name?.trim()) throw new ServiceError(400, "Contact name is required");
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ServiceError(404, "Customer not found");
  const contact = await prisma.contact.create({
    data: {
      customerId,
      name: input.name.trim(),
      email: input.email?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      role: input.role?.trim() ?? "",
      isPrimary: Boolean(input.isPrimary),
    },
  });
  if (input.isPrimary) await setPrimaryContact(customerId, contact.id);
  return prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
}

export async function updateContact(actor: Actor, id: string, input: Partial<ContactInput>) {
  allow(actor, "write");
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Contact not found");
  await prisma.contact.update({
    where: { id },
    data: {
      name: input.name?.trim() || existing.name,
      email: input.email !== undefined ? input.email.trim() : existing.email,
      phone: input.phone !== undefined ? input.phone.trim() : existing.phone,
      role: input.role !== undefined ? input.role.trim() : existing.role,
    },
  });
  if (input.isPrimary) await setPrimaryContact(existing.customerId, id);
  return prisma.contact.findUniqueOrThrow({ where: { id } });
}

export async function deleteContact(actor: Actor, id: string) {
  allow(actor, "write");
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Contact not found");
  await prisma.contact.delete({ where: { id } });
  return { ok: true };
}

export function formatAddress(address: {
  line1: string;
  line2: string;
  city: string;
  county: string;
  postcode: string;
}) {
  return [address.line1, address.line2, address.city, address.county, address.postcode].filter(Boolean).join(", ");
}
