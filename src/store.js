// Persistence: one JSON document in localStorage, plus JSON export/import for backups.
import { addDays, todayIso, uid, nextRef } from './logic.js';

const KEY = 'riad-manager:v1';

export function emptyState() {
  return {
    version: 1,
    settings: {
      riadName: 'My Riad',
      city: 'Marrakech',
      address: '',
      phone: '',
      email: '',
      currency: 'MAD',
      // Taxe de séjour varies by commune and classification — set your own rate.
      touristTaxPerAdultNight: 0,
      checkInTime: '14:00',
      checkOutTime: '11:00',
    },
    rooms: [],
    guests: [],
    bookings: [],
  };
}

export function demoState(today = todayIso()) {
  const s = emptyState();
  s.settings.riadName = 'Riad Dar Yasmine (demo)';
  const room = (name, type, capacity, rate, status = 'clean') => ({ id: uid(), name, type, capacity, rate, status, notes: '' });
  s.rooms = [
    room('Chambre Safran', 'Double', 2, 900),
    room('Chambre Menthe', 'Twin', 2, 850, 'dirty'),
    room('Suite Atlas', 'Suite', 4, 1800),
    room('Chambre Rose', 'Double', 2, 950),
    room('Suite Majorelle', 'Junior suite', 3, 1400, 'inspected'),
  ];
  const guest = (name, country, email = '', phone = '') => ({ id: uid(), name, country, email, phone, notes: '' });
  s.guests = [
    guest('Claire Dubois', 'France', 'claire@example.com'),
    guest('James Carter', 'United Kingdom', 'james@example.com'),
    guest('Youssef El Amrani', 'Morocco', '', '+212 600 000 000'),
    guest('Lena Hoffmann', 'Germany', 'lena@example.com'),
    guest('Sofia Rossi', 'Italy'),
  ];
  const [r1, r2, r3, r4, r5] = s.rooms;
  const [g1, g2, g3, g4, g5] = s.guests;
  const year = today.slice(0, 4);
  const add = (room, g, inOff, nights, adults, source, status, paidShare, extras = []) => {
    const b = {
      id: uid(),
      ref: nextRef(s.bookings, year),
      roomId: room.id,
      guestId: g.id,
      checkIn: addDays(today, inOff),
      checkOut: addDays(today, inOff + nights),
      adults,
      children: 0,
      rate: room.rate,
      source,
      status,
      extras,
      payments: [],
      notes: '',
      createdAt: new Date().toISOString(),
    };
    if (paidShare > 0) {
      const amount = Math.round(room.rate * nights * paidShare);
      b.payments.push({ id: uid(), date: addDays(today, inOff - 1), amount, method: source === 'Direct' ? 'Bank transfer' : 'OTA collected' });
    }
    s.bookings.push(b);
  };
  add(r1, g1, -2, 4, 2, 'Booking.com', 'checked_in', 1, [{ label: 'Hammam for two', amount: 600 }]);
  add(r3, g2, 0, 3, 3, 'Direct', 'confirmed', 0.3);
  add(r4, g3, -3, 3, 2, 'Walk-in', 'checked_in', 0);
  add(r2, g4, 1, 2, 2, 'Airbnb', 'confirmed', 1);
  add(r5, g5, 3, 5, 2, 'Expedia', 'confirmed', 1, [{ label: 'Airport transfer', amount: 250 }]);
  add(r1, g4, 6, 3, 2, 'Direct', 'confirmed', 0);
  return s;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  return null;
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('Could not save data', e);
    return false;
  }
}

export function normalize(data) {
  if (!data || typeof data !== 'object') throw new Error('Not a Riad Manager backup.');
  const base = emptyState();
  for (const k of ['rooms', 'guests', 'bookings']) {
    if (data[k] !== undefined && !Array.isArray(data[k])) throw new Error(`"${k}" must be a list.`);
  }
  return {
    ...base,
    ...data,
    settings: { ...base.settings, ...(data.settings || {}) },
    rooms: data.rooms || [],
    guests: data.guests || [],
    bookings: (data.bookings || []).map((b) => ({ extras: [], payments: [], children: 0, ...b })),
  };
}
