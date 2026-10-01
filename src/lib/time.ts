import { DateTime } from "luxon";
import type { Department } from "./types";
export function localDay(time: Date | string, zone: string) {
  return DateTime.fromJSDate(new Date(time)).setZone(zone).toISODate()!;
}
export function windowAt(day: string, clock: string, zone: string) {
  return DateTime.fromISO(`${day}T${clock}`, { zone });
}
export function isOpen(department: Department, day: string, zone: string) {
  return (
    department.active &&
    department.workdays.includes(DateTime.fromISO(day, { zone }).weekday)
  );
}
export function inWorkingWindow(
  department: Department,
  start: DateTime,
  end: DateTime,
) {
  const day = start.toISODate()!;
  const zone = start.zoneName!;
  const opens = windowAt(day, department.opens, zone),
    closes = windowAt(day, department.closes, zone);
  const bs = windowAt(day, department.break_start, zone),
    be = windowAt(day, department.break_end, zone);
  return start >= opens && end <= closes && !(start < be && end > bs);
}
