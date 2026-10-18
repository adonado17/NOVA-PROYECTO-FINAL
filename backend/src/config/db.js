const mongoose = require('mongoose');

async function connectDB(uri) {
  if (!uri) {
    throw new Error('Falta MONGODB_URI en el archivo .env');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return mongoose.connection;
}

module.exports = connectDB;
