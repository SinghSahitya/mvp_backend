const express = require('express');
const router = express.Router();
const { login, verifyOtp, signup, refreshToken } = require('../Controller/authController');

router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/signup', signup);
router.post('/refresh-token', refreshToken);

module.exports = router;
