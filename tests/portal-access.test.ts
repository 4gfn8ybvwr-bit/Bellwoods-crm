import { beforeAll, describe, expect, it } from "vitest";
import { hashApiKey } from "@/lib/auth";
import { ServiceError } from "@/domain/errors";
import { prisma } from "@/lib/prisma";
import { dispatch } from "@/server/http";
import { routes } from "@/server/routes";
import { addContact, createCustomer } from "@/server/customers";
import { portalAccountForCustomer, setContactPortalAccess, setCustomerPortalAccess } from "@/server/portal";
import { seedReference } from "./fixture";

describe("trade portal access", () => {
  let fx: Awaited<ReturnType<typeof seedReference>>;

  beforeAll(async () => {
    fx = await seedReference();
  });

  it("refuses portal access and portal data for a Bellwoods retail customer", async () => {
    const retail = await createCustomer(fx.actor, { type: "DOMESTIC", name: "Retail Household", email: "retail@example.com" });
    await expect(setCustomerPortalAccess(fx.actor, retail.id, true)).rejects.toBeInstanceOf(ServiceError);
    await expect(setCustomerPortalAccess(fx.actor, retail.id, true)).rejects.toMatchObject({ status: 403 });

    await prisma.customer.update({ where: { id: retail.id }, data: { portalEnabled: true } });
    await expect(portalAccountForCustomer(retail.id)).rejects.toMatchObject({ status: 403 });

    const contact = await addContact(fx.actor, retail.id, { name: "Retail Buyer", email: "retail.buyer@example.com", isPrimary: true });
    await expect(setContactPortalAccess(fx.actor, contact.id, { enabled: true, password: "Retail-nope-2026" })).rejects.toMatchObject({ status: 403 });
  });

  it("allows a trade account and still hides a retail account from the API", async () => {
    const trade = await createCustomer(fx.actor, {
      type: "TRADE",
      name: "Portal Buyer",
      companyName: "Portal Joinery Ltd",
      email: "buyer@portal-joinery.example",
    });
    await setCustomerPortalAccess(fx.actor, trade.id, true);
    const contact = await addContact(fx.actor, trade.id, { name: "Portal Buyer", email: "buyer@portal-joinery.example", isPrimary: true });
    await setContactPortalAccess(fx.actor, contact.id, { enabled: true, password: "Trade-portal-2026" });
    const view = await portalAccountForCustomer(trade.id);
    expect(view.customer.type).toBe("TRADE");
    expect(view.dueDateNote).toMatch(/Camden Direct/i);

    const key = "bw_live_portal_test_write";
    await prisma.apiKey.create({
      data: { name: "Portal test", prefix: key.slice(0, 16), keyHash: hashApiKey(key), scopes: "read,write", createdById: fx.user.id },
    });
    const retail = await prisma.customer.findFirstOrThrow({ where: { email: "retail@example.com" } });
    const denied = await dispatch(
      new Request(`http://localhost/api/v1/customers/${retail.id}/portal`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
      ["customers", retail.id, "portal"],
      routes,
    );
    expect(denied.status).toBe(403);
    const hidden = await dispatch(
      new Request(`http://localhost/api/v1/customers/${retail.id}/portal`, {
        method: "GET",
        headers: { authorization: `Bearer ${key}` },
      }),
      ["customers", retail.id, "portal"],
      routes,
    );
    expect(hidden.status).toBe(403);
    const allowed = await dispatch(
      new Request(`http://localhost/api/v1/customers/${trade.id}/portal`, {
        method: "GET",
        headers: { authorization: `Bearer ${key}` },
      }),
      ["customers", trade.id, "portal"],
      routes,
    );
    expect(allowed.status).toBe(200);
  });
});
