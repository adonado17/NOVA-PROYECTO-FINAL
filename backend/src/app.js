const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const authRoutes = require('./routes/auth');

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

const frontend = path.resolve(__dirname, '../..');
app.use('/css', express.static(path.join(frontend, 'css')));
app.use('/img', express.static(path.join(frontend, 'img')));
app.use('/js', express.static(path.join(frontend, 'js')));
app.get('/', (req, res) => res.sendFile(path.join(frontend, 'index.html')));

app.use((req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ message: 'El JSON enviado no es valido.' });
  }
  console.error(error);
  return res.status(500).json({ message: 'Error interno del servidor.' });
});

module.exports = app;
