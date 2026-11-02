import Link from "next/link";
import { parseChannelFilter } from "@/domain/channel";
import { formatGbp } from "@/domain/money";
import { board } from "@/server/queries";
import { ChannelLinks } from "@/components/channel-links";
import { PageHeader } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "Board" };

export default async function BoardPage({ searchParams }: { searchParams: SearchParams }) {
  const channel = parseChannelFilter(first((await searchParams).channel));
  const stages = await board(channel);
  return (
    <div>
      <PageHeader title="Pipeline" lede="Every live contract, in stage order. Trade cards are blue.">
        <ChannelLinks current={channel === "ALL" ? "all" : channel === "TRADE" ? "trade" : "bellwoods"} path="/contracts/board" />
        <Link className="btn" href="/contracts">List</Link>
      </PageHeader>
      <div className="kanban">
        {stages.map((stage) => (
          <section key={stage.id} className="kanban-col card">
            <header className="border-b border-line px-3 py-2" style={{ borderTop: `4px solid ${stage.colour}` }}>
              <h2 className="text-sm font-semibold">{stage.name}</h2>
              <p className="text-xs text-stone-500">{stage.contracts.length}</p>
            </header>
            <div className="space-y-2 p-2">
              {stage.contracts.map((contract) => (
                <Link key={contract.id} href={`/contracts/${contract.id}`} className={`block rounded-md border p-2 text-sm hover:border-copper ${contract.channel === "TRADE" ? "trade-card border-sky-300" : "border-line bg-white"}`}>
                  <p className="font-semibold text-forest">{contract.number}</p>
                  <p>{contract.customer.name}</p>
                  <p className="num text-stone-600">{formatGbp(contract.salesValuePence)}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
