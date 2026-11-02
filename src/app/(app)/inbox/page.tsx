import Link from "next/link";
import { formatUkDateTime } from "@/domain/dates";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const unmatched = first((await searchParams).unmatched) === "1";
  const emails = await prisma.inboundEmail.findMany({
    where: unmatched ? { customerId: null } : undefined,
    include: { customer: true, contract: true, attachments: true },
    orderBy: { receivedAt: "desc" },
  });
  const unread = emails.filter((email) => !email.readAt).length;
  return (
    <div>
      <PageHeader title="Inbox" lede={`${unread} unread on this list. Mail is matched by sender and by a contract number or customer reference in the message.`}>
        <Link className="btn" href={unmatched ? "/inbox" : "/inbox?unmatched=1"}>{unmatched ? "Show all" : "Unmatched only"}</Link>
      </PageHeader>
      <div className="card">
        <table className="data">
          <thead><tr><th>Received</th><th>From</th><th>Subject</th><th>Matched</th></tr></thead>
          <tbody>
            {emails.map((email) => (
              <tr key={email.id} className={!email.readAt ? "font-semibold" : ""}>
                <td className="num whitespace-nowrap">{formatUkDateTime(email.receivedAt)}</td>
                <td>{email.fromName || email.fromEmail}<div className="font-normal text-stone-500">{email.fromEmail}</div></td>
                <td><Link className="text-forest" href={`/inbox/${email.id}`}>{email.subject || "(no subject)"}</Link>{email.attachments.length > 0 && <span className="ml-2 text-xs font-normal text-stone-500">{email.attachments.length} file</span>}</td>
                <td className="font-normal">{email.contract ? <Link href={`/contracts/${email.contractId}`}>{email.contract.number}</Link> : email.customer ? (email.customer.companyName || email.customer.name) : "Unmatched"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {emails.length === 0 && <p className="px-3 py-8 text-center text-sm text-stone-500">The inbox is empty.</p>}
      </div>
    </div>
  );
}
