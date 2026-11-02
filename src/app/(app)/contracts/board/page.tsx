import Link from "next/link";
import { formatGbp } from "@/domain/money";
import { board } from "@/server/queries";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Board" };

export default async function BoardPage() {
  const stages = await board();
  return (
    <div>
      <PageHeader title="Pipeline" lede="Every live contract, in stage order.">
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
                <Link key={contract.id} href={`/contracts/${contract.id}`} className="block rounded-md border border-line bg-white p-2 text-sm hover:border-copper">
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
