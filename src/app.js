import {
  BOOKING_STATUSES, ROOM_STATUSES, SOURCES, PAYMENT_METHODS,
  addDays, nightsBetween, todayIso, bookingTotals, validateBooking, dayView,
  availableRooms, kpis, monthRange, formatMoney, nextRef, uid, isIsoDate,
} from './logic.js';
import { load, save, emptyState, demoState, normalize } from './store.js';

// ---------- state ----------
let state = load();
if (!state) {
  state = demoState();
  save(state);
}
const ui = { view: 'dashboard', calStart: addDays(todayIso(), -2), bookingFilter: 'upcoming', search: '' };

const $ = (sel, root = document) => root.querySelector(sel);
const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => formatMoney(n, state.settings.currency);
const roomById = (id) => state.rooms.find((r) => r.id === id);
const guestById = (id) => state.guests.find((g) => g.id === id);
const bookingById = (id) => state.bookings.find((b) => b.id === id);
const label = (s) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const options = (list, selected, fmt = label) =>
  list.map((v) => `<option value="${h(v)}"${v === selected ? ' selected' : ''}>${h(fmt(v))}</option>`).join('');

function commit(msg) {
  const ok = save(state);
  render();
  if (msg) toast(ok ? msg : 'Saved in this tab only — browser storage is unavailable.');
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- rendering ----------
function render() {
  $('#brand-name').textContent = state.settings.riadName || 'Riad Manager';
  $('#brand-sub').textContent = [state.settings.city, 'Riad Manager'].filter(Boolean).join(' · ');
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === ui.view));
  const views = { dashboard, calendar, bookings, rooms, guests, settings };
  $('#view').innerHTML = views[ui.view]();
}

function statusPill(status) {
  return `<span class="pill s-${h(status)}">${h(label(status))}</span>`;
}

function guestName(b) {
  return guestById(b.guestId)?.name || 'Unknown guest';
}

function bookingLine(b, actions = '') {
  const r = roomById(b.roomId);
  const t = bookingTotals(b, state.settings);
  return `<li class="line">
    <div><strong>${h(guestName(b))}</strong> <span class="muted">· ${h(r?.name || '—')} · ${t.nights} night${t.nights === 1 ? '' : 's'} · ${b.adults + (b.children || 0)} guest${b.adults + (b.children || 0) === 1 ? '' : 's'}</span>
      <div class="muted small">${h(b.ref)} · ${h(b.source)} · ${t.balance > 0 ? `<span class="due">Due ${money(t.balance)}</span>` : 'Paid in full'}</div></div>
    <div class="line-actions">${actions}<button class="btn ghost" data-action="edit-booking" data-id="${h(b.id)}">Open</button></div>
  </li>`;
}

