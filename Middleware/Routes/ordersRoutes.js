const express = require("express");
const router = express.Router();
const { getSaleOrders,getPurchaseOrders, getOrderById, updateDraftOrderDetails, getDraftOrderDetails,placeOrderFromProofRead } = require("../Controller/ordersController");
const authMiddleware = require("../Middleware/authMiddleware"); // Your auth middleware

router.get("/sales", authMiddleware, getSaleOrders);
router.get("/purchases", authMiddleware, getPurchaseOrders);
router.get("/:orderId", authMiddleware, getOrderById);
router.get("/draft/:orderId", authMiddleware, getDraftOrderDetails);
router.put("/draft/:orderId/update", authMiddleware, updateDraftOrderDetails);
router.post("/draft-place-order",authMiddleware, placeOrderFromProofRead );

module.exports = router;
