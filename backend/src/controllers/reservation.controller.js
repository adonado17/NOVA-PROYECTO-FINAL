const { matchedData } = require('express-validator');
const Reservation = require('../models/Reservation');

async function list(req, res, next) {
  try {
    const reservations = await Reservation.find({ user: req.user.id }).sort({ scheduledAt: 1 });
    return res.json({ reservations });
  } catch (error) {
    return next(error);
  }
}

async function get(req, res, next) {
  try {
    const reservation = await Reservation.findOne({ _id: req.params.id, user: req.user.id });
    if (!reservation) return res.status(404).json({ message: 'Reserva no encontrada.' });
    return res.json({ reservation });
  } catch (error) {
    return next(error);
  }
}

async function create(req, res, next) {
  try {
    const data = matchedData(req, { locations: ['body'] });
    const reservation = await Reservation.create({
      user: req.user.id,
      service: data.service,
      scheduledAt: new Date(data.scheduledAt),
      notes: data.notes ?? '',
    });
    return res.status(201).json({ reservation });
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const data = matchedData(req, { locations: ['body'] });
    const reservation = await Reservation.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { service: data.service, scheduledAt: new Date(data.scheduledAt), notes: data.notes ?? '' },
      { new: true, runValidators: true }
    );
    if (!reservation) return res.status(404).json({ message: 'Reserva no encontrada.' });
    return res.json({ reservation });
  } catch (error) {
    return next(error);
  }
}

async function remove(req, res, next) {
  try {
    const reservation = await Reservation.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!reservation) return res.status(404).json({ message: 'Reserva no encontrada.' });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = { list, get, create, update, remove };
