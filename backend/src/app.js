const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const authRoutes = require('./routes/auth');
const reservationRoutes = require('./routes/reservations');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/reservations', reservationRoutes);

const frontend = path.resolve(__dirname, '../..');
const angularFrontend = path.join(frontend, 'frontend', 'dist', 'frontend', 'browser');
if (fs.existsSync(path.join(angularFrontend, 'index.html'))) {
  app.use(express.static(angularFrontend, { index: false }));
  for (const route of ['/', '/login', '/register', '/profile', '/reservations']) {
    app.get(route, (req, res) => res.sendFile(path.join(angularFrontend, 'index.html')));
  }
  app.get('/registro.html', (req, res) => res.redirect(302, '/register'));
  app.get('/iniciar-sesion.html', (req, res) => res.redirect(302, '/login'));
  app.get('/perfil.html', (req, res) => res.redirect(302, '/profile'));
} else {
  app.use('/css', express.static(path.join(frontend, 'css')));
  app.use('/img', express.static(path.join(frontend, 'img')));
  app.use('/js', express.static(path.join(frontend, 'js')));
  app.get('/', (req, res) => res.sendFile(path.join(frontend, 'index.html')));
  for (const page of ['registro.html', 'iniciar-sesion.html', 'perfil.html']) {
    app.get(`/${page}`, (req, res) => res.sendFile(path.join(frontend, page)));
  }
}

app.use((req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ message: 'El JSON enviado no es valido.' });
  }
  console.error(error);
  return res.status(500).json({ message: 'Error interno del servidor.' });
});

module.exports = app;
