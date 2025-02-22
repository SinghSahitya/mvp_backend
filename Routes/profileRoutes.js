const express = require('express');
const router = express.Router();
const { addProductToInventory, details, inventory, uploadImages, updateProfile, uploadProfileImageImgbb } = require('../Controller/profileController');
const authMiddleware = require('../Middleware/authMiddleware');

// POST route to add a product
router.post('/add', authMiddleware, addProductToInventory);
router.post('/details', authMiddleware, details);
router.post('/inventory', authMiddleware, inventory);
router.post('/upload-images', authMiddleware, uploadImages);
router.post('/update', authMiddleware, updateProfile);
router.post('/update-image', authMiddleware, uploadProfileImageImgbb);
module.exports = router;
