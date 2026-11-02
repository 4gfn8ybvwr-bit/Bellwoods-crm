import Link from "next/link";
import { listCustomers } from "@/server/queries";
import { PageHeader, Empty } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q) ?? "";
  const type = first(params.type) ?? "";
  const customers = await listCustomers(q || undefined, type || undefined);
  return (
    <div>
      <PageHeader title="Customers" lede="Domestic households and trade accounts.">
        <a className="btn" href="/api/v1/exports/customers" download>Export CSV</a>
        <Link className="btn btn-primary" href="/customers/new">New customer</Link>
      </PageHeader>
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input className="input max-w-xs" name="q" defaultValue={q} placeholder="Name, phone, postcode" />
        <select className="select max-w-[180px]" name="type" defaultValue={type}>
          <option value="">All types</option>
          <option value="DOMESTIC">Domestic</option>
          <option value="TRADE">Trade</option>
        </select>
        <button className="btn">Search</button>
      </form>
      <div className="card">
        <table className="data">
          <thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Town</th><th>Jobs</th></tr></thead>
          <tbody>
            {customers.map((customer) => {
              const address = customer.addresses.find((item) => item.isPrimary) ?? customer.addresses[0];
              return (
                <tr key={customer.id}>
                  <td><Link className="font-semibold text-forest" href={`/customers/${customer.id}`}>{customer.companyName || customer.name}</Link>{customer.companyName && <div className="text-stone-500">{customer.name}</div>}</td>
                  <td>{customer.type === "TRADE" ? "Trade" : "Domestic"}</td>
                  <td>{customer.phone}</td>
                  <td>{address ? `${address.city} ${address.postcode}` : ""}</td>
                  <td className="num">{customer._count.contracts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {customers.length === 0 && <Empty>No customers match.</Empty>}
      </div>
    </div>
  );
}
