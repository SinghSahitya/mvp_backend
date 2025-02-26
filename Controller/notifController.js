const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const Order = require("../models/Order");
const Cart = require("../models/Cart");

const createNotification = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { initiator, recipient, orderId, type } = req.body;
        console.log(initiator, recipient, orderId, type);
        // Validate enum t      ypes
        const validTypes = ["ORDER_RECEIVED", "ORDER_UPDATE", "ORDER_CONFIRMED", "ORDER_REJECTED"];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ message: "Invalid notification type" });
        }

        // Create the order first
        const order = await Order.findById(orderId).session(session);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        console.log('ORDER FOUND');
        // Create notification
        const newNotification = new Notification({
            initiator,
            recipient,
            order: orderId,
            orderType: "Order",
            type
        });
        console.log("Created New ORder");
        await newNotification.save({ session });

        await session.commitTransaction();
        res.status(201).json({
            message: "Notification created successfully",
            notification: newNotification
        });
        
    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ 
            message: "Error creating notification",
            error: error.message 
        });
    } finally {
        session.endSession();
    }
};

const draftOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const buyerId = req.user.id; // Logged-in business (buyer)
    const cart = await Cart.findOne({ buyer: buyerId }).populate("items.product").populate("seller");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const { items, seller } = cart;

    // Calculate total price
    const totalAmount = items.reduce((total, item) => total + item.price * item.quantity, 0);

       // Create a Purchase record for the buyer
       const newOrder = new Order({
        business: seller._id,
        customer: buyerId,
        products: items.map((item) => ({
          product: item.product._id,
          quantity: item.quantity,
          price: item.price,
        })),
        totalAmount,
      });
  
      await newOrder.save({ session });
      console.log(newOrder);
      // Clear the cart after placing the order
      await Cart.findOneAndDelete({ buyer: buyerId }, { session });
  
      await session.commitTransaction();
      session.endSession();
  
      res.status(201).json({ message: "Order placed successfully", data: newOrder });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("Error placing order:", error);
      res.status(500).json({ message: "Internal server error", error: error.message });
    };
}

const getNotifications = async (req, res) => {
    try {
        const businessId = req.user.id;
        const { filter } = req.query;
      
        let query = { 
            $or: [
                { recipient: businessId },
            ]
        };

        if (filter === 'incoming') {
            query = { recipient: businessId };
        } else if (filter === 'purchases') {
            query = { recipient: businessId };
        }
        const getOrderModel = (orderType) => {
          console.log(orderType);
          switch(orderType) {
            case 'Order': return mongoose.model('Order');
            case 'Purchase': return mongoose.model('Purchase');
            default: throw new Error('Invalid order type');
          }
        };
        
        const notifications = await Notification.find(query)
            .populate("initiator", "businessName ownerImage") // added profileImage
            .populate("recipient", "businessName ownerImage") // added profileImage
            .populate({
              path: 'order',
              options: { strictPopulate: false },
            })
            .sort({ createdAt: -1 });

      
        res.status(200).json(notifications);
        
    } catch (error) {
        res.status(500).json({ 
            message: "Error fetching notifications",
            error: error.message 
        });
    }
};


const markNotificationRead = async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findByIdAndUpdate(
            id,
            { isRead: true },
            { new: true }
        );
        
        if (!notification) {
            return res.status(404).json({ message: "Notification not found" });
        }
        
        res.status(200).json(notification);
    } catch (error) {
        res.status(500).json({ 
            message: "Error updating notification",
            error: error.message 
        });
    }
};

const getNotificationsByOrder = async (req, res) => {
    try {
        console.log("Order ID: ", req.params );
      const notifications = await Notification.find({ 
        order: req.params.id 
      });
   
      res.status(200).json({ data:notifications });
    } catch (error) {
      res.status(500).json({ 
        message: "Error fetching notifications",
        error: error.message 
      });
    }
  };

  const rejectOrderNotification = async (req, res) => {
    try {
      const { orderId } = req.body;
      const notification = await Notification.findById(req.params.id)
        .populate('initiator')
        .populate('recipient');
  
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
  
      // Swap roles and update status
      const updatedNotification = await Notification.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            initiator: notification.recipient,
            recipient: notification.initiator,
            order: null,
            type: "ORDER_REJECTED",
            isRead: false
          }
        },
        { new: true }
      );
      await Order.findByIdAndDelete(orderId);

      res.status(200).json(updatedNotification);
    } catch (error) {
      res.status(500).json({ message: "Error rejecting order", error });
    }
  };

  const getUnreadNotificationsCount = async (req, res) => {
    try {
        const businessId = req.user.id;
        
        const count = await Notification.countDocuments({ 
            recipient: businessId,
            isRead: false
        });
        
        res.status(200).json({ count });
        
    } catch (error) {
        console.error("Error fetching unread notifications count:", error);
        res.status(500).json({ 
            message: "Error fetching unread notifications count",
            error: error.message 
        });
    }
};
  

module.exports = {
    createNotification,
    getNotifications,
    draftOrder,
    markNotificationRead,
    getNotificationsByOrder,
    rejectOrderNotification,
    getUnreadNotificationsCount
};