function dashboard() {
  const today = todayIso();
  const { arrivals, departures, inHouse } = dayView(today, state.bookings);
  const { from, to } = monthRange(today);
  const month = kpis(state.rooms, state.bookings, from, to);
  const occTonight = state.rooms.length ? inHouse.length / state.rooms.length : 0;
  const outstanding = state.bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((s, b) => s + Math.max(0, bookingTotals(b, state.settings).balance), 0);
  const dirty = state.rooms.filter((r) => r.status === 'dirty');
  const monthName = new Date(from + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const arrivalBtn = (b) => (b.status === 'confirmed' ? `<button class="btn" data-action="check-in" data-id="${h(b.id)}">Check in</button>` : statusPill(b.status));
  const departBtn = (b) => (b.status !== 'checked_out' ? `<button class="btn" data-action="check-out" data-id="${h(b.id)}">Check out</button>` : statusPill(b.status));
  const list = (items, fn, empty) => (items.length ? `<ul class="lines">${items.map(fn).join('')}</ul>` : `<p class="empty">${empty}</p>`);

  return `
  <h1>${h(fmtDate(today))}</h1>
  <section class="tiles">
    <div class="tile"><div class="tile-label">Occupancy tonight</div><div class="tile-value">${Math.round(occTonight * 100)}%</div><div class="tile-sub">${inHouse.length} of ${state.rooms.length} rooms</div></div>
    <div class="tile"><div class="tile-label">Arrivals / departures</div><div class="tile-value">${arrivals.length} / ${departures.length}</div><div class="tile-sub">today</div></div>
    <div class="tile"><div class="tile-label">Room revenue · ${h(monthName)}</div><div class="tile-value">${money(month.revenue)}</div><div class="tile-sub">Month occupancy ${Math.round(month.occupancy * 100)}% · ADR ${money(month.adr)}</div></div>
    <div class="tile"><div class="tile-label">Outstanding balances</div><div class="tile-value">${money(outstanding)}</div><div class="tile-sub">across active bookings</div></div>
  </section>
  <div class="grid-2">
    <section class="card"><h2>Arrivals</h2>${list(arrivals, (b) => bookingLine(b, arrivalBtn(b)), 'No arrivals today.')}</section>
    <section class="card"><h2>Departures</h2>${list(departures, (b) => bookingLine(b, departBtn(b)), 'No departures today.')}</section>
    <section class="card"><h2>In house tonight</h2>${list(inHouse, (b) => bookingLine(b), 'No guests tonight.')}</section>
    <section class="card"><h2>Housekeeping</h2>
      ${dirty.length ? `<p>${dirty.length} room${dirty.length === 1 ? '' : 's'} to clean.</p>` : '<p class="empty">All rooms clean.</p>'}
      <ul class="lines">${state.rooms.map((r) => `<li class="line"><div><strong>${h(r.name)}</strong> <span class="muted">· ${h(r.type)}</span></div>
        <div class="line-actions"><select data-action="room-status" data-id="${h(r.id)}" aria-label="Status of ${h(r.name)}">${options(ROOM_STATUSES, r.status)}</select></div></li>`).join('')}</ul>
    </section>
  </div>`;
}

function calendar() {
  const DAYS = 14;
  const start = ui.calStart;
  const end = addDays(start, DAYS);
  const today = todayIso();
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const head = dates
    .map((d, i) => {
      const dt = new Date(d + 'T00:00:00Z');
      const wk = dt.getUTCDay();
      return `<div class="cal-head${d === today ? ' today' : ''}${wk === 0 || wk === 6 ? ' weekend' : ''}" style="grid-column:${i + 2}">
        <span>${dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}</span><b>${dt.getUTCDate()}</b></div>`;
    })
    .join('');
  const rows = state.rooms
    .map((r, ri) => {
      const row = ri + 2;
      const cells = dates
        .map((d, i) => `<button class="cal-cell${d === today ? ' today' : ''}" style="grid-row:${row};grid-column:${i + 2}" data-action="new-booking" data-room="${h(r.id)}" data-date="${d}" aria-label="New booking ${h(r.name)} ${d}"></button>`)
        .join('');
      const bars = state.bookings
        .filter((b) => b.roomId === r.id && b.status !== 'cancelled' && b.checkIn < end && b.checkOut > start)
        .map((b) => {
          const s = b.checkIn < start ? 0 : nightsBetween(start, b.checkIn);
          const e = b.checkOut > end ? DAYS : nightsBetween(start, b.checkOut);
          const bal = bookingTotals(b, state.settings).balance;
          return `<button class="cal-bar s-${h(b.status)}" style="grid-row:${row};grid-column:${s + 2} / ${e + 2}" data-action="edit-booking" data-id="${h(b.id)}" title="${h(guestName(b))} · ${b.checkIn} → ${b.checkOut}${bal > 0 ? ' · due ' + money(bal) : ''}">
            ${h(guestName(b))}${bal > 0 ? ' <span class="dot" aria-label="balance due"></span>' : ''}</button>`;
        })
        .join('');
      return `<div class="cal-room" style="grid-row:${row}"><strong>${h(r.name)}</strong><span>${h(r.type)} · ${r.capacity}p</span></div>${cells}${bars}`;
    })
    .join('');
  return `
  <div class="toolbar">
    <h1>Calendar</h1>
    <div class="toolbar-actions">
      <button class="btn" data-action="cal-move" data-days="-7">← Week</button>
      <button class="btn" data-action="cal-today">Today</button>
      <button class="btn" data-action="cal-move" data-days="7">Week →</button>
      <input type="date" value="${start}" data-action="cal-date" aria-label="Start date">
    </div>
  </div>
  ${state.rooms.length ? `<div class="cal-wrap"><div class="cal" style="grid-template-rows:auto repeat(${state.rooms.length}, 52px)">
    <div class="cal-corner">Room</div>${head}${rows}</div></div>
  <p class="muted small">Click an empty day to book it, or a booking to open it. A dot marks a balance due.</p>` : '<p class="empty">Add rooms first (Rooms tab).</p>'}`;
}

function bookings() {
  const today = todayIso();
  const q = ui.search.trim().toLowerCase();
  const filters = {
    upcoming: (b) => b.status !== 'cancelled' && b.checkOut >= today,
    past: (b) => b.checkOut < today && b.status !== 'cancelled',
    balance: (b) => b.status !== 'cancelled' && bookingTotals(b, state.settings).balance > 0,
    cancelled: (b) => b.status === 'cancelled',
    all: () => true,
  };
  const list = state.bookings
    .filter(filters[ui.bookingFilter])
    .filter((b) => !q || [b.ref, guestName(b), roomById(b.roomId)?.name, b.source, b.notes].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (ui.bookingFilter === 'past' ? b.checkIn.localeCompare(a.checkIn) : a.checkIn.localeCompare(b.checkIn)));
  const rows = list
    .map((b) => {
      const t = bookingTotals(b, state.settings);
      return `<tr>
        <td>${h(b.ref)}</td><td><strong>${h(guestName(b))}</strong></td><td>${h(roomById(b.roomId)?.name || '—')}</td>
        <td>${h(fmtDate(b.checkIn))} → ${h(fmtDate(b.checkOut))}<div class="muted small">${t.nights} night${t.nights === 1 ? '' : 's'}</div></td>
        <td>${h(b.source)}</td><td>${statusPill(b.status)}</td>
        <td class="num">${money(t.total)}</td><td class="num ${t.balance > 0 ? 'due' : ''}">${money(t.balance)}</td>
        <td class="row-actions"><button class="btn ghost" data-action="edit-booking" data-id="${h(b.id)}">Open</button><button class="btn ghost" data-action="invoice" data-id="${h(b.id)}">Invoice</button></td>
      </tr>`;
    })
    .join('');
  const tab = (k, text) => `<button class="seg${ui.bookingFilter === k ? ' active' : ''}" data-action="booking-filter" data-filter="${k}">${text}</button>`;
  return `
  <div class="toolbar"><h1>Bookings</h1>
    <div class="toolbar-actions">
      <div class="segmented">${tab('upcoming', 'Upcoming')}${tab('balance', 'Balance due')}${tab('past', 'Past')}${tab('cancelled', 'Cancelled')}${tab('all', 'All')}</div>
      <input type="search" placeholder="Search guest, ref, room…" value="${h(ui.search)}" data-action="search" aria-label="Search bookings">
    </div>
  </div>
  ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Ref</th><th>Guest</th><th>Room</th><th>Stay</th><th>Source</th><th>Status</th><th class="num">Total</th><th class="num">Balance</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">No bookings match.</p>'}`;
}

function rooms() {
  const rows = state.rooms
    .map((r) => `<tr><td><strong>${h(r.name)}</strong>${r.notes ? `<div class="muted small">${h(r.notes)}</div>` : ''}</td><td>${h(r.type)}</td><td class="num">${r.capacity}</td><td class="num">${money(r.rate)}</td>
      <td><select data-action="room-status" data-id="${h(r.id)}" aria-label="Status of ${h(r.name)}">${options(ROOM_STATUSES, r.status)}</select></td>
      <td class="row-actions"><button class="btn ghost" data-action="edit-room" data-id="${h(r.id)}">Edit</button></td></tr>`)
    .join('');
  return `<div class="toolbar"><h1>Rooms</h1><div class="toolbar-actions"><button class="btn primary" data-action="edit-room">+ Add room</button></div></div>
  ${state.rooms.length ? `<div class="table-wrap"><table><thead><tr><th>Room</th><th>Type</th><th class="num">Sleeps</th><th class="num">Nightly rate</th><th>Housekeeping</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">No rooms yet.</p>'}`;
}

function guests() {
  const stays = (g) => state.bookings.filter((b) => b.guestId === g.id && b.status !== 'cancelled');
  const rows = [...state.guests]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => {
      const s = stays(g);
      const spent = s.reduce((sum, b) => sum + bookingTotals(b, state.settings).total, 0);
      return `<tr><td><strong>${h(g.name)}</strong>${g.notes ? `<div class="muted small">${h(g.notes)}</div>` : ''}</td><td>${h(g.country)}</td>
      <td>${h(g.email)}${g.email && g.phone ? '<br>' : ''}${h(g.phone)}</td><td class="num">${s.length}</td><td class="num">${money(spent)}</td>
      <td class="row-actions"><button class="btn ghost" data-action="edit-guest" data-id="${h(g.id)}">Edit</button></td></tr>`;
    })
    .join('');
  return `<div class="toolbar"><h1>Guests</h1><div class="toolbar-actions"><button class="btn primary" data-action="edit-guest">+ Add guest</button></div></div>
  ${state.guests.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Country</th><th>Contact</th><th class="num">Stays</th><th class="num">Total billed</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">No guests yet.</p>'}`;
}

