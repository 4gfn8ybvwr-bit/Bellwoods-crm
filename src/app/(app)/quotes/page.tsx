import Link from "next/link";
import { formatGbp } from "@/domain/money";
import { formatUkDate } from "@/domain/dates";
import { parseChannelFilter } from "@/domain/channel";
import { prisma } from "@/lib/prisma";
import { ChannelLinks } from "@/components/channel-links";
import { PageHeader, Empty } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "Quotes" };

export default async function QuotesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = first(params.status) ?? "";
  const channel = parseChannelFilter(first(params.channel));
  const quotes = await prisma.quote.findMany({
    where: { ...(status ? { status } : {}), ...(channel === "ALL" ? {} : { channel }) },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Quotes" lede="Window and door schedules. Sent quotes stay here until someone follows them up.">
        <a className="btn" href="/api/v1/exports/quotes" download>Export CSV</a>
        <Link className="btn btn-primary" href="/quotes/new">New quote</Link>
      </PageHeader>
      <div className="mb-3"><ChannelLinks current={channel === "ALL" ? "all" : channel === "TRADE" ? "trade" : "bellwoods"} path="/quotes" extra={status ? { status } : {}} /></div>
      <form className="mb-4" method="get">
        {channel !== "ALL" && <input type="hidden" name="channel" value={channel === "TRADE" ? "trade" : "bellwoods"} />}
        <select className="select max-w-[200px]" name="status" defaultValue={status}>
          <option value="">All</option>
          <option value="DRAFT">Draft</option>
          <option value="SENT">Sent</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <button className="btn ml-2">Filter</button>
      </form>
      <div className="card">
        <table className="data">
          <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Net</th><th>Gross</th><th>Created</th></tr></thead>
          <tbody>
            {quotes.map((quote) => (
              <tr key={quote.id} className={quote.channel === "TRADE" ? "trade-row" : ""}>
                <td><Link className="font-semibold text-forest" href={`/quotes/${quote.id}`}>{quote.number}</Link></td>
                <td>{quote.customer.name}</td>
                <td>{quote.status}</td>
                <td className="num">{formatGbp(quote.netPence)}</td>
                <td className="num">{formatGbp(quote.grossPence)}</td>
                <td className="num">{formatUkDate(quote.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {quotes.length === 0 && <Empty>No quotes.</Empty>}
      </div>
    </div>
  );
}
