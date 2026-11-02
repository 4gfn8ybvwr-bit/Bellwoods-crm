import { formatRate } from "@/domain/labour";
import { prisma } from "@/lib/prisma";
import { saveLabourPerson } from "@/app/actions";
import { ActionForm, PageHeader, Submit } from "@/components/ui";

export const metadata = { title: "Labour" };

export default async function LabourPage() {
  const people = await prisma.labourPerson.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="People and rates" lede="Day rate, hourly rate or a weekly wage spread over a five-day week. Log time on the contract, not here." />
      <div className="card">
        <table className="data">
          <thead><tr><th>Name</th><th>Trade</th><th>Employment</th><th>Rate</th><th>Active</th></tr></thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td className="font-semibold">{person.name}</td>
                <td>{person.trade}</td>
                <td>{person.employment}</td>
                <td className="num">{formatRate(person)}</td>
                <td>{person.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ActionForm action={saveLabourPerson} className="card grid max-w-xl gap-2 p-4">
        <h2 className="text-xl">Add a person</h2>
        <p className="text-xs text-stone-500">A weekly wage is costed as the weekly rate times days divided by five.</p>
        <input className="input" name="name" placeholder="Name" required />
        <input className="input" name="trade" placeholder="Trade, e.g. Fitter" defaultValue="Fitter" />
        <select className="select" name="employment" defaultValue="Subcontractor">
          <option>Subcontractor</option>
          <option>Employed</option>
        </select>
        <select className="select" name="rateType" defaultValue="DAY">
          <option value="DAY">Day rate</option>
          <option value="HOUR">Hourly rate</option>
          <option value="WEEK">Weekly wage</option>
        </select>
        <input className="input" name="rate" placeholder="Rate in pounds" required />
        <Submit>Save person</Submit>
      </ActionForm>
    </div>
  );
}
