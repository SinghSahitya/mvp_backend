const express = require("express");
const router = express.Router();
const {  createNotification, getNotifications, draftOrder, markNotificationRead,getNotificationsByOrder, rejectOrderNotification, getUnreadNotificationsCount } = require("../Controller/notifController");
const authMiddleware = require("../Middleware/authMiddleware"); // Your auth middleware

router.post("/create_notif", authMiddleware, createNotification);
router.post("/draft_order", authMiddleware, draftOrder);
router.get("/get_notif", authMiddleware, getNotifications);
router.get("/num_notif", authMiddleware, getUnreadNotificationsCount);
router.patch("/:id/mark-read", authMiddleware, markNotificationRead);
router.get("/:id", authMiddleware, getNotificationsByOrder);
router.post("/:id/reject", authMiddleware, rejectOrderNotification);

module.exports = router;
