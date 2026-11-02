import Link from "next/link";
import { formatGbp } from "@/domain/money";
import { parseChannelFilter } from "@/domain/channel";
import { listContracts } from "@/server/queries";
import { prisma } from "@/lib/prisma";
import { ChannelLinks } from "@/components/channel-links";
import { PageHeader, Empty } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "Contracts" };

export default async function ContractsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q) ?? "";
  const stage = first(params.stage) ?? "";
  const type = first(params.type) ?? "";
  const channel = parseChannelFilter(first(params.channel));
  const [{ data }, stages] = await Promise.all([
    listContracts({ q, stage, type, channel }),
    prisma.stage.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Contracts" lede="BW retail, TC trade and commercial repair share one contract number sequence.">
        <a className="btn" href="/api/v1/exports/contracts" download>Export CSV</a>
        <Link className="btn" href="/contracts/board">Board</Link>
      </PageHeader>
      <div className="mb-3"><ChannelLinks current={channel === "ALL" ? "all" : channel === "TRADE" ? "trade" : "bellwoods"} path="/contracts" extra={{ ...(q ? { q } : {}), ...(stage ? { stage } : {}) }} /></div>
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        {channel !== "ALL" && <input type="hidden" name="channel" value={channel === "TRADE" ? "trade" : "bellwoods"} />}
        <input className="input max-w-xs" name="q" defaultValue={q} placeholder="Number, customer, site" />
        <select className="select max-w-[200px]" name="stage" defaultValue={stage}>
          <option value="">All stages</option>
          {stages.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
        </select>
        <select className="select max-w-[140px]" name="type" defaultValue={type}>
          <option value="">All types</option>
          <option value="BW">BW</option>
          <option value="TC">TC</option>
          <option value="CM">CM</option>
        </select>
        <button className="btn">Filter</button>
      </form>
      <div className="card">
        <table className="data">
          <thead><tr><th>Number</th><th>Customer</th><th>Stage</th><th>Site</th><th>Agreed net</th></tr></thead>
          <tbody>
            {data.map((contract) => (
              <tr key={contract.id} className={contract.channel === "TRADE" ? "trade-row" : ""}>
                <td><Link className="font-semibold text-forest" href={`/contracts/${contract.id}`}>{contract.number}</Link></td>
                <td>{contract.customer.name}</td>
                <td>{contract.stage.name}</td>
                <td>{contract.siteAddress}</td>
                <td className="num">{formatGbp(contract.salesValuePence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <Empty>No contracts.</Empty>}
      </div>
    </div>
  );
}
