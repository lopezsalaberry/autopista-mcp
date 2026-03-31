/**
 * Vigencia date range calculator.
 *
 * A "vigencia" is a custom monthly period used by the business that runs from
 * day X of the previous month to day Y of the current month.
 *
 * Default: 21st of previous month → 22nd of current month (inclusive).
 * The vigencia is named after the month with the most days in the range.
 *
 * Example: Vigencia Marzo 2026 = Feb 21, 2026 → Mar 22, 2026
 */

export interface Vigencia {
  /** Display name, e.g. "Marzo 2026" */
  name: string;
  /** Month number 1-12 */
  month: number;
  /** Year */
  year: number;
  /** Start date (inclusive), ISO string YYYY-MM-DD */
  from: string;
  /** End date (inclusive), ISO string YYYY-MM-DD */
  to: string;
  /** Start date as epoch ms (for HubSpot queries) */
  fromMs: number;
  /** End date as epoch ms at 23:59:59.999 (for HubSpot queries) */
  toMs: number;
}

export interface VigenciaConfig {
  /** Day of previous month where vigencia starts (1-28). Default: 21. */
  startDay: number;
  /** Day of current month where vigencia ends (1-28). Default: 22. */
  endDay: number;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DEFAULT_CONFIG: VigenciaConfig = { startDay: 21, endDay: 22 };

function clampDay(day: number): number {
  return Math.max(1, Math.min(28, day));
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Get a single vigencia for a given month and year.
 */
export function getVigencia(
  month: number,
  year: number,
  config: Partial<VigenciaConfig> = {},
): Vigencia {
  const { startDay, endDay } = { ...DEFAULT_CONFIG, ...config };
  const clampedStart = clampDay(startDay);
  const clampedEnd = clampDay(endDay);

  // Start = startDay of previous month
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  // Clamp to actual days in the previous month
  const actualStartDay = Math.min(clampedStart, daysInMonth(prevYear, prevMonth));
  const fromStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(actualStartDay).padStart(2, "0")}`;
  const fromMs = new Date(`${fromStr}T00:00:00.000Z`).getTime();

  // End = endDay of current month
  const actualEndDay = Math.min(clampedEnd, daysInMonth(year, month));
  const toStr = `${year}-${String(month).padStart(2, "0")}-${String(actualEndDay).padStart(2, "0")}`;
  const toMs = new Date(`${toStr}T23:59:59.999Z`).getTime();

  return {
    name: `${MONTH_NAMES[month - 1]} ${year}`,
    month,
    year,
    from: fromStr,
    to: toStr,
    fromMs,
    toMs,
  };
}

/**
 * Get all 12 vigencias for a given year.
 */
export function getAllVigencias(
  year: number,
  config: Partial<VigenciaConfig> = {},
): Vigencia[] {
  return Array.from({ length: 12 }, (_, i) => getVigencia(i + 1, year, config));
}

/**
 * Given a date range, compute the equivalent "previous period"
 * (same number of days, ending the day before `from`).
 */
export function getPreviousPeriod(from: string, to: string): { from: string; to: string; fromMs: number; toMs: number } {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  const durationMs = toDate.getTime() - fromDate.getTime();

  const prevTo = new Date(fromDate.getTime() - 1); // day before from, at 23:59:59.999
  const prevFrom = new Date(prevTo.getTime() - durationMs + 1);

  const prevFromStr = prevFrom.toISOString().split("T")[0];
  const prevToStr = prevTo.toISOString().split("T")[0];

  return {
    from: prevFromStr,
    to: prevToStr,
    fromMs: new Date(`${prevFromStr}T00:00:00.000Z`).getTime(),
    toMs: new Date(`${prevToStr}T23:59:59.999Z`).getTime(),
  };
}
