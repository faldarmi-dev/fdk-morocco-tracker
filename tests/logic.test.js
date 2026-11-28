import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isIsoDate, addDays, nightsBetween, overlaps, findConflicts, bookingTotals, validateBooking,
  dayView, availableRooms, occupancyRate, roomRevenue, monthRange, kpis, nextRef, formatMoney,
} from '../src/logic.js';
import { demoState, normalize, emptyState } from '../src/store.js';

const rooms = [
  { id: 'r1', name: 'Safran', capacity: 2, rate: 900, status: 'clean' },
  { id: 'r2', name: 'Atlas', capacity: 4, rate: 1800, status: 'clean' },
];
const bk = (o) => ({ id: 'b', ref: 'R2026-0001', roomId: 'r1', guestId: 'g1', checkIn: '2026-03-10', checkOut: '2026-03-13', adults: 2, children: 0, rate: 900, status: 'confirmed', extras: [], payments: [], ...o });

test('date helpers', () => {
  assert.equal(isIsoDate('2026-02-28'), true);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-2-3'), false);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29'); // leap year
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(nightsBetween('2026-03-28', '2026-04-02'), 5); // across EU DST change
  assert.equal(nightsBetween('2026-10-24', '2026-10-27'), 3);
  assert.throws(() => nightsBetween('bad', '2026-01-01'));
});

test('overlap: back-to-back stays do not clash, intersecting stays do', () => {
  const a = bk({ id: 'a' });
  assert.equal(overlaps(a, bk({ id: 'b', checkIn: '2026-03-13', checkOut: '2026-03-15' })), false);
  assert.equal(overlaps(a, bk({ id: 'b', checkIn: '2026-03-07', checkOut: '2026-03-10' })), false);
  assert.equal(overlaps(a, bk({ id: 'b', checkIn: '2026-03-12', checkOut: '2026-03-14' })), true);
  assert.equal(overlaps(a, bk({ id: 'b', checkIn: '2026-03-11', checkOut: '2026-03-12' })), true); // inside
  assert.equal(overlaps(a, bk({ id: 'b', checkIn: '2026-03-01', checkOut: '2026-03-20' })), true); // around
  assert.equal(overlaps(a, bk({ id: 'b', roomId: 'r2' })), false); // other room
});

test('findConflicts ignores self and cancelled bookings', () => {
  const a = bk({ id: 'a' });
  const all = [a, bk({ id: 'c', status: 'cancelled' }), bk({ id: 'd', checkIn: '2026-03-12', checkOut: '2026-03-16' })];
  assert.deepEqual(findConflicts(a, all).map((b) => b.id), ['d']);
  assert.deepEqual(findConflicts({ ...a, status: 'cancelled' }, all), []);
});

test('bookingTotals: room, extras, tourist tax, payments, balance', () => {
  const b = bk({ extras: [{ label: 'Hammam', amount: 300 }, { label: 'Dinner', amount: 250.5 }], payments: [{ amount: 1000 }, { amount: 500 }] });
  const t = bookingTotals(b, { touristTaxPerAdultNight: 25 });
  assert.equal(t.nights, 3);
  assert.equal(t.roomTotal, 2700);
  assert.equal(t.extrasTotal, 550.5);
  assert.equal(t.touristTax, 150); // 2 adults × 3 nights × 25
  assert.equal(t.total, 3400.5);
  assert.equal(t.paid, 1500);
  assert.equal(t.balance, 1900.5);
  // children are not charged tourist tax; no tax setting => 0
  assert.equal(bookingTotals(bk({ children: 2 }), {}).touristTax, 0);
  assert.equal(bookingTotals(bk({ children: 1 }), { touristTaxPerAdultNight: 10 }).touristTax, 60);
  // float rounding
  assert.equal(bookingTotals(bk({ rate: 0.1, checkOut: '2026-03-13' }), {}).roomTotal, 0.3);
});

test('validateBooking catches each kind of error', () => {
  const ctx = { rooms, bookings: [bk({ id: 'x', ref: 'R2026-0009' })] };
  assert.deepEqual(validateBooking(bk({ id: 'new', roomId: 'r2' }), ctx), []);
  assert.match(validateBooking(bk({ id: 'new' }), ctx)[0], /already booked 2026-03-10 → 2026-03-13 \(ref R2026-0009\)/);
  assert.deepEqual(validateBooking(bk({ id: 'new', checkIn: '2026-03-13', checkOut: '2026-03-14' }), ctx), []);
  assert.ok(validateBooking(bk({ id: 'new', roomId: 'r2', checkOut: '2026-03-10' }), ctx).includes('Check-out must be after check-in.'));
  assert.ok(validateBooking(bk({ id: 'new', roomId: 'r2', adults: 0 }), ctx).includes('At least one adult is required.'));
  assert.match(validateBooking(bk({ id: 'new', roomId: 'r1', checkIn: '2026-04-01', checkOut: '2026-04-02', adults: 2, children: 1 }), ctx)[0], /sleeps 2/);
  assert.ok(validateBooking(bk({ id: 'new', roomId: 'nope' }), ctx).includes('Choose a room.'));
  assert.ok(validateBooking(bk({ id: 'new', roomId: 'r2', guestId: '' }), ctx).includes('Choose or add a guest.'));
  assert.ok(validateBooking(bk({ id: 'new', roomId: 'r2', rate: NaN }), ctx).includes('Nightly rate must be 0 or more.'));
  // editing a booking does not clash with itself
  assert.deepEqual(validateBooking(bk({ id: 'x' }), ctx), []);
  // a cancelled booking can sit on top of an active one
  assert.deepEqual(validateBooking(bk({ id: 'new', status: 'cancelled' }), ctx), []);
});

