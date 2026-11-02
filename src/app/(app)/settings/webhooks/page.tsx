import { formatUkDateTime } from "@/domain/dates";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { saveWebhook } from "@/app/actions";
import { ActionForm, PageHeader, Submit } from "@/components/ui";

export const metadata = { title: "Webhooks" };

const EVENTS = [
  "*",
  "contract.stage_changed",
  "contract.ready_to_order",
  "quote.accepted",
  "supplier_invoice.recorded",
  "supplier_invoice.needs_review",
  "customer_invoice.created",
  "customer_invoice.paid",
];

export default async function WebhooksPage() {
  const session = await getSession();
  const [endpoints, deliveries] = await Promise.all([
    prisma.webhookEndpoint.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { endpoint: true } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Webhooks" lede="Bellwoods posts JSON when a stage changes or an invoice is recorded. The body is signed with HMAC-SHA256 in X-Bellwoods-Signature so a future Xero worker can trust it." />
      {session?.role === "ADMIN" && (
        <ActionForm action={saveWebhook} className="card grid max-w-xl gap-2 p-4">
          <label className="field"><span>URL</span><input className="input" name="url" placeholder="https://example.com/hooks/bellwoods" required /></label>
          <label className="field"><span>Events</span>
            <input className="input" name="events" defaultValue="contract.stage_changed, supplier_invoice.recorded, customer_invoice.created" />
          </label>
          <p className="text-xs text-stone-500">Comma-separated. Use * for every event. Known events: {EVENTS.join(", ")}.</p>
          <Submit>Add endpoint</Submit>
        </ActionForm>
      )}
      <div className="card">
        <table className="data">
          <thead><tr><th>URL</th><th>Events</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {endpoints.map((endpoint) => (
              <tr key={endpoint.id}>
                <td className="max-w-xs truncate">{endpoint.url}</td>
                <td>{endpoint.events}</td>
                <td>{endpoint.active ? "Yes" : "No"}</td>
                <td>
                  {session?.role === "ADMIN" && (
                    <ActionForm action={saveWebhook}>
                      <input type="hidden" name="id" value={endpoint.id} />
                      <input type="hidden" name="active" value={endpoint.active ? "false" : "true"} />
                      <Submit tone="plain">{endpoint.active ? "Pause" : "Resume"}</Submit>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card p-4">
        <h2 className="text-xl">Recent deliveries</h2>
        <ul className="mt-2 text-sm">
          {deliveries.map((delivery) => (
            <li key={delivery.id} className="border-b border-stone-100 py-2">
              {formatUkDateTime(delivery.createdAt)} · {delivery.event} · {delivery.status} {delivery.error}
            </li>
          ))}
          {deliveries.length === 0 && <li className="text-stone-500">No deliveries yet.</li>}
        </ul>
      </section>
    </div>
  );
}