function settings() {
  const s = state.settings;
  const f = (key, text, type = 'text', extra = '') => `<label>${text}<input name="${key}" type="${type}" value="${h(s[key])}" ${extra}></label>`;
  return `<h1>Settings</h1>
  <form class="card form" id="settings-form">
    <div class="form-grid">
      ${f('riadName', 'Riad name', 'text', 'required')}${f('city', 'City')}${f('address', 'Address')}${f('phone', 'Phone')}${f('email', 'Email', 'email')}
      ${f('currency', 'Currency code', 'text', 'maxlength="3" required')}
      ${f('touristTaxPerAdultNight', 'Tourist tax (taxe de séjour) per adult per night', 'number', 'min="0" step="0.01"')}
      ${f('checkInTime', 'Check-in from', 'time')}${f('checkOutTime', 'Check-out by', 'time')}
    </div>
    <p class="muted small">The taxe de séjour rate depends on your commune and your property's classification — enter the rate that applies to you. It is added to every invoice per adult per night.</p>
    <button class="btn primary" type="submit">Save settings</button>
  </form>
  <section class="card">
    <h2>Data</h2>
    <p class="muted">Everything is stored in this browser on this device. Export a backup regularly, and import it to move to another device.</p>
    <div class="toolbar-actions">
      <button class="btn" data-action="export">Export backup (JSON)</button>
      <label class="btn">Import backup<input type="file" accept="application/json,.json" data-action="import" hidden></label>
      <button class="btn" data-action="load-demo">Load demo data</button>
      <button class="btn danger" data-action="reset">Erase all data</button>
    </div>
  </section>`;
}

