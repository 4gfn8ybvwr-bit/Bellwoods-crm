import { ENQUIRY_SOURCES, PRODUCT_TYPES, ROLES } from "@/domain/labels";
import { saveCustomer, saveEnquiry, saveQuote, convertQuote, openContract } from "@/app/actions";
import { ActionForm, Submit } from "@/components/ui";
import { LineEditor } from "@/components/line-editor";
import { ChannelField } from "@/components/channel-field";

type CustomerShape = {
  id: string;
  type: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  notes: string;
};

export function CustomerFields({ customer }: { customer?: CustomerShape }) {
  return (
    <ActionForm action={saveCustomer} className="card grid max-w-3xl gap-3 p-4">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <label className="field">
        <span>Type</span>
        <select className="select" name="type" defaultValue={customer?.type ?? "DOMESTIC"}>
          <option value="DOMESTIC">Domestic</option>
          <option value="TRADE">Trade company</option>
        </select>
      </label>
      <label className="field">
        <span>Name</span>
        <input className="input" name="name" required defaultValue={customer?.name} placeholder="Household or buyer name" />
      </label>
      <label className="field">
        <span>Company</span>
        <input className="input" name="companyName" defaultValue={customer?.companyName} placeholder="Required for trade accounts" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field"><span>Phone</span><input className="input" name="phone" defaultValue={customer?.phone} /></label>
        <label className="field"><span>Email</span><input className="input" name="email" defaultValue={customer?.email} /></label>
      </div>
      {!customer && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field sm:col-span-2"><span>Address</span><input className="input" name="line1" placeholder="Address line" /></label>
          <label className="field"><span>Town</span><input className="input" name="city" /></label>
          <label className="field"><span>County</span><input className="input" name="county" /></label>
          <label className="field"><span>Postcode</span><input className="input" name="postcode" /></label>
        </div>
      )}
      <label className="field"><span>Notes</span><textarea className="textarea" name="notes" defaultValue={customer?.notes} /></label>
      <Submit>{customer ? "Save customer" : "Create customer"}</Submit>
    </ActionForm>
  );
}

export function EnquiryFields({
  customers,
  users,
  customerId,
  enquiry,
}: {
  customers: { id: string; name: string; companyName: string }[];
  users: { id: string; name: string }[];
  customerId?: string;
  enquiry?: { id: string; customerId: string; source: string; productInterest: string; status: string; assignedToId: string | null; notes: string; channel?: string };
}) {
  return (
    <ActionForm action={saveEnquiry} className="card grid max-w-3xl gap-3 p-4">
      {enquiry && <input type="hidden" name="id" value={enquiry.id} />}
      <label className="field">
        <span>Customer</span>
        <select className="select" name="customerId" defaultValue={enquiry?.customerId ?? customerId} required disabled={Boolean(enquiry)}>
          <option value="">Choose</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName || customer.name}</option>)}
        </select>
      </label>
      {enquiry && <input type="hidden" name="customerId" value={enquiry.customerId} />}
      <ChannelField defaultValue={enquiry?.channel === "TRADE" ? "trade" : "bellwoods"} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span>Source</span>
          <select className="select" name="source" defaultValue={enquiry?.source ?? "Phone"}>
            {ENQUIRY_SOURCES.map((source) => <option key={source}>{source}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Assigned to</span>
          <select className="select" name="assignedToId" defaultValue={enquiry?.assignedToId ?? ""}>
            <option value="">Unassigned</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Product interest</span>
        <input className="input" name="productInterest" required defaultValue={enquiry?.productInterest} placeholder="White uPVC windows and a composite door" />
      </label>
      {enquiry && (
        <label className="field">
          <span>Status</span>
          <select className="select" name="status" defaultValue={enquiry.status}>
            <option value="OPEN">Open</option>
            <option value="QUOTED">Quoted</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
          </select>
        </label>
      )}
      <label className="field"><span>Notes</span><textarea className="textarea" name="notes" defaultValue={enquiry?.notes} /></label>
      <Submit>Save enquiry</Submit>
    </ActionForm>
  );
}

