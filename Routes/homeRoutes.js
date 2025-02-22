const express = require("express");
const router = express.Router();
const { getAllBusinesses, getAvailableProducts,getUserInventoryProducts,  searchBusinesses, searchProducts, getBusinessesByProduct } = require("../Controller/homeController");
const authMiddleware = require("../Middleware/authMiddleware");

router.get("/businesses", authMiddleware, getAllBusinesses);

router.get("/products", authMiddleware, getAvailableProducts);

router.get("/user-inventory", authMiddleware, getUserInventoryProducts);

router.get("/search-businesses", authMiddleware, searchBusinesses);
router.get("/search-products", authMiddleware, searchProducts);
router.get("/businesses-by-product/:productName", authMiddleware, getBusinessesByProduct);

module.exports = router;
