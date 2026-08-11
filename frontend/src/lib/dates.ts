/**
 * Date formatting helpers.
 *
 * The backend stores timestamps as naive UTC ISO strings (no timezone suffix,
 * e.g. "2026-08-11T12:15:20.617867"). `new Date(iso)` would interpret those as
 * LOCAL time and shift the displayed time by the UTC offset — so we parse them
 * as UTC explicitly.
 */
export function parseUtc(iso: string): Date {
  const withOffset = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
  return new Date(withOffset)
}

/** "12 Aug 2026, 14:05" — full date + time, used in the application detail. */
export function fmtDateTime(iso: string): string {
  const d = parseUtc(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** "Aug 11" — short date for compact list rows. */
export function fmtDay(iso: string): string {
  const d = parseUtc(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
