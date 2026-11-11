const mongoose = require('mongoose');
const serviceIds = require('../config/services');

const reservationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    service: { type: String, enum: serviceIds, required: true },
    scheduledAt: { type: Date, required: true },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    status: { type: String, enum: ['pendiente'], default: 'pendiente' },
  },
  { timestamps: true }
);

reservationSchema.index({ user: 1, scheduledAt: 1 });

module.exports = mongoose.model('Reservation', reservationSchema);
