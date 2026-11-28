// Pure booking/occupancy logic for Riad Manager. No DOM, no storage — fully unit-tested.

export const BOOKING_STATUSES = ['confirmed', 'checked_in', 'checked_out', 'cancelled'];
export const ROOM_STATUSES = ['clean', 'dirty', 'inspected', 'out_of_order'];
export const SOURCES = ['Direct', 'Booking.com', 'Airbnb', 'Expedia', 'Agency', 'Walk-in'];
export const PAYMENT_METHODS = ['Cash', 'Card', 'Bank transfer', 'OTA collected'];

const DAY_MS = 86400000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

// Dates are handled as 'YYYY-MM-DD' strings and computed in UTC so DST never shifts a night.
export function isIsoDate(s) {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toUtc(s) {
  if (!isIsoDate(s)) throw new Error(`Invalid date: ${s}`);
  return Date.parse(s + 'T00:00:00Z');
}

export function addDays(s, n) {
  return new Date(toUtc(s) + n * DAY_MS).toISOString().slice(0, 10);
}

export function nightsBetween(checkIn, checkOut) {
  return Math.round((toUtc(checkOut) - toUtc(checkIn)) / DAY_MS);
}

export function todayIso(now = new Date()) {
  // Local calendar date of the device (the riad's front desk).
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const isActive = (b) => b.status !== 'cancelled';

// Two stays clash when they share a room and their [checkIn, checkOut) ranges intersect.
// A check-out and a check-in on the same day do not clash.
export function overlaps(a, b) {
  return a.roomId === b.roomId && a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

export function findConflicts(booking, bookings) {
  if (!isActive(booking)) return [];
  return bookings.filter((o) => o.id !== booking.id && isActive(o) && overlaps(booking, o));
}

export function bookingTotals(booking, settings = {}) {
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  const rate = Number(booking.rate) || 0;
  const roomTotal = round2(nights * rate);
  const extrasTotal = round2((booking.extras || []).reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const taxRate = Number(settings.touristTaxPerAdultNight) || 0;
  const touristTax = round2((Number(booking.adults) || 0) * nights * taxRate);
  const total = round2(roomTotal + extrasTotal + touristTax);
  const paid = round2((booking.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const balance = round2(total - paid);
  return { nights, roomTotal, extrasTotal, touristTax, total, paid, balance };
}

export function validateBooking(booking, { rooms, bookings }) {
  const errors = [];
  const room = rooms.find((r) => r.id === booking.roomId);
  if (!room) errors.push('Choose a room.');
  if (!booking.guestId) errors.push('Choose or add a guest.');
  if (!isIsoDate(booking.checkIn)) errors.push('Check-in date is invalid.');
  if (!isIsoDate(booking.checkOut)) errors.push('Check-out date is invalid.');
  if (isIsoDate(booking.checkIn) && isIsoDate(booking.checkOut) && booking.checkOut <= booking.checkIn) {
    errors.push('Check-out must be after check-in.');
  }
  const adults = Number(booking.adults);
  const children = Number(booking.children) || 0;
  if (!Number.isInteger(adults) || adults < 1) errors.push('At least one adult is required.');
  if (!Number.isInteger(children) || children < 0) errors.push('Children must be 0 or more.');
  if (room && adults + children > room.capacity) {
    errors.push(`${room.name} sleeps ${room.capacity}; this booking has ${adults + children} guests.`);
  }
  if (!(Number(booking.rate) >= 0)) errors.push('Nightly rate must be 0 or more.');
  if (errors.length === 0) {
    const clashes = findConflicts(booking, bookings);
    if (clashes.length) {
      const c = clashes[0];
      errors.push(`${room.name} is already booked ${c.checkIn} → ${c.checkOut} (ref ${c.ref || c.id}).`);
    }
  }
  return errors;
}

// Is a guest sleeping in the room on the night starting `date`?
export function isInHouseOn(b, date) {
  return isActive(b) && b.checkIn <= date && date < b.checkOut;
}

export function dayView(date, bookings) {
  const active = bookings.filter(isActive);
  return {
    arrivals: active.filter((b) => b.checkIn === date),
    departures: active.filter((b) => b.checkOut === date),
    inHouse: active.filter((b) => isInHouseOn(b, date)),
  };
}

export function availableRooms(rooms, bookings, checkIn, checkOut, guests = 1, ignoreId = null) {
  const probe = { id: ignoreId, checkIn, checkOut, status: 'confirmed' };
  return rooms.filter(
    (r) =>
      r.status !== 'out_of_order' &&
      r.capacity >= guests &&
      findConflicts({ ...probe, roomId: r.id }, bookings).length === 0,
  );
}

// Occupancy over [from, to): sold room-nights / available room-nights.
export function occupancyRate(rooms, bookings, from, to) {
  const days = nightsBetween(from, to);
  if (days <= 0 || rooms.length === 0) return 0;
  let sold = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    sold += new Set(bookings.filter((b) => isInHouseOn(b, d)).map((b) => b.roomId)).size;
  }
  return sold / (rooms.length * days);
}

// Room revenue earned on nights inside [from, to) (accrual basis; excludes tax & extras).
export function roomRevenue(bookings, from, to) {
  let total = 0;
  for (const b of bookings) {
    if (!isActive(b)) continue;
    const start = b.checkIn > from ? b.checkIn : from;
    const end = b.checkOut < to ? b.checkOut : to;
    if (end > start) total += nightsBetween(start, end) * (Number(b.rate) || 0);
  }
  return round2(total);
}

export function monthRange(date) {
  const from = date.slice(0, 8) + '01';
  const [y, m] = from.split('-').map(Number);
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { from, to };
}

// ADR (average daily rate) and RevPAR for a range.
export function kpis(rooms, bookings, from, to) {
  const days = nightsBetween(from, to);
  const revenue = roomRevenue(bookings, from, to);
  const occ = occupancyRate(rooms, bookings, from, to);
  const soldNights = occ * rooms.length * days;
  return {
    occupancy: occ,
    revenue,
    adr: soldNights ? round2(revenue / soldNights) : 0,
    revpar: rooms.length && days ? round2(revenue / (rooms.length * days)) : 0,
  };
}

export function formatMoney(n, currency = 'MAD') {
  const v = (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v} ${currency}`;
}

export function nextRef(bookings, year) {
  const prefix = `R${year}-`;
  const max = bookings
    .map((b) => b.ref || '')
    .filter((r) => r.startsWith(prefix))
    .reduce((m, r) => Math.max(m, parseInt(r.slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
