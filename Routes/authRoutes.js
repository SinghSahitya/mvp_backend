const express = require('express');
const router = express.Router();
const { login, verifyOtp, signup, refreshToken } = require('../Controller/authController');

router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/signup', signup);
router.post('/refresh-token', refreshToken);
router.get('/check-status', (req, res) => {
    res.status(200).json({ message: "Server is running" });
});

module.exports = router;
