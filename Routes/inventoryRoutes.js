const express = require("express");
const router = express.Router();
const { fetchInventoryWithExpenseRate, deleteInventoryItem, updateInventoryItem } = require("../Controller/inventoryController");
const authMiddleware = require("../Middleware/authMiddleware");

router.get("/fetch", authMiddleware, fetchInventoryWithExpenseRate);
router.post("/update", authMiddleware, updateInventoryItem);
router.delete("/delete/:itemId", authMiddleware, deleteInventoryItem);

module.exports = router;
