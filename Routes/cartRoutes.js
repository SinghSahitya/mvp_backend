const express = require("express");
const router = express.Router();
const { getCart, addProductToCart, deleteProductFromCart, placeOrderFromCart, clearCart, isCartEmpty } = require("../Controller/cartController");
const authMiddleware = require("../Middleware/authMiddleware"); // Your auth middleware

router.get("/get_cart", authMiddleware, getCart);
router.post("/add", authMiddleware, addProductToCart);
router.delete('/delete/:productId', authMiddleware, deleteProductFromCart);
router.post('/place-order', authMiddleware, placeOrderFromCart);
router.delete('/clear_cart', authMiddleware, clearCart);
router.get('/is_empty', authMiddleware, isCartEmpty);


module.exports = router;
