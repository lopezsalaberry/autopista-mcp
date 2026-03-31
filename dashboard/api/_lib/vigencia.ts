export interface Vigencia {
  name: string;
  month: number;
  year: number;
  from: string;
  to: string;
  fromMs: number;
  toMs: number;
}

export interface VigenciaConfig {
  startDay: number;
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

export function getVigencia(month: number, year: number, config: Partial<VigenciaConfig> = {}): Vigencia {
  const { startDay, endDay } = { ...DEFAULT_CONFIG, ...config };
  const clampedStart = clampDay(startDay);
  const clampedEnd = clampDay(endDay);

  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) { prevMonth = 12; prevYear = year - 1; }

  const actualStartDay = Math.min(clampedStart, daysInMonth(prevYear, prevMonth));
  const fromStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(actualStartDay).padStart(2, "0")}`;
  const fromMs = new Date(`${fromStr}T00:00:00.000Z`).getTime();

  const actualEndDay = Math.min(clampedEnd, daysInMonth(year, month));
  const toStr = `${year}-${String(month).padStart(2, "0")}-${String(actualEndDay).padStart(2, "0")}`;
  const toMs = new Date(`${toStr}T23:59:59.999Z`).getTime();

  return { name: `${MONTH_NAMES[month - 1]} ${year}`, month, year, from: fromStr, to: toStr, fromMs, toMs };
}

export function getAllVigencias(year: number, config: Partial<VigenciaConfig> = {}): Vigencia[] {
  return Array.from({ length: 12 }, (_, i) => getVigencia(i + 1, year, config));
}

export function getPreviousPeriod(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  const durationMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs + 1);
  const prevFromStr = prevFrom.toISOString().split("T")[0];
  const prevToStr = prevTo.toISOString().split("T")[0];
  return {
    from: prevFromStr, to: prevToStr,
    fromMs: new Date(`${prevFromStr}T00:00:00.000Z`).getTime(),
    toMs: new Date(`${prevToStr}T23:59:59.999Z`).getTime(),
  };
}
