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

/**
 * Why a bundle of `grade` may not be placed at `location`, or null when it may.
 * Black and epoxy are never mixed. All bar arrives black at Raw-SW and most of it is coated,
 * so epoxy-ordered bar still in RAW status is black steel and may sit at Raw-SW; once coated
 * (any other status, or no status given) it never goes back into a black-bar area.
 */
export function gradeZoneViolation(grade: SteelGrade, location: string, status?: string): string | null {
  if (grade === 'Black') {
    if (isSwBlackStorage(location) || isProcessingStation(location)) return null;
    return 'CRITICAL: Black (non-epoxy) bar is SW-only. Store it at Raw-SW, Door-7/8 or racks J-19 to J-25 and L-6 to L-10, or send it to a shear, bender or the coat line.';
  }
  if (isBlackBarRack(location)) {
    return 'CRITICAL: Epoxy bar cannot be stored in Black-bar SW racks.';
  }
  if (location === 'Raw-SW' && status !== 'RAW') {
    return 'CRITICAL: Coated epoxy bar must never go back into Raw-SW black-bar stock. Only uncoated bar waiting for the coat line belongs there.';
  }
  if (SW_SHIPPING_DOORS.includes(location)) {
    return 'CRITICAL: Epoxy bar must be shipped from NW/NE doors (Door-1, Door-2, Door-3, North-End).';
  }
  return null;
}

/* ---------- Ships-first stacking ---------- */

type Shippable = { id: string; tagId: string; location: string; shippingDate: string };

/** A date-only ISO string ("2026-07-25") shown as that calendar day in local time, not UTC midnight. */
export function formatShipDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return (m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(date)).toLocaleDateString();
}

/** The soonest-shipping bundle at `destination` that ships before `moving`; setting `moving` on it would bury it. */
export function slottingConflict<T extends Shippable>(moving: T, destination: string, all: T[]): T | undefined {
  const movingShip = new Date(moving.shippingDate).getTime();
  return all
    .filter(b => b.location === destination && b.id !== moving.id && new Date(b.shippingDate).getTime() < movingShip)
    .sort((a, b) => new Date(a.shippingDate).getTime() - new Date(b.shippingDate).getTime())[0];
}

export function slottingViolationMessage(moving: Shippable, conflict: Shippable, destination: string): string {
  return `CRITICAL DYNAMIC SLOTTING VIOLATION: Stacking bundle ${moving.tagId} (ships ${formatShipDate(moving.shippingDate)}) on top of bundle ${conflict.tagId} (ships sooner: ${formatShipDate(conflict.shippingDate)}) at ${destination} is blocked to prevent extra crane picks and epoxy scraping.`;
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
