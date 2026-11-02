import type { Actor } from "@/domain/permissions";
import { ingestEmail } from "@/server/email/ingest";

export const dynamic = "force-dynamic";

/**
 * Inbound email webhook. Authenticate with the shared secret in
 * INBOUND_EMAIL_SECRET. No mailbox password lives in this file.
 * Body: { fromEmail, fromName, subject, text, messageId, attachments?: [{ filename, contentType, contentBase64 }] }
 */
export async function POST(request: Request) {
  const configured = process.env.INBOUND_EMAIL_SECRET;
  const provided = request.headers.get("x-bellwoods-inbound-secret");
  if (!configured || provided !== configured) {
    return Response.json({ error: "Inbound email webhook is not configured" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.fromEmail !== "string") {
    return Response.json({ error: "fromEmail is required" }, { status: 400 });
  }
  const actor: Actor = {
    userId: null,
    apiKeyId: null,
    apiKeyName: "Inbound webhook",
    name: "Inbound webhook",
    role: null,
    scopes: ["write"],
    source: "api",
  };
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const email = await ingestEmail(actor, {
    fromName: typeof body.fromName === "string" ? body.fromName : "",
    fromEmail: body.fromEmail,
    subject: typeof body.subject === "string" ? body.subject : "",
    bodyText: typeof body.text === "string" ? body.text : typeof body.bodyText === "string" ? body.bodyText : "",
    messageId: typeof body.messageId === "string" ? body.messageId : null,
    source: "WEBHOOK",
    attachments: attachments.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        filename: typeof row.filename === "string" ? row.filename : "file.txt",
        mimeType: typeof row.contentType === "string" ? row.contentType : "text/plain",
        bytes: Buffer.from(typeof row.contentBase64 === "string" ? row.contentBase64 : "", "base64"),
      };
    }),
  });
  return Response.json({ data: { id: email.id, customerId: email.customerId, contractId: email.contractId } }, { status: 201 });
}