// ---------- modals ----------
const modal = $('#modal');
function openModal(html) {
  $('#modal-body').innerHTML = html;
  if (!modal.open) modal.showModal();
  const first = modal.querySelector('input:not([type=hidden]), select, textarea');
  first?.focus();
}
function closeModal() {
  modal.close();
}

function bookingForm(b) {
  const isNew = !state.bookings.some((x) => x.id === b.id);
  const guestOpts = [...state.guests]
    .sort((a, c) => a.name.localeCompare(c.name))
    .map((g) => `<option value="${h(g.id)}"${g.id === b.guestId ? ' selected' : ''}>${h(g.name)}${g.country ? ' — ' + h(g.country) : ''}</option>`)
    .join('');
  return `
  <form id="booking-form" class="form" data-id="${h(b.id)}" novalidate>
    <div class="modal-head"><h2>${isNew ? 'New booking' : `Booking ${h(b.ref)}`}</h2><button type="button" class="btn ghost" data-action="close" aria-label="Close">✕</button></div>
    <div class="form-grid">
      <label>Check-in<input name="checkIn" type="date" value="${h(b.checkIn)}" required></label>
      <label>Check-out<input name="checkOut" type="date" value="${h(b.checkOut)}" required></label>
      <label>Adults<input name="adults" type="number" min="1" step="1" value="${h(b.adults)}" required></label>
      <label>Children<input name="children" type="number" min="0" step="1" value="${h(b.children)}"></label>
      <label class="span-2">Room<select name="roomId" required></select><span class="hint" id="room-hint"></span></label>
      <label>Nightly rate (${h(state.settings.currency)})<input name="rate" type="number" min="0" step="0.01" value="${h(b.rate)}" required></label>
      <label>Source<select name="source">${options(SOURCES, b.source, (x) => x)}</select></label>
      <label class="span-2">Guest<select name="guestId"><option value="">— Select a guest —</option><option value="__new"${!b.guestId ? ' selected' : ''}>+ New guest…</option>${guestOpts}</select></label>
      <label>Status<select name="status">${options(BOOKING_STATUSES, b.status)}</select></label>
    </div>
    <fieldset class="new-guest" ${b.guestId ? 'hidden' : ''}>
      <legend>New guest</legend>
      <div class="form-grid">
        <label>Full name<input name="g_name"></label><label>Country<input name="g_country"></label>
        <label>Email<input name="g_email" type="email"></label><label>Phone<input name="g_phone" type="tel"></label>
      </div>
    </fieldset>
    <fieldset><legend>Extras</legend><div class="sub-list" id="extras">${b.extras.map((x) => subRow('extras', x)).join('')}</div>
      <button type="button" class="btn ghost" data-action="sub-add" data-kind="extras">+ Add extra</button></fieldset>
    <fieldset><legend>Payments</legend><div class="sub-list" id="payments">${b.payments.map((x) => subRow('payments', x)).join('')}</div>
      <button type="button" class="btn ghost" data-action="sub-add" data-kind="payments">+ Add payment</button></fieldset>
    <label>Notes<textarea name="notes" rows="2" placeholder="Arrival time, dietary needs, transfer details…">${h(b.notes)}</textarea></label>
    <div class="summary" id="summary"></div>
    <div class="errors" id="errors" role="alert"></div>
    <div class="modal-foot">
      ${isNew ? '' : `<button type="button" class="btn danger" data-action="delete-booking">Delete</button><button type="button" class="btn" data-action="invoice" data-id="${h(b.id)}">Invoice</button>`}
      <span class="spacer"></span>
      <button type="button" class="btn" data-action="close">Cancel</button>
      <button type="submit" class="btn primary">${isNew ? 'Create booking' : 'Save changes'}</button>
    </div>
  </form>`;
}

