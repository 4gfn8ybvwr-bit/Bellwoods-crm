type LondonParts = { y: number; m: number; d: number; hh: number; mm: number };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function partsInLondon(date: Date): LondonParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => {
    const value = Number(parts.find((part) => part.type === type)?.value ?? "0");
    return type === "hour" && value === 24 ? 0 : value;
  };
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}

/** Interpret a wall-clock time in Europe/London and return the UTC instant. */
export function londonToUtc(y: number, m: number, d: number, hh = 0, mm = 0) {
  let utc = Date.UTC(y, m - 1, d, hh, mm, 0);
  for (let i = 0; i < 3; i += 1) {
    const seen = partsInLondon(new Date(utc));
    const seenUtc = Date.UTC(seen.y, seen.m - 1, seen.d, seen.hh, seen.mm, 0);
    const wanted = Date.UTC(y, m - 1, d, hh, mm, 0);
    const delta = wanted - seenUtc;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

export function formatUkDate(date: Date) {
  const p = partsInLondon(date);
  return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

export function formatUkDateTime(date: Date) {
  const p = partsInLondon(date);
  return `${pad(p.d)}/${pad(p.m)}/${p.y} ${pad(p.hh)}:${pad(p.mm)}`;
}

export function formatIsoDate(date: Date) {
  const p = partsInLondon(date);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function parseUkDate(value: string) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = londonToUtc(y, m, d, 12, 0);
  const back = partsInLondon(dt);
  if (back.d !== d || back.m !== m || back.y !== y) return null;
  return dt;
}

export function parseDateInput(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const [y, m, d] = trimmed.slice(0, 10).split("-").map(Number);
    const dt = londonToUtc(y, m, d, 12, 0);
    const back = partsInLondon(dt);
    if (back.d !== d || back.m !== m || back.y !== y) {
      throw new Error("Enter a real date");
    }
    return dt;
  }
  const uk = parseUkDate(trimmed);
  if (!uk) throw new Error("Use a date in the form dd/mm/yyyy");
  return uk;
}

export function parseDateTimeInput(value: string) {
  const trimmed = value.trim();
  const uk = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(trimmed);
  if (uk) {
    return londonToUtc(Number(uk[3]), Number(uk[2]), Number(uk[1]), Number(uk[4] ?? 9), Number(uk[5] ?? 0));
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const dt = new Date(trimmed);
    if (Number.isNaN(dt.getTime())) throw new Error("Enter a valid date and time");
    return dt;
  }
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed)) {
    const [date, time] = trimmed.split(/\s+/);
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    return londonToUtc(y, m, d, hh, mm);
  }
  throw new Error("Use a date and time in the form dd/mm/yyyy HH:mm");
}

export function startOfLondonDay(date: Date) {
  const p = partsInLondon(date);
  return londonToUtc(p.y, p.m, p.d, 0, 0);
}

export function addLondonDays(date: Date, days: number) {
  const p = partsInLondon(date);
  return londonToUtc(p.y, p.m, p.d + days, p.hh, p.mm);
}

export function monthGrid(year: number, month: number) {
  const first = londonToUtc(year, month, 1, 12, 0);
  const firstParts = partsInLondon(first);
  const mondayIndex = (new Date(Date.UTC(firstParts.y, firstParts.m - 1, firstParts.d)).getUTCDay() + 6) % 7;
  const daysInMonth = partsInLondon(londonToUtc(year, month + 1, 0, 12, 0)).d;
  return { mondayIndex, daysInMonth, year, month };
}
