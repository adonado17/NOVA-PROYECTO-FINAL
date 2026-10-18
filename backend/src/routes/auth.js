const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, matchedData } = require('express-validator');
const User = require('../models/User');
const validate = require('../middleware/validate');
const requireAuth = require('../middleware/auth');

const router = express.Router();

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

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function makeToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
}

router.post('/register', registerRules, validate, async (req, res, next) => {
  try {
    const { name, email, password } = matchedData(req, { locations: ['body'] });
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Este correo ya esta registrado.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    return res.status(201).json({
      message: 'Usuario registrado.',
      token: makeToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Este correo ya esta registrado.' });
    }
    return next(error);
  }
});

router.post('/login', loginRules, validate, async (req, res, next) => {
  try {
    const { email, password } = matchedData(req, { locations: ['body'] });
    const user = await User.findOne({ email }).select('+passwordHash');
    const valid = user && await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Correo o contrasena incorrectos.' });

    return res.json({ message: 'Inicio de sesion correcto.', token: makeToken(user), user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
