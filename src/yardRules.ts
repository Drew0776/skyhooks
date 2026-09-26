// Shared yard rules used by both the Express server and the React screens,
// so the server's safety checks and what the screens show can't drift apart.
import type { SteelGrade } from './types';

/* ---------- Grade zoning ---------- */

const SW_BLACK_RACK = /^Rack (J-(19|2[0-5])|L-([6-9]|10))$/;
export const SW_SHIPPING_DOORS = ['Door-7', 'Door-8'];

export const isBlackBarRack = (location: string): boolean => SW_BLACK_RACK.test(location);
export const isProcessingStation = (location: string): boolean =>
  location === 'Coat-Station' || location.startsWith('Shear-') || location.startsWith('Bender-');
export const isSwBlackStorage = (location: string): boolean =>
  location === 'Raw-SW' || SW_SHIPPING_DOORS.includes(location) || isBlackBarRack(location);

/** Why a bundle of `grade` may not be placed at `location`, or null when it may. */
export function gradeZoneViolation(grade: SteelGrade, location: string): string | null {
  if (grade === 'Black') {
    if (isSwBlackStorage(location) || isProcessingStation(location)) return null;
    return 'CRITICAL: Black (non-epoxy) bar is SW-only. Store it at Raw-SW, Door-7/8 or racks J-19 to J-25 and L-6 to L-10, or send it to a shear, bender or the coat line.';
  }
  if (isBlackBarRack(location)) {
    return 'CRITICAL: Epoxy bar cannot be stored in Black-bar SW racks.';
  }
  if (SW_SHIPPING_DOORS.includes(location)) {
    return 'CRITICAL: Epoxy bar must be shipped from NW/NE doors (Door-1, Door-2, Door-3, North-End).';
  }
  return null;
}

/* ---------- Weather ---------- */

/** Reported wind speed at or above which outdoor gantry travel is locked out. */
export const WIND_LOCKOUT_MPH = 25;

/* ---------- Outdoor exposure ---------- */

export const UV_WARNING_DAYS = 25;
export const UV_GUIDANCE =
  'Industry handling guidance calls for covering coated bar stored outdoors beyond 30 days with opaque material; ASTM D3963 requires it once total exposure before embedment is expected to exceed two months.';

/** Yard areas open to sunlight: racks, shipping doors, raw stock, North-End staging and loads hanging on a gantry. */
export const isOutdoorZone = (location: string): boolean =>
  location.startsWith('Rack') ||
  location.startsWith('Door') ||
  location.startsWith('Crane-') ||
  location === 'Raw-SW' ||
  location === 'North-End';

export function isUvHazard(b: { grade: SteelGrade; stagedAt?: string; location: string }, now: number = Date.now()): boolean {
  if (b.grade !== 'Epoxy' || !b.stagedAt || !isOutdoorZone(b.location)) return false;
  return (now - new Date(b.stagedAt).getTime()) / (24 * 60 * 60 * 1000) >= UV_WARNING_DAYS;
}

/* ---------- Shifts ---------- */

export const PLANT_TIME_ZONE = 'America/Chicago';

/** Hour of day (e.g. 16.5 for 4:30 PM) in plant time. */
export function plantLocalHour(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PLANT_TIME_ZONE,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23'
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return hour + minute / 60;
}

/** First shift runs 6:00 AM to 4:30 PM plant time; everything else is second shift. */
export const isFirstShift = (iso: string): boolean => {
  const hour = plantLocalHour(iso);
  return hour >= 6 && hour < 16.5;
};
