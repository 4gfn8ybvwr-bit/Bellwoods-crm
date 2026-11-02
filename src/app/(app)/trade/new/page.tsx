import { tradeCustomers } from "@/server/trade";
import { QuickTradeForm } from "@/components/quick-trade-form";
import { PageHeader } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "New trade job" };

export default async function NewTradeJobPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const customers = await tradeCustomers();
  return (
    <div>
      <PageHeader title="New trade job" lede="For Seb. Pick the account, the job type, and save. A lead is stored with the contract. Deposit is skipped. Invoices still belong to Bellwoods Windows and Doors Ltd." />
      <QuickTradeForm
        customers={customers}
        initialCustomerId={first(params.customer)}
        initialDescription={first(params.description)}
        emailId={first(params.email)}
      />
    </div>
  );
}
