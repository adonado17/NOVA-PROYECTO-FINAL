const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');

const users = new Map();
const original = {
  findOne: User.findOne,
  findById: User.findById,
  create: User.create,
};

function query(value) {
  return {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    select: () => Promise.resolve(value),
  };
}

before(() => {
  process.env.JWT_SECRET = 'solo-para-la-prueba-una-clave-larga-y-segura';
  User.findOne = ({ email }) => query(users.get(email) || null);
  User.findById = async (id) => [...users.values()].find((user) => user.id === id) || null;
  User.create = async ({ name, email, passwordHash }) => {
    const user = { id: String(users.size + 1), name, email, passwordHash };
    users.set(email, user);
    return user;
  };
});

after(() => {
  User.findOne = original.findOne;
  User.findById = original.findById;
  User.create = original.create;
});

test('registro, validacion, duplicado, login y perfil protegido', async () => {
  const invalid = await request(app).post('/api/auth/register').send({
    name: 'A', email: 'mal', password: '123',
  });
  assert.equal(invalid.status, 422);
  assert.ok(invalid.body.errors.length >= 3);

  const registration = await request(app).post('/api/auth/register').send({
    name: 'Cliente NOVA', email: 'CLIENTE@EXAMPLE.COM', password: 'Clave12345',
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.user.email, 'cliente@example.com');
  assert.ok(registration.body.token);
  assert.equal(registration.body.user.passwordHash, undefined);

  const duplicate = await request(app).post('/api/auth/register').send({
    name: 'Otro cliente', email: 'cliente@example.com', password: 'Clave12345',
  });
  assert.equal(duplicate.status, 409);

  const wrongPassword = await request(app).post('/api/auth/login').send({
    email: 'cliente@example.com', password: 'NoEsLaClave',
  });
  assert.equal(wrongPassword.status, 401);

  const login = await request(app).post('/api/auth/login').send({
    email: 'cliente@example.com', password: 'Clave12345',
  });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);

  const noToken = await request(app).get('/api/auth/me');
  assert.equal(noToken.status, 401);

  const profile = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.name, 'Cliente NOVA');
  assert.equal(profile.body.user.passwordHash, undefined);
});

test('estado de la API y JSON invalido', async () => {
  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.database, 'disconnected');

  const malformed = await request(app)
    .post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send('{');
  assert.equal(malformed.status, 400);
});
