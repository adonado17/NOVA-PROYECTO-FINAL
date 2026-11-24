const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');

test('readiness deja de aceptar tráfico cuando MongoDB no está conectado', async () => {
  const originalState = mongoose.connection.readyState;
  try {
    for (const state of [0, 2, 3, 1]) {
      mongoose.connection.readyState = state;
      const response = await request(app).get('/api/ready');
      assert.equal(response.status, state === 1 ? 200 : 503);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.body.status, state === 1 ? 'ready' : 'unavailable');
    }
  } finally {
    mongoose.connection.readyState = originalState;
  }
});

test('producción falla al iniciar si el despliegue no contiene Angular compilado', () => {
  const result = spawnSync(process.execPath, ['-e', `
    require('node:fs').existsSync = () => false;
    require('./src/app');
  `], {
    cwd: require('node:path').resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Falta compilar Angular para producción/);
});
