const { body, param } = require('express-validator');
const serviceIds = require('../config/services');

const reservationRules = [
  body('service').isIn(serviceIds).withMessage('Selecciona un servicio válido.'),
  body('scheduledAt')
    .isISO8601({ strict: true }).withMessage('Ingresa una fecha y hora válidas.')
    .bail()
    .custom((value) => new Date(value).getTime() > Date.now())
    .withMessage('La cita debe tener una fecha futura.'),
  body('notes').optional().isString().withMessage('Las notas deben ser texto.')
    .trim().isLength({ max: 500 }).withMessage('Las notas no pueden superar 500 caracteres.'),
];

const reservationIdRule = param('id').isMongoId().withMessage('Identificador de reserva inválido.');

module.exports = { reservationRules, reservationIdRule };
