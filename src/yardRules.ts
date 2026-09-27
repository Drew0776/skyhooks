// Shared yard rules used by both the Express server and the React screens,
// so the server's safety checks and what the screens show can't drift apart.
import type { SteelGrade } from './types';

/* ---------- Locations ---------- */

const YARD_LOCATION_PATTERNS = [
  /^Rack [A-Z]-\d{1,2}$/,
  /^Door-\d$/,
  /^Shear-(North|Center|South)$/,
  /^Bender-[A-Za-z0-9-]+$/,
  /^Crane-(NW|NE|SW|SE)$/,
  /^(Raw-SW|Coat-Station|North-End)$/
];

/** True for location names the yard uses, including racks and benders not drawn on the gantry map. */
export const isValidYardLocation = (location: unknown): location is string =>
  typeof location === 'string' && YARD_LOCATION_PATTERNS.some(p => p.test(location));

/* ---------- Grade zoning ---------- */

const SW_BLACK_RACK = /^Rack (J-(19|2[0-5])|L-([6-9]|10))$/;
export const SW_SHIPPING_DOORS = ['Door-7', 'Door-8'];

export const isBlackBarRack = (location: string): boolean => SW_BLACK_RACK.test(location);
export const isShearOrBender = (location: string): boolean =>
  location.startsWith('Shear-') || location.startsWith('Bender-');
export const isSwBlackStorage = (location: string): boolean =>
  location === 'Raw-SW' || SW_SHIPPING_DOORS.includes(location) || isBlackBarRack(location);

/**
 * Why a bundle of `grade` may not be placed at `location`, or null when it may. Black and epoxy are
 * never mixed: black bar stays SW and never goes through the coat line, and epoxy never goes into
 * a black-bar area. This build tracks bar from the coat line on, so every epoxy bundle is coated.
 */
export function gradeZoneViolation(grade: SteelGrade, location: string): string | null {
  if (grade === 'Black') {
    if (isSwBlackStorage(location) || isShearOrBender(location)) return null;
    if (location === 'Coat-Station') return 'CRITICAL: Black (non-epoxy) bar never goes through the epoxy coat line.';
    return 'CRITICAL: Black (non-epoxy) bar is SW-only. Store it at Raw-SW, Door-7/8 or racks J-19 to J-25 and L-6 to L-10, or send it to a shear or bender.';
  }
  if (isBlackBarRack(location)) {
    return 'CRITICAL: Epoxy bar cannot be stored in Black-bar SW racks.';
  }
  if (location === 'Raw-SW') {
    return 'CRITICAL: Coated epoxy bar must never go back into Raw-SW black-bar stock.';
  }
  if (SW_SHIPPING_DOORS.includes(location)) {
    return 'CRITICAL: Epoxy bar must be shipped from NW/NE doors (Door-1, Door-2, Door-3, North-End).';
  }
  return null;
}

/* ---------- Black never touches coated ---------- */

type Surfaced = { id: string; tagId: string; grade: SteelGrade; location: string };

/** Whether a bundle's bar is epoxy-coated. This build tracks no raw stage, so every epoxy bundle is coated. */
export const isCoated = (b: { grade: SteelGrade }): boolean => b.grade === 'Epoxy';

/** A bundle at `destination` with the other surface: black steel never touches coated steel, at any stage. */
export function mixedSurfaceConflict<T extends Surfaced>(moving: T, destination: string, all: T[]): T | undefined {
  return all.find(b => b.location === destination && b.id !== moving.id && isCoated(b) !== isCoated(moving));
}

/** Every grade rule for setting `moving` down at `destination` (zoning, then black never touching coated), or null. */
export function gradePlacementViolation<T extends Surfaced>(moving: T, destination: string, all: T[]): string | null {
  const zone = gradeZoneViolation(moving.grade, destination);
  if (zone) return zone;
  const other = mixedSurfaceConflict(moving, destination, all);
  if (!other) return null;
  const surface = isCoated(moving) ? 'coated' : 'black';
  return `CRITICAL: Black and coated steel never touch. ${moving.tagId} is ${surface} bar and ${destination} holds ${surface === 'coated' ? 'black' : 'coated'} bar (${other.tagId}).`;
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
