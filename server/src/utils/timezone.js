import { AppError } from "./errors.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatterCache = new Map();

function formatter(timeZone) {
  let dtf = formatterCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, dtf);
  }
  return dtf;
}

function partsToMap(parts) {
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  return map;
}

function assertDateStr(dateStr) {
  if (!DATE_RE.test(dateStr)) {
    throw new AppError("Invalid date", "INVALID_DATE", 400);
  }
}

/**
 * Converts a clinic-local wall clock ("YYYY-MM-DD" + "HH:mm") to a UTC Date.
 * Convergent algorithm: start with the wall clock read as UTC, then repeatedly
 * correct by the difference between the wall clock the target zone actually
 * shows at that instant and the one we want. Converges in 1-2 iterations
 * (offset changes slowly compared to the correction step).
 */
export function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  assertDateStr(dateStr);
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const targetWall = Date.UTC(y, m - 1, d, hh, mm, 0);

  let guess = targetWall;
  for (let i = 0; i < 4; i++) {
    const p = partsToMap(formatter(timeZone).formatToParts(new Date(guess)));
    const shownWall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const delta = targetWall - shownWall;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

/**
 * UTC bounds `{ start, end }` of the clinic-local calendar day `dateStr`.
 * End is computed from the *next* day's local midnight so DST-shifted days
 * (23h/25h) get exact boundaries.
 */
export function zonedDayBounds(dateStr, timeZone) {
  assertDateStr(dateStr);
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStr = next.toISOString().slice(0, 10);
  return {
    start: zonedTimeToUtc(dateStr, "00:00", timeZone),
    end: zonedTimeToUtc(nextStr, "00:00", timeZone),
  };
}

/** Day-of-week (0 = Sunday) of a clinic-local date, in the clinic's zone. */
export function zonedDayOfWeek(dateStr, timeZone) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).formatToParts(
    zonedTimeToUtc(dateStr, "12:00", timeZone),
  );
  const name = p.find((part) => part.type === "weekday")?.value ?? "";
  const index = WEEKDAYS.indexOf(name);
  return index === -1 ? new Date(`${dateStr}T00:00:00Z`).getUTCDay() : index;
}

/** Today's "YYYY-MM-DD" in the given zone. */
export function zonedTodayStr(timeZone) {
  return zonedDateStr(new Date(), timeZone);
}

/** "YYYY-MM-DD" representation of a UTC instant, in the given zone. */
export function zonedDateStr(utcDate, timeZone) {
  const p = partsToMap(formatter(timeZone).formatToParts(utcDate));
  const year = String(p.year).padStart(4, "0");
  const month = String(p.month).padStart(2, "0");
  const day = String(p.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
