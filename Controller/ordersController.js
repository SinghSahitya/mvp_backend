const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const Customer = require("../models/Customer");
const Business = require("../models/Business");
const PersonalizedPrice = require("../models/PersonalizedPrice");
// Get Sale Orders (orders where the logged-in user is the seller)
const getSaleOrders = async (req, res) => {
  try {
    const businessId = req.user.id; // Logged-in user's business ID
    console.log("Inside getSaleOrders");

    if (!businessId) {
      return res.status(403).json({ message: "Invalid business ID" });
    }

    // Fetch sale orders without populating the buyer
    const sales = await Sale.find({ seller: businessId })
      .populate({
        path: "products.product",
        select: "name image_url", // Populate product details
      })
      .sort({ createdAt: -1 }); // Sort by most recent orders

    // Populate buyer details based on buyerType
    const populatedSales = await Promise.all(
      sales.map(async (sale) => {
        if (sale.buyerType === "Customer") {
          const customer = await mongoose.model("Customer").findById(sale.buyer).select("name contact");
          return { ...sale.toObject(), buyer: customer };
        } else {
          const business = await mongoose.model("Business").findById(sale.buyer).select("businessName contact location ownerImage");
          return { ...sale.toObject(), buyer: business };
        }
      })
    );

    res.status(200).json(populatedSales);
  } catch (error) {
    console.error("Error fetching sale orders:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


// Get Purchase Orders (orders where the logged-in user is the buyer)
const getPurchaseOrders = async (req, res) => {
  try {
    const businessId = req.user.id; // Logged-in user's business ID
    console.log("Inside getPurchaseOrders");

    if (!businessId) {
      return res.status(403).json({ message: "Invalid business ID" });
    }

    // Find purchase orders for the logged-in business
    const purchases = await Purchase.find({ buyer: businessId })
      .populate({
        path: "seller",
        select: "businessName contact location ownerImage", // Populate seller details
      })
      .populate({
        path: "products.product",
        select: "name image_url", // Populate product details
      })
      .sort({ createdAt: -1 }); // Sort by most recent orders

    res.status(200).json(purchases);
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// Get a specific order by ID (handles both Sale and Purchase)
const getOrderById = async (req, res) => {
  try {
    const businessId = req.user.id; // Logged-in user's business ID
    const orderId = req.params.orderId; // Get the order ID from the route parameter

    // Validate order ID
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    // First, check if the order exists in the Sale table
    let order = await Sale.findOne({ _id: orderId })
      .populate({
        path: "products.product",
        select: "name image_url description cgst sgst gst", // Populate product details
      })
      .populate({
        path: "seller",
        select: "businessName contact location gstin ownerName", // Populate seller details
      });

    if (order) {
      if (order.buyerType === "Customer") {
        const customer = await mongoose.model("Customer").findById(order.buyer).select("name contact");
        order = { ...order.toObject(), buyer: customer };
      } else {
        const business = await mongoose.model("Business").findById(order.buyer).select("businessName contact location gstin ownerName");
        order = { ...order.toObject(), buyer: business };
      }
      return res.status(200).json(order);
    }

    if (!order) {
      // If not found in Sale, check in Purchase
      order = await Purchase.findOne({ _id: orderId })
        .populate({
          path: "seller",
          select: "businessName contact email location", // Populate seller details
        })
        .populate({
          path: "products.product",
          select: "name  image_url description  cgst sgst gst", // Populate product details
        })
        .populate({
          path: "buyer",
          select: "businessName contact location gstin ownerName", // Populate buyer details
        });

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
    }

    res.status(200).json(order);
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

const getDraftOrderDetails = async (req, res) => {
  try {
      const { orderId } = req.params;
      const businessId = req.user.id;
      // Validate order ID
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
          return res.status(400).json({ message: "Invalid order ID" });
      }

      const order = await Order.findById(orderId)
          .populate({
              path: "business",
              select: "businessName contact location gstin ownerName businessImage" // Populate business details
          })
          .populate({
              path: "customer",
              select: "businessName contact location gstin ownerName businessImage" // Populate customer details
          })
          .populate({
              path: "products.product",
              select: "name image_url description unit cgst sgst gst" // Populate product details
          });

      if (!order) {
          return res.status(404).json({ message: "Order not found" });
      }

      res.status(200).json({order:order, b_id: businessId});
  } catch (error) {
      console.error("Error fetching order details:", error);
      res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// Update order details by ID (from the Order model)
const updateDraftOrderDetails = async (req, res) => {
  try {
      const { orderId } = req.params;
      const { products } = req.body; // Assuming you only want to update products
      console.log("Inside updateDraftOrderDetails");
      console.log("Products: ", products);
      // Validate order ID
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
          return res.status(400).json({ message: "Invalid order ID" });
      }

      // Validate products data (ensure it's an array)
      if (!Array.isArray(products)) {
          return res.status(400).json({ message: "Invalid products data" });
      }

      // Validate product structure
      for (const product of products) {
          if (!product.product || !mongoose.Types.ObjectId.isValid(product.product) || typeof product.quantity !== 'number') {
              return res.status(400).json({ message: "Invalid product data" });
          }
      }

      // Update the order
      const updatedOrder = await Order.findByIdAndUpdate(
          orderId,
          { products: products },
          { new: true, runValidators: true } // Return the updated document and run validators
      ).populate({
        path: "products.product",
        select: "name image_url description unit  cgst sgst gst" // Populate product details
    });

      if (!updatedOrder) {
          return res.status(404).json({ message: "Order not found" });
      }
    const cstmr = await Business.findById(updatedOrder.customer).lean();
    console.log("Updated Order: ", updatedOrder);

    const cus = await Customer.findOne({ 
      name: cstmr.businessName,
      business: updatedOrder.business
    }).lean();
    console.log("Customer: ", cus);
    if (cus) {
    const now = new Date();
    const effectiveDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('');

    // Bulk update personalized prices
    const bulkOps = updatedOrder.products.map(productEntry => ({
      updateOne: {
        filter: {
          business: updatedOrder.business,
          customer: cus._id,
          product: productEntry.product._id
        },
        update: {
          $set: {
            price: productEntry.price,
            effective_date: effectiveDate
          }
        },
        upsert: true
      }
    }));

    await PersonalizedPrice.bulkWrite(bulkOps); // Single database call to update all prices
  } else {
    console.log("Customer not found");
  }
    res.status(200).json({ message: "Order updated successfully", data: updatedOrder });
  } catch (error) {
      console.error("Error updating order details:", error);
      res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

const placeOrderFromProofRead = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId } = req.body;

    // Find the order in the Order model
    const order = await Order.findById(orderId)
      .populate("business")
      .populate("customer")
      .populate("products.product");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const { business, customer, products, totalAmount } = order;

    // Create a Sale record for the seller
    const newSale = new Sale({
      seller: business._id,
      buyer: customer._id,
      buyerType: "Business", // Assuming buyer is always a business
      products: products.map((item) => ({
        product: item.product._id,
        quantity: item.quantity,
        price: item.price,
      })),
      totalAmount: totalAmount,
      status: "Paid",
      transactionType: "Online",
      paymentMethod: "UPI",
    });

    await newSale.save({ session });

    // Create a Purchase record for the buyer
    const newPurchase = new Purchase({
      seller: business._id,
      buyer: customer._id,
      products: products.map((item) => ({
        product: item.product._id,
        quantity: item.quantity,
        price: item.price,
      })),
      totalAmount: totalAmount,
      status: "Paid",
      transactionType: "Online",
      paymentMethod: "UPI",
    });

    await newPurchase.save({ session });

    // Delete the order from the Order model
    const notification = await Notification.findOneAndUpdate(
      { order: orderId },
      {
        $set: {
          initiator: business._id,  // Original seller becomes initiator
          recipient: customer._id,  // Original buyer becomes recipient
          type: "ORDER_CONFIRMED",
          order: newPurchase._id,
          orderType: "Purchase",  // Reference to Purchase record
          isRead: false,
        }
      },
      { new: true, session }
    );

    // Delete original draft order
    await Order.findByIdAndDelete(orderId, { session });



    await session.commitTransaction();
    session.endSession();
    console.log("Sales Order ID", newSale._id);
    res.status(201).json({ message: "Order placed successfully", saleId: newSale._id, purId: newPurchase._id });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error placing order:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


module.exports = {
  getSaleOrders,
  getPurchaseOrders,
  getOrderById,
  updateDraftOrderDetails,
  getDraftOrderDetails,
  placeOrderFromProofRead,
};
