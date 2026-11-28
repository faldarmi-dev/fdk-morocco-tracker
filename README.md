# Riad Manager

A front-desk and operations app for Moroccan riads and small guesthouses. It runs in any browser, has no dependencies and needs no account.

## Features

- **Today dashboard**: tonight's occupancy, arrivals and departures with one-click check-in and check-out, guests in house, room revenue for the month (with occupancy and ADR), and outstanding balances.
- **Calendar**: a 14-day availability grid across all rooms. Click an empty day to book it, or click a booking to open it. A dot marks a booking with a balance due.
- **Bookings**: create, edit, cancel and search bookings. Each booking records the source (Direct, Booking.com, Airbnb, Expedia, agency, walk-in), extras (hammam, dinners, transfers…) and payments (cash, card, transfer, OTA-collected).
  - Double bookings are blocked. A check-out and a check-in on the same day are allowed.
  - Room capacity is enforced, and the room picker shows which rooms are free for the chosen dates.
  - Running totals show room, extras, tourist tax, paid and balance.
- **Invoices**: a printable invoice for each booking. Use **Print / save PDF**.
- **Rooms and housekeeping**: rooms, rates and capacity. Each room has a housekeeping status (clean, dirty, inspected, out of order), and checking a guest out marks the room dirty.
- **Guests**: a guest list with stay history and total billed.
- **Settings**: riad details, currency (MAD by default), check-in and check-out times, and the **taxe de séjour** rate.
- **Backups**: export or import all data as JSON.
- Works on phones, with a dark mode that follows the system setting.

> **Tourist tax:** the taxe de séjour rate depends on your commune and your property's classification. The app does not assume a rate: it starts at 0. Enter the rate that applies to you in Settings. It is charged per adult per night; children are not charged.

## Run it

Requires Node.js 18 or later.

```bash
npm start          # serves the app at http://localhost:8080 (set PORT to change)
npm test           # runs the booking-logic unit tests
```

The app is static, so any web server works (for example `python3 -m http.server`). Opening `index.html` directly from disk does not work, because browsers block ES modules on `file://`.

The first time it opens, it loads a demo riad ("Riad Dar Yasmine") so you can try it out. To start fresh, go to **Settings → Erase all data**.

## Data and privacy

All data stays in the browser's local storage on the device you use. Nothing is sent to a server. As a result:

- Each device or browser has its own separate data. Use **Export backup** and **Import backup** to move data between them.
- Clearing browser data deletes the bookings, so export backups regularly.

## Project layout

```
index.html        app shell
styles.css        styles (terracotta / zellige palette, dark mode, print)
src/logic.js      pure booking logic: dates, overlaps, totals, occupancy, KPIs
src/store.js      localStorage persistence, demo data, backup validation
src/app.js        UI rendering and events
server.js         zero-dependency static server
tests/            node:test unit tests for logic and store
```
