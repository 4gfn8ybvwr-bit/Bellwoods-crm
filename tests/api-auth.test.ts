import { beforeAll, describe, expect, it } from "vitest";
import { hashApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatch } from "@/server/http";
import { routes } from "@/server/routes";
import { seedReference } from "./fixture";

async function call(method: string, path: string, key?: string, body?: unknown) {
  const headers = new Headers();
  if (key) headers.set("authorization", `Bearer ${key}`);
  if (body) headers.set("content-type", "application/json");
  const response = await dispatch(
    new Request(`http://localhost/api/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }),
    path.split("/").filter(Boolean),
    routes,
  );
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

describe("API auth", () => {
  const readKey = "bw_live_test_readonly_key";
  const writeKey = "bw_live_test_readwrite_key";
  const revokedKey = "bw_live_test_revoked_key";
  let contractId = "";

  beforeAll(async () => {
    const fx = await seedReference();
    const quote = await prisma.quote.create({
      data: {
        number: "Q-1",
        customerId: fx.customer.id,
        status: "DRAFT",
        netPence: 1000,
        vatPence: 200,
        grossPence: 1200,
        lines: { create: [{ productType: "WINDOW", description: "One", quantity: 1, unitPricePence: 1000, netPence: 1000, sortOrder: 0 }] },
      },
    });
    const stage = await prisma.stage.findUniqueOrThrow({ where: { slug: "enquiry" } });
    const contract = await prisma.contract.create({
      data: { number: "BW24000", type: "BW", customerId: fx.customer.id, stageId: stage.id, quoteId: quote.id, salesValuePence: 1000 },
    });
    contractId = contract.id;
    await prisma.sequence.update({ where: { id: "contract" }, data: { next: 24001 } });
    await prisma.apiKey.createMany({
      data: [
        { name: "Read", prefix: "bw_live_test_rea", keyHash: hashApiKey(readKey), scopes: "read", createdById: fx.user.id },
        { name: "Ordering assistant", prefix: "bw_live_test_wri", keyHash: hashApiKey(writeKey), scopes: "read,write", createdById: fx.user.id },
        { name: "Old", prefix: "bw_live_test_old", keyHash: hashApiKey(revokedKey), scopes: "write", revokedAt: new Date(), createdById: fx.user.id },
      ],
    });
  });

  it("rejects missing, unknown and revoked keys", async () => {
    expect((await call("GET", "customers")).status).toBe(401);
    expect((await call("GET", "customers", "bw_live_not_a_real_key")).status).toBe(401);
    expect((await call("GET", "customers", revokedKey)).status).toBe(401);
  });

  it("lets a read-only key read and refuses writes", async () => {
    const listed = await call("GET", "customers", readKey);
    expect(listed.status).toBe(200);
    const denied = await call("POST", "customers", readKey, { type: "DOMESTIC", name: "Nobody" });
    expect(denied.status).toBe(403);
  });

  it("records the API key on the activity timeline", async () => {
    const created = await call("POST", "customers", writeKey, { type: "DOMESTIC", name: "API Customer", phone: "07000 111222" });
    expect(created.status).toBe(201);
    const note = await call("POST", `contracts/${contractId}/notes`, writeKey, { body: "Ordered from the assistant" });
    expect(note.status).toBe(201);
    const activity = await prisma.activity.findFirst({ where: { contractId, kind: "note" }, include: { apiKey: true } });
    expect(activity?.apiKey?.name).toBe("Ordering assistant");
    expect(activity?.body).toContain("API key");
    expect(activity?.body).toContain("Ordered from the assistant");
  });
});
