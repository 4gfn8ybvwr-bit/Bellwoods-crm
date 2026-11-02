import Link from "next/link";
import { formatGbp } from "@/domain/money";
import { formatUkDate } from "@/domain/dates";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "Customer invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const status = first((await searchParams).status) ?? "";
  const invoices = await prisma.customerInvoice.findMany({
    where: status ? { status } : undefined,
    include: { contract: { include: { customer: true } } },
    orderBy: { invoiceDate: "desc" },
  });
  return (
    <div>
      <PageHeader title="Customer invoices" lede="Deposits and final invoices. Paid or unpaid is tracked here until a Xero sync exists. The xero id stays empty on purpose.">
        <a className="btn" href="/api/v1/exports/customer-invoices" download>Export CSV</a>
      </PageHeader>
      <form className="mb-4" method="get">
        <select className="select max-w-[180px]" name="status" defaultValue={status}>
          <option value="">All</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
          <option value="VOID">Void</option>
        </select>
        <button className="btn ml-2">Filter</button>
      </form>
      <div className="card">
        <table className="data">
          <thead><tr><th>Number</th><th>Date</th><th>Contract</th><th>Customer</th><th>Type</th><th>Net</th><th>Gross</th><th>Status</th></tr></thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.number}</td>
                <td className="num">{formatUkDate(invoice.invoiceDate)}</td>
                <td><Link href={`/contracts/${invoice.contractId}`}>{invoice.contract.number}</Link></td>
                <td>{invoice.contract.customer.name}</td>
                <td>{invoice.type}</td>
                <td className="num">{formatGbp(invoice.netPence)}</td>
                <td className="num">{formatGbp(invoice.grossPence)}</td>
                <td>{invoice.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
