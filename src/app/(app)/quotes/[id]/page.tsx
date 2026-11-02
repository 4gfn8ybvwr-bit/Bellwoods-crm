import Link from "next/link";
import { notFound } from "next/navigation";
import { formatGbp } from "@/domain/money";
import { productLabel } from "@/domain/labels";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/server/settings";
import { markQuoteRejected, markQuoteSent } from "@/app/actions";
import { AcceptQuoteForm, QuoteFields } from "@/components/forms";
import { ActionForm, PageHeader, Submit } from "@/components/ui";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { customer: true, lines: { orderBy: { sortOrder: "asc" } }, contract: true, enquiry: true },
  });
  if (!quote) notFound();
  const settings = await getSettings();
  const locked = quote.status === "ACCEPTED";
  return (
    <div className="space-y-6">
      <PageHeader title={quote.number} lede={`${quote.customer.name} · ${quote.status}`}>
        {quote.contract && <Link className="btn btn-primary" href={`/contracts/${quote.contract.id}`}>Open {quote.contract.number}</Link>}
      </PageHeader>
      <div className="card p-4">
        <table className="data">
          <thead><tr><th>Item</th><th>Size</th><th>Specification</th><th>Qty</th><th>Net</th></tr></thead>
          <tbody>
            {quote.lines.map((line) => (
              <tr key={line.id}>
                <td><span className="font-semibold">{productLabel(line.productType)}</span><div>{line.description}</div></td>
                <td className="num">{line.widthMm && line.heightMm ? `${line.widthMm} × ${line.heightMm} mm` : "—"}</td>
                <td>{line.specification}</td>
                <td className="num">{line.quantity}</td>
                <td className="num">{formatGbp(line.netPence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right text-sm">Net {formatGbp(quote.netPence)} · VAT {formatGbp(quote.vatPence)} · Gross <strong className="num">{formatGbp(quote.grossPence)}</strong></p>
      </div>
      {!locked && (
        <div className="grid gap-4 lg:grid-cols-2">
          <QuoteFields customers={[]} enquiries={[]} quote={quote} />
          <div className="space-y-4">
            <div className="flex gap-2">
              <ActionForm action={markQuoteSent}><input type="hidden" name="id" value={quote.id} /><Submit tone="dark">Mark sent</Submit></ActionForm>
              <ActionForm action={markQuoteRejected}><input type="hidden" name="id" value={quote.id} /><Submit tone="danger">Reject</Submit></ActionForm>
            </div>
            <AcceptQuoteForm quoteId={quote.id} defaultPercent={settings.defaultDepositPercent} />
          </div>
        </div>
      )}
    </div>
  );
}
