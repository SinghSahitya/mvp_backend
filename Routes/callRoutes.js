const express = require('express');
const router = express.Router();
const { handleVoiceCall, getZegoToken } = require('../Controller/callController');
const authMiddleware = require('../Middleware/authMiddleware');

router.post('/token', authMiddleware, getZegoToken);
router.post('/handle', authMiddleware, handleVoiceCall);
module.exports = router;
