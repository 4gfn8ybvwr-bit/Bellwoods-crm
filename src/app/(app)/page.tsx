import Link from "next/link";
import { formatGbp, formatMargin } from "@/domain/money";
import { formatUkDate, formatUkDateTime, parseDateInput, partsInLondon, londonToUtc } from "@/domain/dates";
import { financialYearContaining, previousFinancialYear, rangeLabel } from "@/domain/financial-year";
import { parseChannelFilter } from "@/domain/channel";
import { getSettings } from "@/server/settings";
import { getDashboard } from "@/server/queries";
import { ChannelLinks } from "@/components/channel-links";
import { PageHeader } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const settings = await getSettings();
  const channel = parseChannelFilter(first(params.channel));
  const preset = first(params.preset);
  const fromText = first(params.from);
  const toText = first(params.to);
  let from: Date;
  let toExclusive: Date;
  if (fromText && toText) {
    const start = partsInLondon(parseDateInput(fromText));
    const end = partsInLondon(parseDateInput(toText));
    from = londonToUtc(start.y, start.m, start.d, 0, 0);
    toExclusive = londonToUtc(end.y, end.m, end.d + 1, 0, 0);
  } else if (preset === "previous") {
    const range = previousFinancialYear(new Date(), settings.financialYearStartMonth, settings.financialYearStartDay);
    from = range.from;
    toExclusive = range.toExclusive;
  } else {
    const range = financialYearContaining(new Date(), settings.financialYearStartMonth, settings.financialYearStartDay);
    from = range.from;
    toExclusive = range.toExclusive;
  }
  const dashboard = await getDashboard(from, toExclusive, channel);
  const endInclusive = new Date(toExclusive.getTime() - 60_000);
  const cards: [string, number, string][] = [
    ["Open enquiries", dashboard.counts.openEnquiries, "/enquiries?status=OPEN"],
    ["Quotes to follow up", dashboard.counts.quotesAwaitingFollowUp, "/quotes?status=SENT"],
    ["Ready to order", dashboard.counts.readyToOrder, "/contracts?stage=ready-to-order"],
    ["Fits in 14 days", dashboard.counts.upcomingFits, "/diary"],
    ["Invoices to review", dashboard.counts.invoicesAwaitingReview, "/purchasing/review"],
  ];
  const rows = [
    ["BW retail", dashboard.profit.byType.BW],
    ["TC trade", dashboard.profit.byType.TC],
    ["Commercial", dashboard.profit.byType.CM],
    ["Total", dashboard.profit.total],
  ] as const;

  return (
    <div>
      <PageHeader title="Today in the office" lede="Queues that need a person, then profit on jobs completed in the selected range. The financial year starts on 1 November. Filter Bellwoods or trade without splitting the company.">
        <ChannelLinks current={channel === "ALL" ? "all" : channel === "TRADE" ? "trade" : "bellwoods"} path="/" extra={{ ...(preset ? { preset } : {}), ...(fromText && toText ? { from: fromText, to: toText } : {}) }} />
      </PageHeader>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, value, href]) => (
          <Link key={label} href={href} className="card p-4 hover:border-copper">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
            <p className="num mt-2 font-serif text-4xl text-forest">{value}</p>
          </Link>
        ))}
      </div>

      <section className="card mt-6 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl text-forest">Completed job profit</h2>
            <p className="text-sm text-stone-600">{rangeLabel(from, toExclusive)}. Sales are customer invoices (net). Materials use accepted supplier invoices, or the PO value when no invoice is matched.</p>
          </div>
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="field">
              <span>From</span>
              <input className="input w-36" name="from" defaultValue={formatUkDate(from)} placeholder="dd/mm/yyyy" />
            </label>
            <label className="field">
              <span>To</span>
              <input className="input w-36" name="to" defaultValue={formatUkDate(endInclusive)} placeholder="dd/mm/yyyy" />
            </label>
            <button className="btn btn-primary">Apply</button>
          </form>
        </div>
        <div className="mt-3 flex gap-2 text-sm">
          <Link className="btn btn-small" href="/">This financial year</Link>
          <Link className="btn btn-small" href="/?preset=previous">Previous financial year</Link>
        </div>
        <div className="table-wrap mt-4">
          <table className="data">
            <thead>
              <tr>
                <th>Work</th><th>Jobs</th><th>Sales</th><th>Materials</th><th>Labour</th><th>Profit</th><th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, bucket]) => (
                <tr key={label}>
                  <td className="font-semibold">{label}</td>
                  <td className="num">{bucket.jobs}</td>
                  <td className="num">{formatGbp(bucket.salesNetPence)}</td>
                  <td className="num">{formatGbp(bucket.materialNetPence)}</td>
                  <td className="num">{formatGbp(bucket.labourNetPence)}</td>
                  <td className={`num font-semibold ${bucket.profitPence < 0 ? "text-red-800" : "text-pine"}`}>{formatGbp(bucket.profitPence)}</td>
                  <td className="num">{formatMargin(bucket.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dashboard.profit.unmatchedPurchaseOrders.length > 0 && (
          <p className="warn mt-3">
            {dashboard.profit.unmatchedPurchaseOrders.length} sent or delivered purchase orders have no accepted supplier invoice, so job costs that use the PO value may still move. Open the contract costing panel before treating a margin as final.
          </p>
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-xl">Open enquiries</h2>
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {dashboard.openEnquiries.map((enquiry) => (
              <li key={enquiry.id} className="py-2">
                <Link className="font-semibold text-forest" href={`/enquiries/${enquiry.id}`}>{enquiry.customer.name}</Link>
                <p className="text-stone-600">{enquiry.productInterest} · {enquiry.source}</p>
              </li>
            ))}
            {dashboard.openEnquiries.length === 0 && <li className="py-3 text-stone-500">None open.</li>}
          </ul>
        </section>
        <section className="card p-4">
          <h2 className="text-xl">Quotes awaiting follow-up</h2>
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {dashboard.quotesAwaitingFollowUp.map((quote) => (
              <li key={quote.id} className="flex justify-between gap-3 py-2">
                <Link className="font-semibold text-forest" href={`/quotes/${quote.id}`}>{quote.number} · {quote.customer.name}</Link>
                <span className="num">{formatGbp(quote.netPence)}</span>
              </li>
            ))}
            {dashboard.quotesAwaitingFollowUp.length === 0 && <li className="py-3 text-stone-500">None waiting.</li>}
          </ul>
        </section>
        <section className="card p-4">
          <h2 className="text-xl">Ready to order</h2>
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {dashboard.readyToOrder.map((contract) => (
              <li key={contract.id} className="py-2">
                <Link className="font-semibold text-forest" href={`/contracts/${contract.id}`}>{contract.number}</Link>
                <span className="text-stone-600"> · {contract.customer.name}</span>
              </li>
            ))}
            {dashboard.readyToOrder.length === 0 && <li className="py-3 text-stone-500">Nothing is waiting on an order.</li>}
          </ul>
        </section>
        <section className="card p-4">
          <h2 className="text-xl">Upcoming fits</h2>
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {dashboard.upcomingFits.map((fit) => (
              <li key={fit.id} className="py-2">
                <p className="font-semibold">{formatUkDateTime(fit.startsAt)} · {fit.user.name}</p>
                <p className="text-stone-600">{fit.contract ? <Link href={`/contracts/${fit.contract.id}`}>{fit.contract.number}</Link> : fit.customer.name} · {fit.location || fit.customer.name}</p>
              </li>
            ))}
            {dashboard.upcomingFits.length === 0 && <li className="py-3 text-stone-500">No fits booked in the next fortnight.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
