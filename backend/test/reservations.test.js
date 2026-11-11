const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const Reservation = require('../src/models/Reservation');

const firstUser = { id: '507f1f77bcf86cd799439011', name: 'Cliente Uno', email: 'uno@example.com' };
const secondUser = { id: '507f1f77bcf86cd799439012', name: 'Cliente Dos', email: 'dos@example.com' };
const records = new Map();
const original = {
  findById: User.findById,
  create: Reservation.create,
  find: Reservation.find,
  findOne: Reservation.findOne,
  findOneAndUpdate: Reservation.findOneAndUpdate,
  findOneAndDelete: Reservation.findOneAndDelete,
};

function owned(filter) {
  const item = records.get(filter._id);
  return item && item.user === filter.user ? item : null;
}

before(() => {
  process.env.JWT_SECRET = 'solo-para-la-prueba-una-clave-larga-y-segura';
  User.findById = async (id) => [firstUser, secondUser].find((user) => user.id === id) || null;
  Reservation.create = async (data) => {
    const item = { _id: `507f1f77bcf86cd7994390${String(records.size + 20)}`, ...data, status: 'pendiente' };
    records.set(item._id, item);
    return item;
  };
  Reservation.find = ({ user }) => ({
    sort: async () => [...records.values()].filter((item) => item.user === user),
  });
  Reservation.findOne = async (filter) => owned(filter);
  Reservation.findOneAndUpdate = async (filter, data) => {
    const item = owned(filter);
    if (!item) return null;
    Object.assign(item, data);
    return item;
  };
  Reservation.findOneAndDelete = async (filter) => {
    const item = owned(filter);
    if (item) records.delete(item._id);
    return item;
  };
});

after(() => {
  User.findById = original.findById;
  Reservation.create = original.create;
  Reservation.find = original.find;
  Reservation.findOne = original.findOne;
  Reservation.findOneAndUpdate = original.findOneAndUpdate;
  Reservation.findOneAndDelete = original.findOneAndDelete;
});

function token(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

test('CRUD de reservas valida datos y separa las reservas por usuario', async () => {
  const base = '/api/reservations';
  const firstToken = `Bearer ${token(firstUser)}`;
  const secondToken = `Bearer ${token(secondUser)}`;
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const later = new Date(Date.now() + 172_800_000).toISOString();

  assert.equal((await request(app).get(base)).status, 401);
  assert.equal((await request(app).post(base).set('Authorization', firstToken)
    .send({ service: 'desconocido', scheduledAt: future })).status, 422);
  assert.equal((await request(app).post(base).set('Authorization', firstToken)
    .send({ service: 'masaje', scheduledAt: new Date(0).toISOString() })).status, 422);

  const created = await request(app).post(base).set('Authorization', firstToken).send({
    service: 'masaje', scheduledAt: future, notes: 'Prefiero la tarde',
    user: secondUser.id, status: 'confirmada',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.reservation.user, firstUser.id);
  assert.equal(created.body.reservation.status, 'pendiente');
  const id = created.body.reservation._id;

  const listed = await request(app).get(base).set('Authorization', firstToken);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.reservations.length, 1);
  assert.equal((await request(app).get(`${base}/${id}`).set('Authorization', firstToken)).status, 200);
  assert.equal((await request(app).get(base).set('Authorization', secondToken)).body.reservations.length, 0);
  assert.equal((await request(app).get(`${base}/${id}`).set('Authorization', secondToken)).status, 404);
  assert.equal((await request(app).put(`${base}/${id}`).set('Authorization', secondToken)
    .send({ service: 'limpieza', scheduledAt: later })).status, 404);
  assert.equal((await request(app).delete(`${base}/${id}`).set('Authorization', secondToken)).status, 404);

  const updated = await request(app).put(`${base}/${id}`).set('Authorization', firstToken)
    .send({ service: 'limpieza', scheduledAt: later, notes: '' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.reservation.service, 'limpieza');
  assert.equal((await request(app).get(`${base}/no-es-un-id`).set('Authorization', firstToken)).status, 422);
  assert.equal((await request(app).delete(`${base}/${id}`).set('Authorization', firstToken)).status, 204);
  assert.equal((await request(app).get(base).set('Authorization', firstToken)).body.reservations.length, 0);
});
