const express = require("express");
const router = express.Router();
const { getBusinessDetails } = require("../Controller/businessPageController");
const authMiddleware = require("../Middleware/authMiddleware");

router.post("/details", authMiddleware, getBusinessDetails);

module.exports = router;
