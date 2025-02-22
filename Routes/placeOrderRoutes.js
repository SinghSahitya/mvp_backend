const express = require("express");
const router = express.Router();
const {
  searchCustomers,
  addCustomer,
  searchProducts,
  createOrder,
  generateMemoPDF,
  generateInvoiceByOrderId,
  getInvoiceUrlByOrderId
} = require("../Controller/placeOrderController");
const authMiddleware = require("../Middleware/authMiddleware");

// Route to search for customers by name
router.get("/customers", authMiddleware, searchCustomers);

// Route to add a new customer
router.post("/add-customer", authMiddleware, addCustomer);

// Route to search for products by name
router.get("/products", authMiddleware, searchProducts);

// Route to create a new order
router.post("/orders", authMiddleware, createOrder);

router.post("/generate-pdf", authMiddleware, generateMemoPDF);
router.post("/memo", authMiddleware, generateInvoiceByOrderId);
router.post("/invoice-by-id", authMiddleware, getInvoiceUrlByOrderId);

module.exports = router;
