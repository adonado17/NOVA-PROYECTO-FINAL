const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { matchedData } = require('express-validator');
const User = require('../models/User');

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function makeToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
}

async function register(req, res, next) {
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
}

async function login(req, res, next) {
  try {
    const { email, password } = matchedData(req, { locations: ['body'] });
    const user = await User.findOne({ email }).select('+passwordHash');
    const valid = user && await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Correo o contrasena incorrectos.' });

    return res.json({ message: 'Inicio de sesion correcto.', token: makeToken(user), user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
}

function me(req, res) {
  return res.json({ user: publicUser(req.user) });
}

module.exports = { register, login, me };
