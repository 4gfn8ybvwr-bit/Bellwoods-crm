import Link from "next/link";
import { formatGbp } from "@/domain/money";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Purchasing" };

export default async function PurchasingPage() {
  const orders = await prisma.purchaseOrder.findMany({
    include: { supplier: true, contract: true, invoices: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Purchase orders" lede="Orders sit on a contract. Record the supplier’s own order number when they acknowledge it.">
        <a className="btn" href="/api/v1/exports/purchase-orders" download>Export CSV</a>
        <Link className="btn" href="/purchasing/review">Invoice review</Link>
      </PageHeader>
      <div className="card">
        <table className="data">
          <thead><tr><th>PO</th><th>Contract</th><th>Supplier</th><th>Reference</th><th>Net</th><th>Status</th><th>Invoices</th></tr></thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="font-semibold">{order.number}{order.remake ? " · remake" : ""}</td>
                <td><Link className="text-forest" href={`/contracts/${order.contractId}`}>{order.contract.number}</Link></td>
                <td>{order.supplier.name}</td>
                <td>{order.supplierReference || "—"}</td>
                <td className="num">{formatGbp(order.netPence)}</td>
                <td>{order.status}</td>
                <td>{order.invoices.length === 0 ? "None" : order.invoices.map((invoice) => invoice.status).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