function subRow(kind, item) {
  return kind === 'extras'
    ? `<div class="sub-row" data-kind="extras"><input name="label" placeholder="e.g. Dinner, hammam, transfer" value="${h(item.label)}" aria-label="Extra description"><input name="amount" type="number" step="0.01" min="0" value="${h(item.amount)}" aria-label="Extra amount"><button type="button" class="btn ghost" data-action="sub-remove" aria-label="Remove">✕</button></div>`
    : `<div class="sub-row" data-kind="payments"><input name="date" type="date" value="${h(item.date)}" aria-label="Payment date"><select name="method" aria-label="Payment method">${options(PAYMENT_METHODS, item.method, (x) => x)}</select><input name="amount" type="number" step="0.01" min="0" value="${h(item.amount)}" aria-label="Payment amount"><button type="button" class="btn ghost" data-action="sub-remove" aria-label="Remove">✕</button></div>`;
}

function readBookingForm(form) {
  const fd = new FormData(form);
  const subs = (kind) =>
    [...form.querySelectorAll(`#${kind} .sub-row`)].map((row) => {
      const o = {};
      row.querySelectorAll('input, select').forEach((el) => (o[el.name] = el.value));
      return o;
    });
  return {
    checkIn: fd.get('checkIn'),
    checkOut: fd.get('checkOut'),
    adults: parseInt(fd.get('adults'), 10),
    children: parseInt(fd.get('children') || '0', 10),
    roomId: fd.get('roomId'),
    rate: fd.get('rate') === '' ? NaN : Number(fd.get('rate')),
    source: fd.get('source'),
    guestId: fd.get('guestId'),
    status: fd.get('status'),
    notes: fd.get('notes').trim(),
    extras: subs('extras').filter((x) => x.label.trim() || Number(x.amount)).map((x) => ({ label: x.label.trim() || 'Extra', amount: Number(x.amount) || 0 })),
    payments: subs('payments').filter((x) => Number(x.amount)).map((x) => ({ id: uid(), date: x.date, method: x.method, amount: Number(x.amount) })),
    newGuest: { name: (fd.get('g_name') || '').trim(), country: (fd.get('g_country') || '').trim(), email: (fd.get('g_email') || '').trim(), phone: (fd.get('g_phone') || '').trim() },
  };
}

function refreshBookingForm(form, { rateFromRoom = false } = {}) {
  const id = form.dataset.id;
  const v = readBookingForm(form);
  const sel = form.elements.roomId;
  const prev = sel.value || form.dataset.room || '';
  const datesOk = isIsoDate(v.checkIn) && isIsoDate(v.checkOut) && v.checkOut > v.checkIn;
  const guests = (v.adults || 1) + (v.children || 0);
  const free = datesOk ? new Set(availableRooms(state.rooms, state.bookings, v.checkIn, v.checkOut, guests, id).map((r) => r.id)) : null;
  sel.innerHTML =
    '<option value="">— Select a room —</option>' +
    state.rooms
      .map((r) => {
        const ok = !free || free.has(r.id);
        const why = !free ? '' : ok ? ' — available' : r.status === 'out_of_order' ? ' — out of order' : r.capacity < guests ? ` — sleeps ${r.capacity}` : ' — booked';
        return `<option value="${h(r.id)}"${r.id === prev ? ' selected' : ''}>${h(r.name)} · ${h(r.type)} · ${money(r.rate)}${why}</option>`;
      })
      .join('');
  delete form.dataset.room;
  $('#room-hint').textContent = free ? `${free.size} of ${state.rooms.length} rooms available for these dates.` : '';
  const room = roomById(sel.value);
  if (rateFromRoom && room) form.elements.rate.value = room.rate;
  form.querySelector('.new-guest').hidden = form.elements.guestId.value !== '__new';

  const v2 = readBookingForm(form);
  if (datesOk) {
    const t = bookingTotals(v2, state.settings);
    $('#summary').innerHTML = `
      <div><span>Room · ${t.nights} night${t.nights === 1 ? '' : 's'}</span><b>${money(t.roomTotal)}</b></div>
      ${t.extrasTotal ? `<div><span>Extras</span><b>${money(t.extrasTotal)}</b></div>` : ''}
      ${t.touristTax ? `<div><span>Tourist tax</span><b>${money(t.touristTax)}</b></div>` : ''}
      <div class="total"><span>Total</span><b>${money(t.total)}</b></div>
      <div><span>Paid</span><b>${money(t.paid)}</b></div>
      <div class="${t.balance > 0 ? 'due' : ''}"><span>Balance</span><b>${money(t.balance)}</b></div>`;
  } else {
    $('#summary').innerHTML = '';
  }
}

function openBooking(b) {
  openModal(bookingForm(b));
  const form = $('#booking-form');
  form.dataset.room = b.roomId || '';
  refreshBookingForm(form);
}

