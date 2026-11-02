import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceError } from "@/domain/errors";
import { formatGbp, formatMargin } from "@/domain/money";
import { formatRate } from "@/domain/labour";
import { formatUkDate, formatUkDateTime } from "@/domain/dates";
import { BELLWOODS_COMPANY } from "@/domain/company";
import { productLabel } from "@/domain/labels";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getContractView } from "@/server/queries";
import {
  changeStage,
  saveContractDetails,
  saveDeposit,
  saveFinalInvoice,
  saveInvoiceStatus,
  saveLabour,
  saveNote,
  savePoStatus,
  savePurchaseOrder,
  saveSupplierInvoice,
  saveSurveySheet,
  saveTask,
  setSurveyFlag,
  uploadContractFile,
  removeLabour,
  saveAppointment,
  saveJobChannel,
} from "@/app/actions";
import { ChannelField } from "@/components/channel-field";
import { ActionForm, PageHeader, Submit } from "@/components/ui";
import { LineEditor } from "@/components/line-editor";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  let view;
  try {
    view = await getContractView(id);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) notFound();
    throw error;
  }
  const [suppliers, people, users] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.labourPerson.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const canWrite = session?.role !== "FITTER";
  const canFinance = session?.role === "ADMIN" || session?.role === "OFFICE";
  const balance = view.salesValuePence - view.costing.salesNetPence;
  const currentIndex = view.stages.findIndex((stage) => stage.id === view.stageId);

  const trade = view.channel === "TRADE";
  return (
    <div className={trade ? "trade-surface space-y-6 p-4" : "space-y-6"}>
      <PageHeader title={view.number} lede={`${view.customer.name} · ${view.stage.name} · ${trade ? "Trade" : "Bellwoods"}`}>
        <Link className="btn" href={`/customers/${view.customerId}`}>Customer</Link>
        {view.quote && <Link className="btn" href={`/quotes/${view.quoteId}`}>{view.quote.number}</Link>}
      </PageHeader>
      <ActionForm action={saveJobChannel} className="card flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="contractId" value={view.id} />
        <ChannelField defaultValue={trade ? "trade" : "bellwoods"} />
        <label className="field"><span>Customer reference</span><input className="input" name="customerReference" defaultValue={view.customerReference} /></label>
        <label className="text-sm"><input className="mr-2" type="checkbox" name="surveyWaived" defaultChecked={view.surveyWaived} />Survey not required</label>
        <Submit tone="dark">Save</Submit>
      </ActionForm>

      <div className="stage-bar">
        {view.stages.map((stage, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "now" : "later";
          const style = state === "now"
            ? { background: "#b5521a", color: "white" }
            : state === "done"
              ? { background: stage.colour, color: "white" }
              : { background: "white", color: "#5c5346", border: "1px solid #e3d9c8" };
          return <span key={stage.id} style={style}>{index + 1}. {stage.name}</span>;
        })}
      </div>

      <section className={`card p-4 ${view.readyToOrder.ok ? "border-emerald-300" : ""}`}>
        <h2 className="text-xl">Ready to order</h2>
        <ul className="mt-2 text-sm">
          <li>{view.readyToOrder.depositOk ? "Deposit paid or skipped." : "Deposit still outstanding."}</li>
          <li>{view.readyToOrder.surveyOk ? (view.surveyWaived && !view.surveyUploaded ? "Survey not required." : "Survey uploaded.") : "Survey not uploaded."}</li>
        </ul>
        {canWrite && (
          <ActionForm action={changeStage} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="contractId" value={view.id} />
            <label className="field">
              <span>Move to</span>
              <select className="select" name="stage" defaultValue={view.stage.slug}>
                {view.stages.map((stage) => <option key={stage.id} value={stage.slug}>{stage.name}</option>)}
              </select>
            </label>
            <Submit tone="dark">Move stage</Submit>
          </ActionForm>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="text-xl">Specification</h2>
            <p className="mt-1 text-sm text-stone-600">{view.siteAddress}</p>
            <table className="data mt-3">
              <thead><tr><th>Item</th><th>Size</th><th>Net</th></tr></thead>
              <tbody>
                {view.lines.map((line) => (
                  <tr key={line.id}>
                    <td><span className="font-semibold">{productLabel(line.productType)}</span><div>{line.description}</div><div className="text-stone-500">{line.specification}</div></td>
                    <td className="num">{line.widthMm && line.heightMm ? `${line.widthMm} × ${line.heightMm}` : "—"}</td>
                    <td className="num">{formatGbp(line.netPence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {view.lines.length === 0 && <p className="mt-2 text-sm text-stone-500">No specification yet. Accept a quote to copy the lines.</p>}
          </section>

          <section className="card p-4" id="survey">
            <h2 className="text-xl">Survey</h2>
            <p className="mt-1 text-sm">Fitters needed: {view.fittersNeeded}. {view.externalWorks && `External works: ${view.externalWorks}`}</p>
            {view.fittersNotes && <p className="mt-1 text-sm text-stone-700">{view.fittersNotes}</p>}
            <table className="data mt-2">
              <thead><tr><th>Location</th><th>Type</th><th>Size mm</th><th>Notes</th></tr></thead>
              <tbody>
                {view.surveyOpenings.map((opening) => (
                  <tr key={opening.id}>
                    <td>{opening.location}</td>
                    <td>{productLabel(opening.productType)}</td>
                    <td className="num">{opening.widthMm} × {opening.heightMm}</td>
                    <td>{opening.specification} {opening.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-2 text-sm">
              {view.surveyMaterials.map((item) => <li key={item.id}>{item.quantity} {item.unit} {item.description}</li>)}
            </ul>
            {canWrite && (
              <ActionForm action={saveSurveySheet} className="mt-4 space-y-2">
                <input type="hidden" name="contractId" value={view.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="field"><span>Fitters needed</span><input className="input" name="fittersNeeded" defaultValue={view.fittersNeeded} /></label>
                  <label className="field"><span>External works</span><input className="input" name="externalWorks" defaultValue={view.externalWorks} placeholder="Plasterer, builder…" /></label>
                </div>
                <label className="field"><span>Fitters&apos; notes</span><textarea className="textarea" name="fittersNotes" defaultValue={view.fittersNotes} /></label>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Openings</p>
                {[0, 1, 2, 3].map((index) => {
                  const opening = view.surveyOpenings[index];
                  return (
                    <div key={index} className="grid gap-2 md:grid-cols-6">
                      <input className="input md:col-span-2" name={`location_${index}`} placeholder="Location" defaultValue={opening?.location} />
                      <select className="select" name={`productType_${index}`} defaultValue={opening?.productType ?? "WINDOW"}>
                        <option value="WINDOW">Window</option>
                        <option value="DOOR">Door</option>
                        <option value="BIFOLD">Bi-fold</option>
                        <option value="PATIO">Patio</option>
                        <option value="OTHER">Other</option>
                      </select>
                      <input className="input" name={`width_${index}`} placeholder="W" defaultValue={opening?.widthMm ?? ""} />
                      <input className="input" name={`height_${index}`} placeholder="H" defaultValue={opening?.heightMm ?? ""} />
                      <input className="input" name={`spec_${index}`} placeholder="Spec" defaultValue={opening?.specification} />
                    </div>
                  );
                })}
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Materials</p>
                {[0, 1, 2, 3].map((index) => {
                  const item = view.surveyMaterials[index];
                  return (
                    <div key={index} className="grid gap-2 md:grid-cols-4">
                      <input className="input md:col-span-2" name={`material_${index}`} placeholder="Trim, sill, screws…" defaultValue={item?.description} />
                      <input className="input" name={`qty_${index}`} placeholder="Qty" defaultValue={item?.quantity} />
                      <input className="input" name={`unit_${index}`} placeholder="Unit" defaultValue={item?.unit} />
                    </div>
                  );
                })}
                <Submit tone="dark">Save survey</Submit>
              </ActionForm>
            )}
            <div className="mt-4 flex flex-wrap items-start gap-3">
              <ActionForm action={uploadContractFile} encType="multipart/form-data" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="contractId" value={view.id} />
                <label className="field"><span>File</span><input className="input" type="file" name="file" accept="application/pdf,image/*,text/plain" required /></label>
                <label className="field"><span>Kind</span>
                  <select className="select" name="kind" defaultValue="SURVEY">
                    <option value="SURVEY">Survey</option>
                    <option value="PHOTO">Photo</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <Submit>Upload</Submit>
              </ActionForm>
              {canWrite && (
                <ActionForm action={setSurveyFlag}>
                  <input type="hidden" name="contractId" value={view.id} />
                  <input type="hidden" name="surveyUploaded" value={view.surveyUploaded ? "false" : "true"} />
                  <Submit tone="plain">{view.surveyUploaded ? "Clear survey flag" : "Mark survey uploaded"}</Submit>
                </ActionForm>
              )}
            </div>
            <ul className="mt-3 text-sm">
              {view.documents.map((document) => (
                <li key={document.id}><a className="text-forest underline" href={document.downloadUrl}>{document.filename}</a> · {document.kind} · {formatUkDate(document.createdAt)}</li>
              ))}
            </ul>
          </section>

          <section className="card p-4" id="purchasing">
            <h2 className="text-xl">Purchase orders</h2>
            {view.purchaseOrders.map((po) => (
              <article key={po.id} className="mt-3 rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{po.number} · {po.supplier.name}</p>
                  <p className="num">{formatGbp(po.netPence)} · {po.status}</p>
                </div>
                {po.supplierReference && <p>Supplier reference {po.supplierReference}</p>}
                {po.remake && <p className="text-amber-900">Remake/Recharge: {po.remakeReason}</p>}
                <ul>{po.lines.map((line) => <li key={line.id}>{line.quantity} × {line.description} · {formatGbp(line.netPence)}</li>)}</ul>
                {po.invoices.length === 0 && <p className="warn mt-2">No supplier invoice matched. Costing is using the PO value.</p>}
                {po.invoices.map((invoice) => (
                  <p key={invoice.id} className="mt-1">{invoice.invoiceNumber} · {formatUkDate(invoice.invoiceDate)} · {formatGbp(invoice.netPence)} · {invoice.status}{invoice.variancePence ? ` · variance ${formatGbp(invoice.variancePence)}` : ""}</p>
                ))}
                {canFinance && po.status !== "DELIVERED" && (
                  <ActionForm action={savePoStatus} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={po.id} />
                    <input type="hidden" name="contractId" value={view.id} />
                    {po.status === "DRAFT" && <><input type="hidden" name="status" value="SENT" /><Submit tone="dark">Mark sent</Submit></>}
                    {po.status === "SENT" && <><input type="hidden" name="status" value="DELIVERED" /><Submit tone="dark">Mark delivered</Submit></>}
                  </ActionForm>
                )}
                {canFinance && (
                  <ActionForm action={saveSupplierInvoice} className="mt-3 grid gap-2 md:grid-cols-4">
                    <input type="hidden" name="purchaseOrderId" value={po.id} />
                    <input type="hidden" name="contractId" value={view.id} />
                    <input className="input" name="invoiceNumber" placeholder="Invoice no." required />
                    <input className="input" name="invoiceDate" placeholder="dd/mm/yyyy" required />
                    <input className="input" name="net" placeholder="Net £" required />
                    <input className="input" name="nominalCode" placeholder="Nominal" defaultValue="5000" />
                    <Submit>Record supplier invoice</Submit>
                  </ActionForm>
                )}
              </article>
            ))}
            {canFinance && (
              <ActionForm action={savePurchaseOrder} className="mt-4 space-y-3">
                <h3 className="font-semibold">New purchase order</h3>
                <input type="hidden" name="contractId" value={view.id} />
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="field"><span>Supplier</span>
                    <select className="select" name="supplierId" required>
                      {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>Supplier reference</span><input className="input" name="supplierReference" placeholder="Their order number" /></label>
                </div>
                <label className="text-sm"><input className="mr-2" type="checkbox" name="remake" />Remake/Recharge?</label>
                <input className="input" name="remakeReason" placeholder="Reason, if this is a remake" />
                <LineEditor mode="po" />
                <Submit>Raise purchase order</Submit>
              </ActionForm>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-xl">Customer invoices</h2>
            <p className="text-sm text-stone-600">Issued by {BELLWOODS_COMPANY.legalName}, VAT {BELLWOODS_COMPANY.vatNumber}. Trade and Bellwoods jobs share this company and one invoice sequence. Xero is not connected yet.</p>
            <table className="data mt-2">
              <thead><tr><th>Number</th><th>Type</th><th>Date</th><th>Net</th><th>Gross</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {view.customerInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.number}</td>
                    <td>{invoice.type}</td>
                    <td className="num">{formatUkDate(invoice.invoiceDate)}</td>
                    <td className="num">{formatGbp(invoice.netPence)}</td>
                    <td className="num">{formatGbp(invoice.grossPence)}</td>
                    <td>{invoice.status}</td>
                    <td>
                      {canFinance && invoice.status === "UNPAID" && (
                        <ActionForm action={saveInvoiceStatus}>
                          <input type="hidden" name="contractId" value={view.id} />
                          <input type="hidden" name="invoiceId" value={invoice.id} />
                          <input type="hidden" name="status" value="PAID" />
                          <Submit tone="dark">Mark paid</Submit>
                        </ActionForm>
                      )}
                      {canFinance && invoice.status === "UNPAID" && (
                        <ActionForm action={saveInvoiceStatus}>
                          <input type="hidden" name="contractId" value={view.id} />
                          <input type="hidden" name="invoiceId" value={invoice.id} />
                          <input type="hidden" name="void" value="true" />
                          <Submit tone="plain">Void</Submit>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canWrite && (
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionForm action={saveDeposit} className="flex items-end gap-2">
                  <input type="hidden" name="contractId" value={view.id} />
                  <label className="field"><span>Deposit %</span><input className="input w-24" name="percent" defaultValue={view.depositPercent || 25} /></label>
                  <Submit>Raise deposit</Submit>
                </ActionForm>
                <ActionForm action={saveDeposit}>
                  <input type="hidden" name="contractId" value={view.id} />
                  <input type="hidden" name="skip" value="true" />
                  <Submit tone="plain">Skip deposit</Submit>
                </ActionForm>
              </div>
            )}
            {canFinance && (
              <ActionForm action={saveFinalInvoice} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="contractId" value={view.id} />
                <label className="field"><span>Final net £ (blank uses the balance of {formatGbp(balance)})</span><input className="input w-40" name="net" placeholder="Leave blank for balance" /></label>
                <Submit>Raise final invoice</Submit>
              </ActionForm>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-xl">Labour</h2>
            <table className="data">
              <thead><tr><th>Date</th><th>Person</th><th>Time</th><th>Cost</th><th></th></tr></thead>
              <tbody>
                {view.labourEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="num">{formatUkDate(entry.workDate)}</td>
                    <td>{entry.person.name}</td>
                    <td>{entry.person.rateType === "HOUR" ? `${entry.hours} h` : `${entry.days} day`}</td>
                    <td className="num">{formatGbp(entry.costPence)}</td>
                    <td>
                      {(canFinance || session?.role === "FITTER") && (
                        <ActionForm action={removeLabour}>
                          <input type="hidden" name="id" value={entry.id} />
                          <input type="hidden" name="contractId" value={view.id} />
                          <Submit tone="plain">Remove</Submit>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ActionForm action={saveLabour} className="mt-3 grid gap-2 md:grid-cols-4">
              <input type="hidden" name="contractId" value={view.id} />
              <label className="field"><span>Person</span>
                <select className="select" name="personId">{people.map((person) => <option key={person.id} value={person.id}>{person.name} · {formatRate(person)}</option>)}</select>
              </label>
              <label className="field"><span>Date</span><input className="input" name="workDate" placeholder="dd/mm/yyyy" required /></label>
              <label className="field"><span>Days</span><input className="input" name="days" defaultValue="1" /></label>
              <label className="field"><span>Hours</span><input className="input" name="hours" defaultValue="0" /></label>
              <Submit>Log labour</Submit>
            </ActionForm>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="text-xl">Job cost</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt>Agreed sale</dt><dd className="num">{formatGbp(view.salesValuePence)}</dd></div>
              <div className="flex justify-between"><dt>Invoiced sales (net)</dt><dd className="num">{formatGbp(view.costing.salesNetPence)}</dd></div>
              <div className="flex justify-between"><dt>Materials</dt><dd className="num">{formatGbp(view.costing.materialNetPence)}</dd></div>
              <div className="flex justify-between"><dt>Labour</dt><dd className="num">{formatGbp(view.costing.labourNetPence)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Profit</dt><dd className={`num ${view.costing.profitPence < 0 ? "text-red-800" : "text-pine"}`}>{formatGbp(view.costing.profitPence)}</dd></div>
              <div className="flex justify-between"><dt>Margin</dt><dd className="num">{formatMargin(view.costing.margin)}</dd></div>
            </dl>
            <ul className="mt-3 space-y-1 text-xs text-stone-600">
              {view.costing.purchaseOrders.map((line) => (
                <li key={line.id}>{line.number}: {formatGbp(line.costPence)} from {line.source === "invoice" ? "supplier invoice" : "PO (no matched invoice)"}{line.pendingReview ? " · invoice in review" : ""}</li>
              ))}
            </ul>
            {view.costing.hasUnmatchedPurchaseOrder && <p className="warn mt-3">At least one PO has no accepted supplier invoice. The material cost includes the PO value so it is not missing, but it is not yet confirmed.</p>}
          </section>

          {canWrite && (
            <ActionForm action={saveContractDetails} className="card grid gap-2 p-4">
              <h2 className="text-xl">Details</h2>
              <input type="hidden" name="contractId" value={view.id} />
              <label className="field"><span>Site</span><textarea className="textarea" name="siteAddress" defaultValue={view.siteAddress} /></label>
              <label className="field"><span>Agreed sale £</span><input className="input" name="salesValue" defaultValue={(view.salesValuePence / 100).toFixed(2)} /></label>
              <label className="field"><span>Notes</span><textarea className="textarea" name="notes" defaultValue={view.notes} /></label>
              <Submit tone="dark">Save details</Submit>
            </ActionForm>
          )}

          <ActionForm action={saveAppointment} className="card grid gap-2 p-4">
            <h2 className="text-xl">Book a fit</h2>
            <input type="hidden" name="customerId" value={view.customerId} />
            <input type="hidden" name="contractId" value={view.id} />
            <input type="hidden" name="type" value="FIT" />
            <input type="hidden" name="back" value={`/contracts/${view.id}`} />
            <input className="input" name="title" defaultValue={`Fit · ${view.number}`} />
            <input className="input" name="startsAt" placeholder="dd/mm/yyyy HH:mm" required />
            <select className="select" name="userId">{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
            <input className="input" name="location" defaultValue={view.siteAddress} />
            <Submit tone="dark">Book fit</Submit>
          </ActionForm>
          <ul className="text-sm">
            {view.appointments.map((appointment) => (
              <li key={appointment.id}>{formatUkDateTime(appointment.startsAt)} · {appointment.type} · {appointment.user.name}</li>
            ))}
          </ul>
        </aside>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-xl">Tasks</h2>
          <ul className="mt-2 text-sm">
            {view.tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-2 border-b border-stone-100 py-2">
                <span className={task.completedAt ? "text-stone-400 line-through" : ""}>
                  {task.title}
                  {task.dueDate && <span className="text-stone-500"> · due {formatUkDate(task.dueDate)}</span>}
                  {task.assignedTo && <span className="text-stone-500"> · {task.assignedTo.name}</span>}
                </span>
                {canWrite && (
                  <ActionForm action={saveTask}>
                    <input type="hidden" name="contractId" value={view.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="completed" value={task.completedAt ? "false" : "true"} />
                    <Submit tone="plain">{task.completedAt ? "Reopen" : "Done"}</Submit>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
          {canWrite && (
            <ActionForm action={saveTask} className="mt-3 grid gap-2">
              <input type="hidden" name="contractId" value={view.id} />
              <input className="input" name="title" placeholder="Task" required />
              <div className="grid grid-cols-2 gap-2">
                <input className="input" name="dueDate" placeholder="dd/mm/yyyy" />
                <select className="select" name="assignedToId">
                  <option value="">Unassigned</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </div>
              <Submit tone="dark">Add task</Submit>
            </ActionForm>
          )}
        </section>
        <section className="card p-4">
          <h2 className="text-xl">Activity</h2>
          <ActionForm action={saveNote} className="mt-2 flex gap-2">
            <input type="hidden" name="contractId" value={view.id} />
            <input className="input" name="body" placeholder="Add a note" required />
            <Submit>Add</Submit>
          </ActionForm>
          <ul className="mt-3 space-y-2 text-sm">
            {view.activities.map((activity) => (
              <li key={activity.id}>
                <p>{activity.body}</p>
                <p className="text-xs text-stone-500">{formatUkDateTime(activity.createdAt)}{activity.apiKey ? ` · key ${activity.apiKey.name}` : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