export function QuoteFields({
  customers,
  enquiries,
  customerId,
  enquiryId,
  quote,
}: {
  customers: { id: string; name: string; companyName: string }[];
  enquiries: { id: string; productInterest: string; customerId: string }[];
  customerId?: string;
  enquiryId?: string;
  quote?: {
    id: string;
    customerId: string;
    notes: string;
    lines: { productType: string; description: string; widthMm: number | null; heightMm: number | null; specification: string; quantity: number; unitPricePence: number }[];
  };
}) {
  const initial = quote?.lines.map((line) => ({
    productType: line.productType,
    description: line.description,
    widthMm: line.widthMm ? String(line.widthMm) : "",
    heightMm: line.heightMm ? String(line.heightMm) : "",
    specification: line.specification,
    quantity: String(line.quantity),
    unitPrice: (line.unitPricePence / 100).toFixed(2),
  }));
  return (
    <ActionForm action={saveQuote} className="space-y-4">
      {quote && <input type="hidden" name="id" value={quote.id} />}
      {!quote && (
        <div className="card grid gap-3 p-4 md:grid-cols-2">
          <label className="field">
            <span>Customer</span>
            <select className="select" name="customerId" defaultValue={customerId} required>
              <option value="">Choose</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName || customer.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Enquiry</span>
            <select className="select" name="enquiryId" defaultValue={enquiryId ?? ""}>
              <option value="">None</option>
              {enquiries.map((enquiry) => <option key={enquiry.id} value={enquiry.id}>{enquiry.productInterest}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Valid until</span>
            <input className="input" name="validUntil" placeholder="dd/mm/yyyy" />
          </label>
          <label className="field md:col-span-2">
            <span>Notes for the customer</span>
            <textarea className="textarea" name="notes" />
          </label>
        </div>
      )}
      {quote && (
        <label className="field">
          <span>Notes</span>
          <textarea className="textarea" name="notes" defaultValue={quote.notes} />
        </label>
      )}
      <LineEditor mode="quote" initial={initial} />
      <Submit>{quote ? "Save quote" : "Create quote"}</Submit>
    </ActionForm>
  );
}

export function AcceptQuoteForm({ quoteId, defaultPercent }: { quoteId: string; defaultPercent: number }) {
  return (
    <ActionForm action={convertQuote} className="card grid gap-3 p-4">
      <input type="hidden" name="id" value={quoteId} />
      <h2 className="text-xl">Accept and open a contract</h2>
      <ChannelField allowCommercial />
      <label className="field">
        <span>Deposit % (Bellwoods only)</span>
        <input className="input" name="depositPercent" defaultValue={defaultPercent} inputMode="numeric" />
      </label>
      <label className="text-sm"><input className="mr-2" type="checkbox" name="skipDeposit" />Skip the deposit on a Bellwoods job</label>
      <label className="text-sm"><input className="mr-2" type="checkbox" name="keepDeposit" />Take a deposit on a trade job</label>
      <Submit>Accept quote</Submit>
    </ActionForm>
  );
}

export function OpenContractForm({
  customers,
  customerId,
  enquiryId,
}: {
  customers: { id: string; name: string; companyName: string }[];
  customerId?: string;
  enquiryId?: string;
}) {
  return (
    <ActionForm action={openContract} className="card grid gap-3 p-4">
      <h2 className="text-xl">Open a contract before it is sold</h2>
      <input type="hidden" name="enquiryId" value={enquiryId ?? ""} />
      <ChannelField allowCommercial />
      <label className="field">
        <span>Customer</span>
        <select className="select" name="customerId" defaultValue={customerId} required>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName || customer.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Starting stage</span>
        <select className="select" name="stage" defaultValue="enquiry">
          <option value="enquiry">Enquiry</option>
          <option value="survey-booked">Survey booked</option>
          <option value="quoted">Quoted</option>
        </select>
      </label>
      <label className="field"><span>Site address</span><input className="input" name="siteAddress" /></label>
      <Submit tone="dark">Open contract</Submit>
    </ActionForm>
  );
}

export { PRODUCT_TYPES, ROLES };
