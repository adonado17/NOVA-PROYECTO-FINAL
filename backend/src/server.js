const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');

async function start() {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');
  }

  await connectDB(process.env.MONGODB_URI);
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () => console.log(`NOVA API escuchando en el puerto ${port}`));
  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`Cerrando NOVA (${signal})`);
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    try {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await mongoose.disconnect();
      clearTimeout(timeout);
    } catch {
      process.exitCode = 1;
    }
  }
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
}

start().catch((error) => {
  console.error('No se pudo iniciar la API:', error.message);
  void mongoose.disconnect();
  process.exitCode = 1;
});