test('dayView: arrivals, departures and in-house', () => {
  const list = [bk({ id: 'a' }), bk({ id: 'b', roomId: 'r2', checkIn: '2026-03-13', checkOut: '2026-03-15' }), bk({ id: 'c', roomId: 'r2', checkIn: '2026-03-11', checkOut: '2026-03-12', status: 'cancelled' })];
  const d = dayView('2026-03-13', list);
  assert.deepEqual(d.arrivals.map((b) => b.id), ['b']);
  assert.deepEqual(d.departures.map((b) => b.id), ['a']);
  assert.deepEqual(d.inHouse.map((b) => b.id), ['b']);
  assert.deepEqual(dayView('2026-03-11', list).inHouse.map((b) => b.id), ['a']);
});

test('availableRooms respects bookings, capacity and out-of-order', () => {
  const list = [bk({ id: 'a' })];
  assert.deepEqual(availableRooms(rooms, list, '2026-03-11', '2026-03-12', 2).map((r) => r.id), ['r2']);
  assert.deepEqual(availableRooms(rooms, list, '2026-03-13', '2026-03-14', 2).map((r) => r.id), ['r1', 'r2']);
  assert.deepEqual(availableRooms(rooms, list, '2026-03-13', '2026-03-14', 3).map((r) => r.id), ['r2']);
  assert.deepEqual(availableRooms(rooms, list, '2026-03-11', '2026-03-12', 2, 'a').map((r) => r.id), ['r1', 'r2']);
  const ooo = [{ ...rooms[0], status: 'out_of_order' }, rooms[1]];
  assert.deepEqual(availableRooms(ooo, [], '2026-03-11', '2026-03-12').map((r) => r.id), ['r2']);
});

test('occupancy, revenue and KPIs', () => {
  // r1 booked 10–13 (3 nights @900), r2 booked 12–15 (3 nights @1800)
  const list = [bk({ id: 'a' }), bk({ id: 'b', roomId: 'r2', rate: 1800, checkIn: '2026-03-12', checkOut: '2026-03-15' })];
  // window 10–14: 4 days × 2 rooms = 8 room-nights; sold: r1 3 + r2 2 = 5
  assert.equal(occupancyRate(rooms, list, '2026-03-10', '2026-03-14'), 5 / 8);
  assert.equal(roomRevenue(list, '2026-03-10', '2026-03-14'), 3 * 900 + 2 * 1800);
  const k = kpis(rooms, list, '2026-03-10', '2026-03-14');
  assert.equal(k.revenue, 6300);
  assert.equal(k.adr, 1260); // 6300 / 5
  assert.equal(k.revpar, 787.5); // 6300 / 8
  assert.equal(occupancyRate([], list, '2026-03-10', '2026-03-14'), 0);
  assert.deepEqual(kpis(rooms, [], '2026-03-10', '2026-03-14'), { occupancy: 0, revenue: 0, adr: 0, revpar: 0 });
  // stays spanning a month boundary are split by night
  const span = [bk({ checkIn: '2026-03-30', checkOut: '2026-04-02' })];
  assert.equal(roomRevenue(span, ...Object.values(monthRange('2026-03-15'))), 2 * 900);
  assert.equal(roomRevenue(span, ...Object.values(monthRange('2026-04-15'))), 1 * 900);
});

test('monthRange handles December and February', () => {
  assert.deepEqual(monthRange('2026-12-31'), { from: '2026-12-01', to: '2027-01-01' });
  assert.deepEqual(monthRange('2026-02-14'), { from: '2026-02-01', to: '2026-03-01' });
});

test('nextRef increments per year', () => {
  assert.equal(nextRef([], '2026'), 'R2026-0001');
  assert.equal(nextRef([{ ref: 'R2026-0007' }, { ref: 'R2025-0099' }, { ref: 'R2026-0002' }], '2026'), 'R2026-0008');
  assert.equal(nextRef([{ ref: 'R2025-0099' }], '2026'), 'R2026-0001');
});

test('formatMoney', () => {
  assert.equal(formatMoney(1234.5), '1,234.50 MAD');
  assert.equal(formatMoney('x', 'EUR'), '0.00 EUR');
});

test('demo data is internally consistent (no clashes, capacity respected)', () => {
  const s = demoState('2026-11-28');
  assert.equal(s.rooms.length, 5);
  for (const b of s.bookings) {
    assert.deepEqual(validateBooking(b, s), [], `demo booking ${b.ref} should be valid`);
  }
  assert.equal(new Set(s.bookings.map((b) => b.ref)).size, s.bookings.length);
});

test('normalize fills defaults and rejects bad backups', () => {
  const n = normalize({ settings: { riadName: 'X' }, bookings: [{ id: '1' }] });
  assert.equal(n.settings.riadName, 'X');
  assert.equal(n.settings.currency, 'MAD');
  assert.deepEqual(n.bookings[0].payments, []);
  assert.deepEqual(n.rooms, []);
  assert.throws(() => normalize(null));
  assert.throws(() => normalize({ rooms: 'nope' }));
  assert.deepEqual(normalize(emptyState()), emptyState());
});
