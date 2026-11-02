import Link from "next/link";
import { formatGbp } from "@/domain/money";
import { getCustomer } from "@/server/queries";
import { saveAddress, saveContact, saveContactPortal, saveCustomerPortal } from "@/app/actions";
import { ActionForm, PageHeader, Submit } from "@/components/ui";
import { CustomerFields } from "@/components/forms";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer(id);
  return (
    <div className="space-y-6">
      <PageHeader title={customer.companyName || customer.name} lede={customer.type === "TRADE" ? "Trade account" : "Domestic customer"}>
        <Link className="btn" href={`/enquiries/new?customer=${customer.id}`}>New enquiry</Link>
        <Link className="btn" href={`/quotes/new?customer=${customer.id}`}>New quote</Link>
      </PageHeader>
      <CustomerFields customer={customer} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-xl">Addresses</h2>
          <ul className="mt-2 text-sm">
            {customer.addresses.map((address) => (
              <li key={address.id} className="border-b border-stone-100 py-2">
                <span className="font-semibold">{address.label}</span> {address.isPrimary && <span className="badge bg-emerald-50 text-emerald-900">Primary</span>}
                <p>{[address.line1, address.line2, address.city, address.county, address.postcode].filter(Boolean).join(", ")}</p>
              </li>
            ))}
          </ul>
          <ActionForm action={saveAddress} className="mt-3 grid gap-2">
            <input type="hidden" name="customerId" value={customer.id} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input" name="label" placeholder="Label" />
              <input className="input" name="line1" placeholder="Address line" required />
              <input className="input" name="city" placeholder="Town or city" required />
              <input className="input" name="county" placeholder="County" />
              <input className="input" name="postcode" placeholder="Postcode" required />
            </div>
            <label className="text-sm"><input type="checkbox" name="isPrimary" className="mr-2" />Primary address</label>
            <Submit tone="dark">Add address</Submit>
          </ActionForm>
        </section>
        <section className="card p-4">
          <h2 className="text-xl">Contacts</h2>
          <ul className="mt-2 text-sm">
            {customer.contacts.map((contact) => (
              <li key={contact.id} className="border-b border-stone-100 py-2">
                <span className="font-semibold">{contact.name}</span> {contact.role && <span className="text-stone-500">· {contact.role}</span>}
                <p>{[contact.phone, contact.email].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
          <ActionForm action={saveContact} className="mt-3 grid gap-2">
            <input type="hidden" name="customerId" value={customer.id} />
            <input className="input" name="name" placeholder="Name" required />
            <input className="input" name="role" placeholder="Role, e.g. site manager" />
            <input className="input" name="phone" placeholder="Phone" />
            <input className="input" name="email" placeholder="Email" />
            <Submit tone="dark">Add contact</Submit>
          </ActionForm>
        </section>
      </div>
      {customer.type === "TRADE" && (
        <section className="trade-surface space-y-3 p-4">
          <h2 className="text-xl">Customer portal</h2>
          <p className="text-sm">Trade accounts only. Bellwoods retail customers cannot be switched on, in the office screen or the API. Signing in does not send an email.</p>
          <ActionForm action={saveCustomerPortal} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="customerId" value={customer.id} />
            <label className="text-sm"><input className="mr-2" type="checkbox" name="enabled" defaultChecked={customer.portalEnabled} />Allow this account into the portal</label>
            <Submit tone="dark">Save</Submit>
          </ActionForm>
          {customer.contacts.map((contact) => (
            <ActionForm key={contact.id} action={saveContactPortal} className="grid gap-2 rounded-md border border-sky-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="customerId" value={customer.id} />
              <input type="hidden" name="contactId" value={contact.id} />
              <label className="text-sm"><input className="mr-2" type="checkbox" name="enabled" defaultChecked={contact.portalEnabled} />{contact.name || contact.email} can sign in</label>
              <input className="input" name="password" type="password" placeholder="Password, at least 8 characters" autoComplete="new-password" />
              <Submit>Save login</Submit>
            </ActionForm>
          ))}
        </section>
      )}
      <section className="card p-4">
        <h2 className="text-xl">Work</h2>
        <ul className="mt-2 text-sm">
          {customer.enquiries.map((enquiry) => (
            <li key={enquiry.id} className="py-1"><Link href={`/enquiries/${enquiry.id}`}>Enquiry · {enquiry.productInterest}</Link> <span className="text-stone-500">{enquiry.status}</span></li>
          ))}
          {customer.quotes.map((quote) => (
            <li key={quote.id} className="py-1"><Link href={`/quotes/${quote.id}`}>{quote.number}</Link> <span className="num">{formatGbp(quote.netPence)}</span> <span className="text-stone-500">{quote.status}</span></li>
          ))}
          {customer.contracts.map((contract) => (
            <li key={contract.id} className="py-1"><Link href={`/contracts/${contract.id}`}>{contract.number}</Link> · {contract.stage.name}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
