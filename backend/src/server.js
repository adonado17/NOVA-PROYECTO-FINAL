require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');

async function start() {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');
  }

  await connectDB(process.env.MONGODB_URI);
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`NOVA API en http://localhost:${port}`));
}

start().catch((error) => {
  console.error('No se pudo iniciar la API:', error.message);
  process.exitCode = 1;
});
