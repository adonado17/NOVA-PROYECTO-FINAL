const express = require('express');
const requireAuth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { reservationRules, reservationIdRule } = require('../validators/reservation.validator');
const controller = require('../controllers/reservation.controller');

const router = express.Router();
router.use(requireAuth);

router.get('/', controller.list);
router.get('/:id', reservationIdRule, validate, controller.get);
router.post('/', reservationRules, validate, controller.create);
router.put('/:id', reservationIdRule, reservationRules, validate, controller.update);
router.delete('/:id', reservationIdRule, validate, controller.remove);

module.exports = router;
