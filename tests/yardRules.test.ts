import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatShipDate, gradeZoneViolation, isValidYardLocation, isFirstShift, isUvHazard, plantLocalHour, slottingConflict, WIND_LOCKOUT_MPH, gradePlacementViolation } from '../src/yardRules';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-15T12:00:00Z');

test('black bar stays in the SW zone, may visit shears and benders, and never enters the coat line', () => {
  assert.match(gradeZoneViolation('Black', 'Coat-Station') ?? '', /never goes through the epoxy coat line/);
  assert.equal(gradeZoneViolation('Black', 'Rack J-19'), null);
  assert.equal(gradeZoneViolation('Black', 'Door-7'), null);
  assert.equal(gradeZoneViolation('Black', 'Bender-11-Bender'), null);
  assert.match(gradeZoneViolation('Black', 'Door-1') ?? '', /SW-only/);
});

test('epoxy stays out of black-bar racks and SW shipping doors', () => {
  assert.equal(gradeZoneViolation('Epoxy', 'Rack K-1'), null);
  assert.match(gradeZoneViolation('Epoxy', 'Rack J-20') ?? '', /Black-bar SW racks/);
  assert.match(gradeZoneViolation('Epoxy', 'Door-8') ?? '', /NW\/NE doors/);
});

test('UV warning needs epoxy, an outdoor zone and 25+ days', () => {
  const old = new Date(NOW - 26 * DAY).toISOString();
  assert.ok(isUvHazard({ grade: 'Epoxy', location: 'Rack J-04', stagedAt: old }, NOW));
  assert.ok(!isUvHazard({ grade: 'Epoxy', location: 'Coat-Station', stagedAt: old }, NOW), 'indoors');
  assert.ok(!isUvHazard({ grade: 'Black', location: 'Rack J-19', stagedAt: old }, NOW));
  assert.ok(!isUvHazard({ grade: 'Epoxy', location: 'Rack J-04', stagedAt: new Date(NOW - 3 * DAY).toISOString() }, NOW));
});

test('shifts use plant time, not UTC', () => {
  assert.equal(plantLocalHour('2026-05-24T14:30:00Z'), 9.5);
  assert.ok(isFirstShift('2026-05-24T21:00:00Z'), '4:00 PM CDT is first shift');
  assert.ok(!isFirstShift('2026-05-24T08:00:00Z'), '3:00 AM CDT is second shift');
});

test('wind lockout threshold matches the crane cab label', () => {
  assert.equal(WIND_LOCKOUT_MPH, 25);
});

test('ships-first stacking flags the soonest-shipping bundle it would bury', () => {
  const at = (id: string, location: string, shippingDate: string) => ({ id, tagId: id, location, shippingDate });
  const moving = at('m', 'Coat-Station', '2026-07-25');
  const yard = [moving, at('a', 'Door-1', '2026-07-24'), at('b', 'Door-1', '2026-07-22'), at('c', 'Door-1', '2026-07-26'), at('d', 'Door-2', '2026-07-20')];
  assert.equal(slottingConflict(moving, 'Door-1', yard)?.id, 'b');
  assert.equal(slottingConflict(moving, 'Door-3', yard), undefined);
  assert.equal(slottingConflict(at('m', 'Door-1', '2026-07-01'), 'Door-1', yard), undefined, 'the sooner bundle goes on top');
});

test('date-only ship dates keep their calendar day in every time zone', () => {
  assert.equal(formatShipDate('2026-07-25'), new Date(2026, 6, 25).toLocaleDateString());
});

test('coated epoxy never goes back into Raw-SW', () => {
  assert.match(gradeZoneViolation('Epoxy', 'Raw-SW') ?? '', /never go back into Raw-SW/);
  assert.equal(gradeZoneViolation('Black', 'Raw-SW'), null);
});

test('location names are validated by pattern, including SW racks not drawn on the map', () => {
  for (const ok of ['Rack J-22', 'Rack L-6', 'Bender-Radius-Bender', 'Crane-SW', 'North-End']) assert.ok(isValidYardLocation(ok), ok);
  for (const bad of ['Moon', 'constructor', '__proto__', 42, undefined]) assert.ok(!isValidYardLocation(bad), String(bad));
});

test('black steel never touches coated steel, at any stage', () => {
  const b = (id: string, grade: 'Black' | 'Epoxy', location: string) => ({ id, tagId: id, grade, location });
  const yard = [b('coated', 'Epoxy', 'Shear-North'), b('black', 'Black', 'Shear-South')];
  assert.match(gradePlacementViolation(b('m', 'Black', 'Raw-SW'), 'Shear-North', yard) ?? '', /never touch/);
  assert.match(gradePlacementViolation(b('m', 'Epoxy', 'Rack K-1'), 'Shear-South', yard) ?? '', /never touch/);
  assert.equal(gradePlacementViolation(b('m', 'Epoxy', 'Rack K-1'), 'Shear-North', yard), null, 'coated on coated is fine');
  assert.equal(gradePlacementViolation(b('m', 'Black', 'Raw-SW'), 'Shear-South', yard), null, 'black on black is fine');
});
