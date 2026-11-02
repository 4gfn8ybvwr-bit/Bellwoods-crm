import type { InboundEmailInput } from "./ingest";

/**
 * Mail sources sit behind one interface. Nothing here contains a real
 * password or tenant id. Microsoft 365 is the intended live source; IMAP is
 * available for a mailbox that is not on Graph yet.
 */
export type MailSource = {
  id: "imap" | "microsoft-graph";
  label: string;
  configured: () => boolean;
  pull: () => Promise<InboundEmailInput[]>;
};

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

export const imapSource: MailSource = {
  id: "imap",
  label: "IMAP",
  configured() {
    return Boolean(env("IMAP_HOST") && env("IMAP_USER") && env("IMAP_PASSWORD"));
  },
  async pull() {
    if (!this.configured()) return [];
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host: env("IMAP_HOST"),
      port: Number(env("IMAP_PORT") || 993),
      secure: env("IMAP_SECURE") !== "false",
      auth: { user: env("IMAP_USER"), pass: env("IMAP_PASSWORD") },
    });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const messages: InboundEmailInput[] = [];
    try {
      for await (const message of client.fetch({ seen: false }, { envelope: true, source: true, uid: true })) {
        const from = message.envelope?.from?.[0];
        const address = from?.address ?? "";
        if (!address) continue;
        const raw = message.source?.toString("utf8") ?? "";
        const body = raw.split(/\r?\n\r?\n/).slice(1).join("\n").slice(0, 20000);
        messages.push({
          fromName: from?.name ?? "",
          fromEmail: address,
          subject: message.envelope?.subject ?? "",
          bodyText: body,
          messageId: message.envelope?.messageId ?? null,
          receivedAt: message.envelope?.date instanceof Date ? message.envelope.date : new Date(),
          source: "IMAP",
        });
        if (message.uid) await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
      await client.logout();
    }
    return messages;
  },
};

export const graphSource: MailSource = {
  id: "microsoft-graph",
  label: "Microsoft 365",
  configured() {
    return Boolean(env("GRAPH_TENANT_ID") && env("GRAPH_CLIENT_ID") && env("GRAPH_CLIENT_SECRET") && env("GRAPH_MAILBOX"));
  },
  async pull() {
    if (!this.configured()) return [];
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${env("GRAPH_TENANT_ID")}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("GRAPH_CLIENT_ID"),
        client_secret: env("GRAPH_CLIENT_SECRET"),
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!tokenResponse.ok) throw new Error(`Microsoft token request failed (${tokenResponse.status})`);
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) throw new Error("Microsoft token response had no access token");
    const mailbox = encodeURIComponent(env("GRAPH_MAILBOX"));
    const list = await fetch(
      `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/inbox/messages?$top=25&$select=subject,from,body,receivedDateTime,internetMessageId,hasAttachments`,
      { headers: { authorization: `Bearer ${token.access_token}` } },
    );
    if (!list.ok) throw new Error(`Microsoft Graph mailbox read failed (${list.status})`);
    const payload = (await list.json()) as {
      value?: {
        subject?: string;
        body?: { content?: string };
        receivedDateTime?: string;
        internetMessageId?: string;
        from?: { emailAddress?: { name?: string; address?: string } };
      }[];
    };
    return (payload.value ?? []).flatMap((message) => {
      const address = message.from?.emailAddress?.address;
      if (!address) return [];
      const text = (message.body?.content ?? "").replace(/<[^>]+>/g, " ");
      return [{
        fromName: message.from?.emailAddress?.name ?? "",
        fromEmail: address,
        subject: message.subject ?? "",
        bodyText: text,
        messageId: message.internetMessageId ?? null,
        receivedAt: message.receivedDateTime ? new Date(message.receivedDateTime) : new Date(),
        source: "MICROSOFT_GRAPH",
      }];
    });
  },
};

export function mailSourceStatus() {
  return [imapSource, graphSource].map((source) => ({
    id: source.id,
    label: source.label,
    configured: source.configured(),
  }));
}