function submitBooking(form) {
  const id = form.dataset.id;
  const existing = bookingById(id);
  const v = readBookingForm(form);
  const errors = [];
  let guestId = v.guestId;
  if (guestId === '__new') {
    if (!v.newGuest.name) errors.push('Enter the new guest’s name.');
    guestId = 'pending';
  }
  const draft = {
    ...(existing || { id, createdAt: new Date().toISOString() }),
    checkIn: v.checkIn, checkOut: v.checkOut, adults: v.adults, children: v.children, roomId: v.roomId,
    rate: v.rate, source: v.source, status: v.status, notes: v.notes, extras: v.extras, payments: v.payments, guestId,
  };
  errors.push(...validateBooking(draft, state));
  if (errors.length) {
    $('#errors').innerHTML = `<ul>${errors.map((e) => `<li>${h(e)}</li>`).join('')}</ul>`;
    return;
  }
  if (guestId === 'pending') {
    const g = { id: uid(), ...v.newGuest, notes: '' };
    state.guests.push(g);
    draft.guestId = g.id;
  }
  if (existing) {
    Object.assign(existing, draft);
  } else {
    draft.ref = nextRef(state.bookings, draft.checkIn.slice(0, 4));
    state.bookings.push(draft);
  }
  closeModal();
  commit(existing ? 'Booking saved.' : `Booking ${draft.ref} created.`);
}

function openRoom(r) {
  const isNew = !r;
  r = r || { id: uid(), name: '', type: 'Double', capacity: 2, rate: 0, status: 'clean', notes: '' };
  openModal(`<form id="room-form" class="form" data-id="${h(r.id)}">
    <div class="modal-head"><h2>${isNew ? 'Add room' : 'Edit room'}</h2><button type="button" class="btn ghost" data-action="close" aria-label="Close">✕</button></div>
    <div class="form-grid">
      <label class="span-2">Name<input name="name" value="${h(r.name)}" required placeholder="e.g. Chambre Safran"></label>
      <label>Type<input name="type" value="${h(r.type)}" list="room-types"></label>
      <datalist id="room-types"><option>Single</option><option>Double</option><option>Twin</option><option>Junior suite</option><option>Suite</option><option>Family</option></datalist>
      <label>Sleeps<input name="capacity" type="number" min="1" step="1" value="${h(r.capacity)}" required></label>
      <label>Nightly rate (${h(state.settings.currency)})<input name="rate" type="number" min="0" step="0.01" value="${h(r.rate)}" required></label>
      <label>Housekeeping<select name="status">${options(ROOM_STATUSES, r.status)}</select></label>
      <label class="span-2">Notes<input name="notes" value="${h(r.notes)}" placeholder="Floor, view, bed type…"></label>
    </div>
    <div class="errors" id="errors" role="alert"></div>
    <div class="modal-foot">${isNew ? '' : '<button type="button" class="btn danger" data-action="delete-room">Delete</button>'}<span class="spacer"></span>
      <button type="button" class="btn" data-action="close">Cancel</button><button class="btn primary" type="submit">Save</button></div>
  </form>`);
}

function openGuest(g) {
  const isNew = !g;
  g = g || { id: uid(), name: '', country: '', email: '', phone: '', notes: '' };
  openModal(`<form id="guest-form" class="form" data-id="${h(g.id)}">
    <div class="modal-head"><h2>${isNew ? 'Add guest' : 'Edit guest'}</h2><button type="button" class="btn ghost" data-action="close" aria-label="Close">✕</button></div>
    <div class="form-grid">
      <label class="span-2">Full name<input name="name" value="${h(g.name)}" required></label>
      <label>Country<input name="country" value="${h(g.country)}"></label>
      <label>Email<input name="email" type="email" value="${h(g.email)}"></label>
      <label>Phone<input name="phone" type="tel" value="${h(g.phone)}"></label>
      <label class="span-2">Notes<input name="notes" value="${h(g.notes)}" placeholder="Preferences, returning guest, allergies…"></label>
    </div>
    <div class="errors" id="errors" role="alert"></div>
    <div class="modal-foot">${isNew ? '' : '<button type="button" class="btn danger" data-action="delete-guest">Delete</button>'}<span class="spacer"></span>
      <button type="button" class="btn" data-action="close">Cancel</button><button class="btn primary" type="submit">Save</button></div>
  </form>`);
}

