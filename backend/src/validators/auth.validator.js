const { body } = require('express-validator');

const registerRules = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('El nombre debe tener entre 2 y 80 caracteres.'),
  body('email').trim().isEmail().withMessage('Ingresa un correo valido.').normalizeEmail(),
  body('password')
    .isLength({ min: 8, max: 72 }).withMessage('La contrasena debe tener entre 8 y 72 caracteres.')
    .matches(/[A-Za-z]/).withMessage('La contrasena debe incluir una letra.')
    .matches(/[0-9]/).withMessage('La contrasena debe incluir un numero.'),
];

const loginRules = [
  body('email').trim().isEmail().withMessage('Ingresa un correo valido.').normalizeEmail(),
  body('password').notEmpty().withMessage('Ingresa la contrasena.'),
];

module.exports = { registerRules, loginRules };
