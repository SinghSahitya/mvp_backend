const express = require('express');
const router = express.Router();
const { login, verifyOtp, signup } = require('../Controller/authController');

router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/signup', signup);

module.exports = router;