function openInvoice(b) {
  const s = state.settings;
  const g = guestById(b.guestId) || {};
  const r = roomById(b.roomId) || {};
  const t = bookingTotals(b, s);
  const line = (desc, qty, unit, amt) => `<tr><td>${desc}</td><td class="num">${qty}</td><td class="num">${unit}</td><td class="num">${money(amt)}</td></tr>`;
  openModal(`<div class="invoice" id="invoice">
    <div class="modal-head no-print"><h2>Invoice</h2><div><button class="btn primary" data-action="print">Print / save PDF</button> <button class="btn ghost" data-action="close" aria-label="Close">✕</button></div></div>
    <div class="inv-head">
      <div><div class="inv-riad">${h(s.riadName)}</div><div class="muted">${[s.address, s.city].filter(Boolean).map(h).join(', ')}</div><div class="muted">${[s.phone, s.email].filter(Boolean).map(h).join(' · ')}</div></div>
      <div class="inv-meta"><div><b>Invoice</b> ${h(b.ref)}</div><div>Issued ${h(fmtDate(todayIso()))}</div></div>
    </div>
    <div class="inv-to"><b>Billed to</b><br>${h(g.name)}${g.country ? '<br>' + h(g.country) : ''}${g.email ? '<br>' + h(g.email) : ''}</div>
    <p>${h(r.name)} (${h(r.type)}) · ${h(fmtDate(b.checkIn))} → ${h(fmtDate(b.checkOut))} · ${b.adults} adult${b.adults === 1 ? '' : 's'}${b.children ? `, ${b.children} child${b.children === 1 ? '' : 'ren'}` : ''}</p>
    <table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead><tbody>
      ${line(`Accommodation — ${h(r.name)}`, `${t.nights} night${t.nights === 1 ? '' : 's'}`, money(b.rate), t.roomTotal)}
      ${b.extras.map((x) => line(h(x.label), 1, money(x.amount), x.amount)).join('')}
      ${t.touristTax ? line('Taxe de séjour (tourist tax)', `${b.adults} × ${t.nights}`, money(s.touristTaxPerAdultNight), t.touristTax) : ''}
    </tbody><tfoot>
      <tr class="total"><td colspan="3">Total</td><td class="num">${money(t.total)}</td></tr>
      ${b.payments.map((p) => `<tr><td colspan="3">Paid ${h(fmtDate(p.date))} · ${h(p.method)}</td><td class="num">− ${money(p.amount)}</td></tr>`).join('')}
      <tr class="total"><td colspan="3">Balance due</td><td class="num">${money(t.balance)}</td></tr>
    </tfoot></table>
    <p class="muted small">Thank you for staying with us — shukran!</p>
  </div>`);
}

