#!/usr/bin/env node
'use strict';
// Usage: node scripts/smoke-aws.cjs https://PUBLIC_IP [--allow-test-data]
// The flag authorizes disposable API records and narrowly scoped DB cleanup.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const args = process.argv.slice(2);
const allowWrites = args.includes('--allow-test-data');
const inputs = args.filter((value) => value !== '--allow-test-data');
const tag = `novadeploy-${crypto.randomBytes(16).toString('hex')}`;
const startedAt = new Date(Date.now() - 60_000);
const users = ['a', 'b'].map((suffix) => ({
  name: `${tag}-${suffix}`, email: `${tag}-${suffix}@example.com`,
  password: `N0va-${crypto.randomBytes(32).toString('base64url')}`, id: null, attempted: false,
}));
let base, mongoose, User, Reservation, reservationId, reservationAttempted = false, checks = 0;
const notes = `${tag}:created`, updatedNotes = `${tag}:updated`;
function fail(message) { const error = new Error(message); error.safe = true; throw error; }
function check(condition, label) { if (!condition) fail(label); checks += 1; }
async function request(route, status, { method = 'GET', token, body, html = false } = {}) {
  let response;
  try {
    response = await fetch(new URL(route, base), {
      method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { fail(`Network/TLS request failed: ${method} ${route.split('/').slice(0, 3).join('/')}`); }
  check(response.status === status, `${method} endpoint returned ${response.status}; expected ${status}.`);
  if (status === 204) return null;
  const text = await response.text();
  if (html) {
    check(response.headers.get('content-type')?.includes('text/html') && /<app-root[\s>]/i.test(text),
      'Angular entry point is missing.');
    return text;
  }
  try { return JSON.parse(text); } catch { fail('API response was not valid JSON.'); }
}
async function cleanup() {
  if (!mongoose || !User || mongoose.connection.readyState !== 1) return !allowWrites || !users.some((u) => u.attempted);
  let clean = true;
  for (const user of users.filter((value) => value.attempted)) {
    try {
      // Preflight proved these random, exact identities did not exist before this run.
      const identity = { email: user.email, name: user.name, createdAt: { $gte: startedAt } };
      const record = await User.findOne(identity).select('_id').lean();
      if (!record) { clean = false; continue; }
      const id = String(record._id);
      assert(mongoose.isObjectIdOrHexString(id) && (!user.id || user.id === id));
      assert(user.email === `${user.name}@example.com` && user.name.startsWith(`${tag}-`));
      if (user === users[0] && reservationAttempted) {
        // Also reconcile a successful POST whose network response was lost.
        const created = await Reservation.find({ user: id, notes: { $in: [notes, updatedNotes] },
          createdAt: { $gte: startedAt } }).select('_id notes').lean();
        for (const item of created) {
          assert(mongoose.isObjectIdOrHexString(item._id));
          assert(!reservationId || String(item._id) === reservationId);
          await Reservation.deleteOne({ _id: item._id, user: id, notes: item.notes,
            createdAt: { $gte: startedAt } });
        }
      }
      if (await Reservation.exists({ user: id })) { clean = false; continue; }
      const deleted = await User.deleteOne({ _id: id, ...identity });
      if (deleted.deletedCount !== 1 || await User.exists({ _id: id, ...identity })) clean = false;
    } catch { clean = false; }
  }
  return clean;
}
async function main() {
  if (inputs.length !== 1 || args.some((value) => value.startsWith('--') && value !== '--allow-test-data'))
    fail('Usage: node scripts/smoke-aws.cjs https://PUBLIC_IP [--allow-test-data]');
  try { base = new URL(inputs[0]); } catch { fail('A valid HTTPS base URL is required.'); }
  check(base.protocol === 'https:' && !base.username && !base.password && !base.search && !base.hash
    && base.pathname === '/', 'Use an HTTPS origin without credentials, path, query, or fragment.');
  const health = await request('/api/health', 200);
  check(health.status === 'ok' && health.database === 'connected', 'Database health is not connected.');
  check((await request('/api/ready', 200)).status === 'ready', 'API is not ready.');
  for (const route of ['/', '/login', '/register', '/profile', '/reservations'])
    await request(route, 200, { html: true });
  await request('/api/auth/me', 401);
  await request('/api/reservations', 401);
  if (!allowWrites) { console.log(`PASS: ${checks} read-only checks; use --allow-test-data for CRUD/auth isolation.`); return; }
  const requireBackend = createRequire(path.resolve(__dirname, '../backend/package.json'));
  requireBackend('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
  mongoose = requireBackend('mongoose');
  User = requireBackend('./src/models/User');
  Reservation = requireBackend('./src/models/Reservation');
  if (!process.env.MONGODB_URI) fail('Local MongoDB configuration is required for guaranteed cleanup.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  for (const user of users)
    check(!await User.exists({ email: user.email }), 'Disposable identity unexpectedly exists; refusing mutations.');
  for (const user of users) {
    user.attempted = true;
    const result = await request('/api/auth/register', 201, { method: 'POST', body: {
      name: user.name, email: user.email, password: user.password } });
    if (mongoose.isObjectIdOrHexString(result.user?.id)) user.id = result.user.id;
    check(user.id && result.user.email === user.email && result.user.name === user.name
      && typeof result.token === 'string' && !('passwordHash' in result.user), 'Registration contract failed.');
    user.token = result.token;
    // Ensure the cleanup connection points to the same database as this deployed API.
    check(await User.exists({ _id: user.id, email: user.email, name: user.name }), 'Local and deployed database differ.');
  }
  const login = await request('/api/auth/login', 200, { method: 'POST', body: {
    email: users[0].email, password: users[0].password } });
  check(login.user?.id === users[0].id && typeof login.token === 'string', 'Login contract failed.');
  const token = login.token, other = users[1].token;
  const profile = (await request('/api/auth/me', 200, { token })).user;
  check(profile?.id === users[0].id && profile.email === users[0].email && !('passwordHash' in profile), 'Profile mismatch.');
  const body = { service: 'limpieza', scheduledAt: new Date(Date.now() + 7 * 86400000).toISOString(), notes };
  await request('/api/reservations', 422, { method: 'POST', token, body: { ...body, scheduledAt: '2000-01-01T00:00:00Z' } });
  reservationAttempted = true;
  const created = (await request('/api/reservations', 201, { method: 'POST', token, body })).reservation;
  if (mongoose.isObjectIdOrHexString(created?._id)) reservationId = created._id;
  check(reservationId && String(created.user) === users[0].id && created.status === 'pendiente'
    && created.notes === notes, 'Reservation creation contract failed.');
  const route = `/api/reservations/${reservationId}`;
  check((await request('/api/reservations', 200, { token })).reservations.some((r) => r._id === reservationId), 'Own list omitted reservation.');
  check((await request(route, 200, { token })).reservation.notes === notes, 'Own reservation read failed.');
  const update = { ...body, notes: updatedNotes, service: 'hidratacion' };
  const changed = (await request(route, 200, { method: 'PUT', token, body: update })).reservation;
  check(changed.notes === updatedNotes && changed.service === update.service, 'Reservation update failed.');
  check(!(await request('/api/reservations', 200, { token: other })).reservations.some((r) => r._id === reservationId), 'Other user can list the reservation.');
  await request(route, 404, { token: other });
  await request(route, 404, { method: 'PUT', token: other, body });
  await request(route, 404, { method: 'DELETE', token: other });
  check((await request(route, 200, { token })).reservation.notes === updatedNotes, 'Other user modified the reservation.');
  await request(route, 204, { method: 'DELETE', token });
  await request(route, 404, { token });
  check(!(await request('/api/reservations', 200, { token })).reservations.some((r) => r._id === reservationId), 'Deleted reservation remains listed.');
}
(async () => {
  let failed = false;
  try { await main(); }
  catch (error) { failed = true; console.error(error.safe ? `FAIL: ${error.message}` : 'FAIL: dependency/database/runtime check failed; details withheld to protect secrets.'); }
  finally {
    const cleaned = await cleanup().catch(() => false);
    if (!cleaned) { failed = true; console.error(`Cleanup incomplete; inspect only disposable records for run ${tag}.`); }
    if (mongoose) await mongoose.disconnect().catch(() => { failed = true; });
    if (allowWrites && !failed) console.log(`PASS: ${checks} deployed checks; disposable users and reservation removed.`);
    process.exitCode = failed ? 1 : 0;
  }
})();
