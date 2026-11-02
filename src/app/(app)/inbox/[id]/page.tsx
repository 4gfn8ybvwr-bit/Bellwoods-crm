import Link from "next/link";
import { notFound } from "next/navigation";
import { formatUkDateTime } from "@/domain/dates";
import { prisma } from "@/lib/prisma";
import { saveEmailAssignment, saveEmailEnquiry, saveQuickTrade } from "@/app/actions";
import { ActionForm, PageHeader, Submit } from "@/components/ui";
import { markEmailRead } from "@/server/email/ingest";
import { actorFromSession } from "@/server/actor";

export default async function InboxEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const email = await prisma.inboundEmail.findUnique({
    where: { id },
    include: { customer: true, contract: true, enquiry: true, attachments: true },
  });
  if (!email) notFound();
  if (!email.readAt) {
    const actor = await actorFromSession();
    await markEmailRead(actor, email.id, true);
  }
  const [customers, contracts] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.contract.findMany({ include: { customer: true }, orderBy: { createdAt: "desc" }, take: 80 }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title={email.subject || "(no subject)"} lede={`${email.fromName} <${email.fromEmail}> · ${formatUkDateTime(email.receivedAt)} · ${email.source}`}>
        {email.contract && <Link className="btn" href={`/contracts/${email.contract.id}`}>{email.contract.number}</Link>}
        {email.enquiry && <Link className="btn" href={`/enquiries/${email.enquiry.id}`}>Enquiry</Link>}
      </PageHeader>
      <article className="card whitespace-pre-wrap p-4 text-sm">{email.bodyText || "No message body."}</article>
      {email.matchNotes && <p className="text-sm text-stone-600">{email.matchNotes}</p>}
      {email.attachments.length > 0 && (
        <ul className="text-sm">
          {email.attachments.map((file) => (
            <li key={file.id}><a className="text-forest underline" href={`/api/v1/email-attachments/${file.id}`}>{file.filename}</a></li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <ActionForm action={saveEmailAssignment} className="card grid gap-2 p-4">
          <h2 className="text-xl">Assign</h2>
          <input type="hidden" name="emailId" value={email.id} />
          <label className="field"><span>Customer</span>
            <select className="select" name="customerId" defaultValue={email.customerId ?? ""}>
              <option value="">Unmatched</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName || customer.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Job</span>
            <select className="select" name="contractId" defaultValue={email.contractId ?? ""}>
              <option value="">None</option>
              {contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.number} · {contract.customer.companyName || contract.customer.name}</option>)}
            </select>
          </label>
          <Submit tone="dark">Save assignment</Submit>
        </ActionForm>
        <div className="space-y-3">
          <ActionForm action={saveEmailEnquiry} className="card grid gap-2 p-4">
            <h2 className="text-xl">New enquiry</h2>
            <input type="hidden" name="emailId" value={email.id} />
            <select className="select" name="channel" defaultValue={email.customer?.type === "TRADE" ? "trade" : "bellwoods"}>
              <option value="bellwoods">Bellwoods</option>
              <option value="trade">Trade</option>
            </select>
            <Submit>Create enquiry</Submit>
          </ActionForm>
          {email.customer?.type === "TRADE" && (
            <ActionForm action={saveQuickTrade} className="trade-surface grid gap-2 p-4">
              <h2 className="text-xl">Quick trade job</h2>
              <input type="hidden" name="customerMode" value="existing" />
              <input type="hidden" name="customerId" value={email.customerId ?? ""} />
              <input type="hidden" name="emailId" value={email.id} />
              <input type="hidden" name="jobType" value="Supply and fit" />
              <input type="hidden" name="description" value={email.subject} />
              <p className="text-sm">Opens a trade job for {email.customer.companyName || email.customer.name} from this email.</p>
              <Submit>Open trade job</Submit>
            </ActionForm>
          )}
          {!email.customer && <p className="text-sm text-stone-600">Assign a trade customer to open a trade job in one click.</p>}
        </div>
      </div>
    </div>
  );
}
