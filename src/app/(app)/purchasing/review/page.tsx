import Link from "next/link";
import { formatGbp } from "@/domain/money";
import { formatUkDate } from "@/domain/dates";
import { prisma } from "@/lib/prisma";
import { decideSupplierInvoice } from "@/app/actions";
import { ActionForm, PageHeader, Submit } from "@/components/ui";

export const metadata = { title: "Invoice review" };

export default async function ReviewPage() {
  const invoices = await prisma.supplierInvoice.findMany({
    where: { status: "PENDING_REVIEW" },
    include: { purchaseOrder: { include: { supplier: true, contract: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <div>
      <PageHeader title="Invoice review" lede="A supplier invoice lands here when its net differs from the purchase order by more than the tolerance, including a charge against a £0 remake." />
      <div className="space-y-3">
        {invoices.map((invoice) => (
          <article key={invoice.id} className="card p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-semibold">{invoice.invoiceNumber} · {invoice.purchaseOrder.supplier.name}</p>
                <p>
                  <Link className="text-forest" href={`/contracts/${invoice.purchaseOrder.contractId}`}>{invoice.purchaseOrder.contract.number}</Link>
                  {" · "}{invoice.purchaseOrder.number} was {formatGbp(invoice.purchaseOrder.netPence)}
                  {invoice.purchaseOrder.remake ? ` · remake: ${invoice.purchaseOrder.remakeReason}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="num text-lg">{formatGbp(invoice.netPence)} net</p>
                <p>Variance {formatGbp(invoice.variancePence)} · {formatUkDate(invoice.invoiceDate)} · nominal {invoice.nominalCode}</p>
                <p>VAT {formatGbp(invoice.vatPence)} · gross {formatGbp(invoice.grossPence)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionForm action={decideSupplierInvoice} className="flex gap-2">
                <input type="hidden" name="id" value={invoice.id} />
                <input type="hidden" name="decision" value="APPROVE" />
                <input className="input" name="note" placeholder="Note" />
                <Submit>Approve</Submit>
              </ActionForm>
              <ActionForm action={decideSupplierInvoice}>
                <input type="hidden" name="id" value={invoice.id} />
                <input type="hidden" name="decision" value="REJECT" />
                <Submit tone="danger">Reject</Submit>
              </ActionForm>
            </div>
          </article>
        ))}
        {invoices.length === 0 && <p className="card p-6 text-sm text-stone-500">The review queue is clear.</p>}
      </div>
    </div>
  );
}
