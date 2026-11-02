import Link from "next/link";
import { formatUkDateTime, londonToUtc, monthGrid, partsInLondon } from "@/domain/dates";
import { prisma } from "@/lib/prisma";
import { saveAppointment } from "@/app/actions";
import { ActionForm, PageHeader, Submit } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "Diary" };

export default async function DiaryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const today = partsInLondon(new Date());
  const monthParam = first(params.month);
  const year = monthParam ? Number(monthParam.slice(0, 4)) : today.y;
  const month = monthParam ? Number(monthParam.slice(5, 7)) : today.m;
  const grid = monthGrid(year, month);
  const from = londonToUtc(year, month, 1, 0, 0);
  const to = londonToUtc(year, month + 1, 1, 0, 0);
  const [appointments, customers, users] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: from, lt: to } },
      include: { customer: true, user: true, contract: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const selected = first(params.day);
  const dayAppointments = selected
    ? appointments.filter((appointment) => partsInLondon(appointment.startsAt).d === Number(selected))
    : appointments;
  const prev = new Date(Date.UTC(year, month - 2, 1));
  const next = new Date(Date.UTC(year, month, 1));
  const prevKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
  const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = from.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" });

  return (
    <div>
      <PageHeader title="Diary" lede="Surveys, sales visits and fit dates. Times are UK local." />
      <div className="mb-4 flex items-center gap-3">
        <Link className="btn" href={`/diary?month=${prevKey}`}>Previous</Link>
        <h2 className="text-2xl">{label}</h2>
        <Link className="btn" href={`/diary?month=${nextKey}`}>Next</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-stone-500">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: grid.mondayIndex }).map((_, index) => <div key={`b${index}`} />)}
            {Array.from({ length: grid.daysInMonth }).map((_, index) => {
              const day = index + 1;
              const items = appointments.filter((appointment) => partsInLondon(appointment.startsAt).d === day);
              const isToday = today.y === year && today.m === month && today.d === day;
              return (
                <Link key={day} href={`/diary?month=${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}&day=${day}`} className={`min-h-20 rounded-md border p-1 text-left text-xs ${isToday ? "border-copper bg-orange-50" : "border-line bg-white"}`}>
                  <span className="font-semibold">{day}</span>
                  {items.slice(0, 3).map((item) => (
                    <p key={item.id} className="mt-1 truncate text-stone-600">{item.type === "FIT" ? "Fit" : item.type === "SURVEY" ? "Survey" : "Appt"} {item.customer.name.split(" ")[0]}</p>
                  ))}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="text-xl">{selected ? `Day ${selected}` : "This month"}</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {dayAppointments.map((appointment) => (
                <li key={appointment.id} className="border-b border-stone-100 pb-2">
                  <p className="font-semibold">{formatUkDateTime(appointment.startsAt)} · {appointment.type}</p>
                  <p>{appointment.title}</p>
                  <p className="text-stone-600">{appointment.user.name}{appointment.contract ? ` · ${appointment.contract.number}` : ""}</p>
                  {appointment.location && <p className="text-stone-600">{appointment.location}</p>}
                </li>
              ))}
              {dayAppointments.length === 0 && <li className="text-stone-500">Nothing booked.</li>}
            </ul>
          </section>
          <ActionForm action={saveAppointment} className="card grid gap-2 p-4">
            <h2 className="text-xl">Book</h2>
            <input type="hidden" name="back" value="/diary" />
            <label className="field"><span>Customer</span>
              <select className="select" name="customerId" required>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            <label className="field"><span>With</span>
              <select className="select" name="userId">{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
            </label>
            <label className="field"><span>Type</span>
              <select className="select" name="type" defaultValue="SURVEY">
                <option value="SURVEY">Survey</option>
                <option value="SALES">Sales</option>
                <option value="FIT">Fit</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="field"><span>Title</span><input className="input" name="title" required /></label>
            <label className="field"><span>Starts</span><input className="input" name="startsAt" placeholder="dd/mm/yyyy HH:mm" required /></label>
            <label className="field"><span>Location</span><input className="input" name="location" /></label>
            <Submit>Add to diary</Submit>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
