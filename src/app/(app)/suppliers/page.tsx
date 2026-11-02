import { prisma } from "@/lib/prisma";
import { saveSupplier } from "@/app/actions";
import { ActionForm, PageHeader, Submit } from "@/components/ui";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { purchaseOrders: true } } } });
  return (
    <div className="space-y-6">
      <PageHeader title="Suppliers" lede="Camden for the frames, Glasscraft for sealed units, Portico and Eurocell for the rest of the trade counter." />
      <div className="card">
        <table className="data">
          <thead><tr><th>Name</th><th>Account</th><th>Phone</th><th>Orders</th></tr></thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td className="font-semibold">{supplier.name}<div className="font-normal text-stone-500">{supplier.notes}</div></td>
                <td>{supplier.accountRef}</td>
                <td>{supplier.phone}</td>
                <td className="num">{supplier._count.purchaseOrders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ActionForm action={saveSupplier} className="card grid max-w-xl gap-2 p-4">
        <h2 className="text-xl">Add a supplier</h2>
        <input className="input" name="name" placeholder="Name" required />
        <input className="input" name="accountRef" placeholder="Account reference" />
        <input className="input" name="phone" placeholder="Phone" />
        <input className="input" name="email" placeholder="Email" />
        <textarea className="textarea" name="notes" placeholder="Notes" />
        <Submit>Save supplier</Submit>
      </ActionForm>
    </div>
  );
}
