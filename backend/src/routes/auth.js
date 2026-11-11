const express = require('express');
const { register, login, me } = require('../controllers/auth.controller');
const { registerRules, loginRules } = require('../validators/auth.validator');
const validate = require('../middleware/validate');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.post('/register', registerRules, validate, register);
router.post('/login', loginRules, validate, login);
router.get('/me', requireAuth, me);

module.exports = router;
