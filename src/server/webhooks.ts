import { createHmac, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export type WebhookEvent =
  | "enquiry.created"
  | "quote.sent"
  | "quote.accepted"
  | "quote.rejected"
  | "contract.created"
  | "contract.stage_changed"
  | "contract.ready_to_order"
  | "purchase_order.created"
  | "purchase_order.sent"
  | "purchase_order.delivered"
  | "supplier_invoice.recorded"
  | "supplier_invoice.needs_review"
  | "supplier_invoice.approved"
  | "supplier_invoice.rejected"
  | "customer_invoice.created"
  | "customer_invoice.paid"
  | "labour.recorded"
  | "document.uploaded";

/**
 * Webhook deliveries are signed with HMAC-SHA256 in `X-Bellwoods-Signature`.
 * A failed receiver is recorded and does not roll back the CRM change.
 * Events are also the extension point for a future Xero sync.
 */
export async function emitEvent(event: WebhookEvent, data: unknown) {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { active: true } });
  for (const endpoint of endpoints) {
    const wanted = endpoint.events.split(",").map((item) => item.trim()).filter(Boolean);
    if (!wanted.includes("*") && !wanted.includes(event)) continue;
    const payload = JSON.stringify({
      id: randomUUID(),
      type: event,
      createdAt: new Date().toISOString(),
      data,
    });
    let status = "FAILED";
    let responseStatus: number | null = null;
    let error = "";
    try {
      const signature = createHmac("sha256", endpoint.secret).update(payload).digest("hex");
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "BellwoodsCRM/0.1",
          "x-bellwoods-event": event,
          "x-bellwoods-signature": `sha256=${signature}`,
        },
        body: payload,
        signal: AbortSignal.timeout(2000),
      });
      responseStatus = response.status;
      status = response.ok ? "SUCCESS" : "FAILED";
      if (!response.ok) error = `HTTP ${response.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : "Delivery failed";
    }
    await prisma.webhookDelivery.create({
      data: { endpointId: endpoint.id, event, payload, status, responseStatus, error },
    });
  }
}
