import { TIMEZONE } from "./constants";

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${sign}$${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return `${sign}$${Number.isInteger(k) ? k : k.toFixed(0)}K`;
  }
  return `${sign}$${abs.toLocaleString()}`;
}

export function getTodayCT(): string {
  // Use Intl.DateTimeFormat with en-CA locale, which formats dates in ISO
  // yyyy-mm-dd directly — and respects the `timeZone` option regardless of
  // the Node process's local timezone.
  //
  // Previous implementation called `new Date(now.toLocaleString(...))` which
  // double-shifted the date: toLocaleString produced a CT-formatted string,
  // new Date parsed it as local-timezone, then toISOString converted back to
  // UTC. On machines where local TZ != CT (or near midnight-UTC boundaries),
  // this returned the WRONG date, breaking the Quick Log close-out prompt's
  // "dueDate <= today" filter (commitments due today were filtered out
  // because the server thought today was yesterday).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelativeDate(
  isoDate: string | null | undefined,
  today?: string
): string {
  if (!isoDate) return "—";

  const todayStr = today ?? getTodayCT();
  const todayDate = new Date(todayStr + "T00:00:00");
  const targetDate = new Date(isoDate + "T00:00:00");

  const diffMs = targetDate.getTime() - todayDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `Overdue (${Math.abs(diffDays)}d)`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 14) return `In ${diffDays}d`;
  return formatDate(isoDate);
}

export function computeDateOffset(
  offset: string,
  today?: string
): string {
  const todayStr = today ?? getTodayCT();
  // Use UTC noon to avoid timezone day-boundary issues
  const date = new Date(todayStr + "T12:00:00Z");

  function toDateStr(d: Date): string {
    return d.toISOString().split("T")[0];
  }

  switch (offset) {
    case "today":
      return todayStr;
    case "tomorrow":
      date.setUTCDate(date.getUTCDate() + 1);
      return toDateStr(date);
    case "+3d":
      date.setUTCDate(date.getUTCDate() + 3);
      return toDateStr(date);
    case "next_mon": {
      const dayOfWeek = date.getUTCDay();
      const daysUntilMon = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 7 : 8 - dayOfWeek;
      date.setUTCDate(date.getUTCDate() + daysUntilMon);
      return toDateStr(date);
    }
    case "next_fri": {
      const dow = date.getUTCDay();
      const daysUntilFri = dow === 0 ? 5 : dow <= 5 ? 5 - dow : 12 - dow;
      const days = daysUntilFri === 0 ? 7 : daysUntilFri;
      date.setUTCDate(date.getUTCDate() + days);
      return toDateStr(date);
    }
    case "+1w":
      date.setUTCDate(date.getUTCDate() + 7);
      return toDateStr(date);
    case "+2w":
      date.setUTCDate(date.getUTCDate() + 14);
      return toDateStr(date);
    default:
      return todayStr;
  }
}

export function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}