// ---------- events ----------
$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  ui.view = btn.dataset.view;
  render();
  $('#view').focus();
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const id = el.dataset.id;
  const today = todayIso();
  switch (el.dataset.action) {
    case 'new-booking': {
      const checkIn = el.dataset.date || today;
      const room = roomById(el.dataset.room);
      openBooking({ id: uid(), ref: '', roomId: room?.id || '', guestId: '', checkIn, checkOut: addDays(checkIn, 1), adults: 2, children: 0, rate: room?.rate ?? '', source: 'Direct', status: 'confirmed', extras: [], payments: [], notes: '' });
      break;
    }
    case 'edit-booking': {
      const b = bookingById(id);
      if (b) openBooking(structuredClone(b));
      break;
    }
    case 'invoice': {
      const b = bookingById(id || $('#booking-form')?.dataset.id);
      if (b) openInvoice(b);
      break;
    }
    case 'print':
      window.print();
      break;
    case 'close':
      closeModal();
      break;
    case 'check-in': {
      const b = bookingById(id);
      b.status = 'checked_in';
      commit(`${guestName(b)} checked in.`);
      break;
    }
    case 'check-out': {
      const b = bookingById(id);
      const bal = bookingTotals(b, state.settings).balance;
      if (bal > 0 && !confirm(`${guestName(b)} still owes ${money(bal)}. Check out anyway?`)) return;
      b.status = 'checked_out';
      const r = roomById(b.roomId);
      if (r && r.status !== 'out_of_order') r.status = 'dirty';
      commit(`${guestName(b)} checked out — ${r?.name || 'room'} marked dirty.`);
      break;
    }
    case 'delete-booking': {
      const fid = $('#booking-form').dataset.id;
      if (!confirm('Delete this booking permanently? (To keep a record, set its status to Cancelled instead.)')) return;
      state.bookings = state.bookings.filter((b) => b.id !== fid);
      closeModal();
      commit('Booking deleted.');
      break;
    }
    case 'sub-add': {
      const kind = el.dataset.kind;
      const blank = kind === 'extras' ? { label: '', amount: '' } : { date: today, method: 'Cash', amount: '' };
      $('#' + kind).insertAdjacentHTML('beforeend', subRow(kind, blank));
      $('#' + kind).lastElementChild.querySelector('input')?.focus();
      break;
    }
    case 'sub-remove': {
      const form = el.closest('form');
      el.closest('.sub-row').remove();
      refreshBookingForm(form);
      break;
    }
    case 'edit-room':
      openRoom(roomById(id));
      break;
    case 'delete-room': {
      const rid = $('#room-form').dataset.id;
      const used = state.bookings.filter((b) => b.roomId === rid).length;
      if (used) {
        $('#errors').textContent = `This room has ${used} booking(s). Move or delete them first, or mark the room out of order.`;
        return;
      }
      if (!confirm('Delete this room?')) return;
      state.rooms = state.rooms.filter((r) => r.id !== rid);
      closeModal();
      commit('Room deleted.');
      break;
    }
    case 'edit-guest':
      openGuest(guestById(id));
      break;
    case 'delete-guest': {
      const gid = $('#guest-form').dataset.id;
      const used = state.bookings.filter((b) => b.guestId === gid).length;
      if (used) {
        $('#errors').textContent = `This guest has ${used} booking(s) and cannot be deleted.`;
        return;
      }
      if (!confirm('Delete this guest?')) return;
      state.guests = state.guests.filter((g) => g.id !== gid);
      closeModal();
      commit('Guest deleted.');
      break;
    }
    case 'cal-move':
      ui.calStart = addDays(ui.calStart, Number(el.dataset.days));
      render();
      break;
    case 'cal-today':
      ui.calStart = addDays(today, -2);
      render();
      break;
    case 'booking-filter':
      ui.bookingFilter = el.dataset.filter;
      render();
      break;
    case 'export': {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `riad-backup-${today}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      break;
    }
    case 'load-demo':
      if (!confirm('Replace all current data with demo data?')) return;
      state = demoState();
      commit('Demo data loaded.');
      break;
    case 'reset':
      if (!confirm('Erase ALL rooms, guests and bookings? Export a backup first if you need one.')) return;
      state = emptyState();
      commit('All data erased.');
      break;
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.action === 'room-status') {
    const r = roomById(el.dataset.id);
    r.status = el.value;
    commit(`${r.name}: ${label(r.status)}.`);
  } else if (el.dataset.action === 'cal-date' && isIsoDate(el.value)) {
    ui.calStart = el.value;
    render();
  } else if (el.dataset.action === 'import') {
    const file = el.files[0];
    if (!file) return;
    file.text().then((txt) => {
      try {
        const data = normalize(JSON.parse(txt));
        if (!confirm(`Import ${data.rooms.length} rooms, ${data.guests.length} guests and ${data.bookings.length} bookings? This replaces current data.`)) return;
        state = data;
        commit('Backup imported.');
      } catch (err) {
        toast(`Import failed: ${err.message}`);
      }
    });
  }
});

document.addEventListener('input', (e) => {
  if (e.target.dataset.action === 'search') {
    ui.search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = $('[data-action="search"]');
    input.focus();
    input.setSelectionRange(pos, pos);
    return;
  }
  const form = e.target.closest('#booking-form');
  if (form) {
    $('#errors').innerHTML = '';
    refreshBookingForm(form, { rateFromRoom: e.target.name === 'roomId' });
  }
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'booking-form') return submitBooking(form);
  const fd = Object.fromEntries(new FormData(form));
  if (form.id === 'settings-form') {
    const tax = Number(fd.touristTaxPerAdultNight);
    if (!(tax >= 0)) return toast('Tourist tax must be 0 or more.');
    Object.assign(state.settings, fd, { touristTaxPerAdultNight: tax, currency: fd.currency.trim().toUpperCase() || 'MAD' });
    return commit('Settings saved.');
  }
  if (form.id === 'room-form') {
    const capacity = parseInt(fd.capacity, 10);
    const rate = Number(fd.rate);
    if (!fd.name.trim() || !(capacity >= 1) || !(rate >= 0)) {
      $('#errors').textContent = 'Name, a capacity of at least 1 and a rate of 0 or more are required.';
      return;
    }
    const rec = { id: form.dataset.id, name: fd.name.trim(), type: fd.type.trim(), capacity, rate, status: fd.status, notes: fd.notes.trim() };
    const existing = roomById(rec.id);
    existing ? Object.assign(existing, rec) : state.rooms.push(rec);
    closeModal();
    return commit('Room saved.');
  }
  if (form.id === 'guest-form') {
    if (!fd.name.trim()) {
      $('#errors').textContent = 'Name is required.';
      return;
    }
    const rec = { id: form.dataset.id, name: fd.name.trim(), country: fd.country.trim(), email: fd.email.trim(), phone: fd.phone.trim(), notes: fd.notes.trim() };
    const existing = guestById(rec.id);
    existing ? Object.assign(existing, rec) : state.guests.push(rec);
    closeModal();
    return commit('Guest saved.');
  }
});

// Close dialog by clicking the backdrop.
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

render();
