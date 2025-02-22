const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const Inventory = require("../models/Inventory");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Business = require("../models/Business");


// Get the cart for the logged-in business
const getCart = async (req, res) => {
  console.log("Fetching cart - Start");
  try {
    console.log("Fetching cart - Start");
    const businessId = req.user.id; // Get the logged-in user's business ID
    console.log("Business ID:", businessId);
    // Find the cart for the logged-in business
    const cart = await Cart.findOne({ buyer: businessId })
      .populate({
        path: "items.product",
        select: "name image_url description", // Populate product details
      })
      .populate({
        path: "seller",
        select: "businessName ownerName contact location ownerImage businessImage gstin", // Populate seller details
      });

    if (!cart) {
      console.log("Cart fetched successfully!");
      return res.status(200).json({ message: "Cart is empty", items: [] });
    }
    console.log("Cart fetched successfully!", cart);
    res.status(200).json(cart);
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// cartController.js
const isCartEmpty = async (req, res) => {
  try {
    console.log("Checking cart status - Start");
    
    if (!req.user?.id) {
      console.error("No user ID in request");
      return res.status(400).json({ message: "User not authenticated" });
    }

    const businessId = req.user.id;
    console.log("Business ID:", businessId);

    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      console.error("Invalid business ID format:", businessId);
      return res.status(400).json({ message: "Invalid business ID" });
    }

    const cart = await Cart.findOne({ buyer: businessId })
      .select('items')
      .lean();

    console.log("Cart query result:", cart);
    
    const isEmpty = !cart || cart.items.length === 0;
    res.status(200).json({ empty: isEmpty });

  } catch (error) {
    console.error("Error in isCartEmpty:", {
      message: error.message,
      stack: error.stack,
      request: {
        headers: req.headers,
        user: req.user,
        params: req.params,
        body: req.body
      }
    });
    res.status(500).json({ 
      message: "Internal server error",
      error: error.message 
    });
  }
};

// Add a product to the cart
const addProductToCart = async (req, res) => {
  try {
    const businessId = req.user.id; // Get the logged-in user's business ID
    const { productId, quantity, price } = req.body; // Get product ID and quantity from request body
    console.log("Add product to cart called");
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    if (quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be greater than 0" });
    }

    // Check if the product exists
    const product = await Inventory.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if a cart already exists for the business
    let cart = await Cart.findOne({ buyer: businessId });

    if (!cart) {
      // Create a new cart if it doesn't exist
      cart = new Cart({
        buyer: businessId,
        seller: product.business, // Assuming `business` field in `Inventory` represents the seller
        items: [],
      });
    }

    // Check if the product is already in the cart
    const itemIndex = cart.items.findIndex((item) => item.product.toString() === productId);

    if (itemIndex > -1) {
      // Update the quantity if the product is already in the cart
      cart.items[itemIndex].quantity = quantity;
    } else {
      // Add the new product to the cart
      cart.items.push({ product: productId, quantity, price });
      cart.seller = product.business; // Set the seller
    }

    await cart.save();
    console.log("Product added to cart!");
    res.status(200).json({ message: "Product added to cart", cart });
  } catch (error) {
    console.error("Error adding product to cart:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

const clearCart = async (req, res) => {
  try {
    const businessId = req.user.id;
    console.log("Clear cart called");
    // Find and delete the entire cart
    const deletedCart = await Cart.findOneAndDelete({ 
      buyer: businessId 
    });

    if (!deletedCart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    console.log("Cart cleared!");
    res.status(200).json({ 
      message: "Cart cleared successfully",
      deletedCart
    });
  } catch (error) {
    console.error("Error clearing cart:", error);
    res.status(500).json({ 
      message: "Internal server error", 
      error: error.message 
    });
  }
};


const deleteProductFromCart = async (req, res) => {
  try {
    const businessId = req.user.id;
    const { productId } = req.params;
    console.log("Delete item called");
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const cart = await Cart.findOne({ buyer: businessId });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Find the item in the cart
    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId
    );

    if (itemIndex > -1) {
      // Decrease quantity or remove product
      cart.items[itemIndex].quantity -= 1;

      // Remove product if quantity becomes zero
      if (cart.items[itemIndex].quantity <= 0) {
        cart.items.splice(itemIndex, 1);
      }
    }

    // Remove seller if cart is empty
    if (cart.items.length === 0) {
      cart.seller = null;
    }

    await cart.save();
    console.log("Deleted!");
    res.status(200).json({ 
      message: "Product quantity updated", 
      cart 
    });
  } catch (error) {
    console.error("Error updating product in cart:", error);
    res.status(500).json({ 
      message: "Internal server error", 
      error: error.message 
    });
  }
};
const placeOrderFromCart = async (req, res) => {
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

    // Create a Sale record for the seller
    const newSale = new Sale({
      seller: seller._id,
      buyer: buyerId,
      buyerType: "Business", // Add buyer type explicitly
      products: items.map((item) => ({
        product: item.product._id,
        quantity: item.quantity,
        price: item.price,
      })),
      totalAmount,
      status: "Paid", 
      transactionType: "Online",// Assuming "Paid" for now, update if dynamic
      paymentMethod: "UPI", // Or whatever payment method you use
    });

    await newSale.save({ session });

    // Create a Purchase record for the buyer
    const newPurchase = new Purchase({
      seller: seller._id,
      buyer: buyerId,
      products: items.map((item) => ({
        product: item.product._id,
        quantity: item.quantity,
        price: item.price,
      })),
      totalAmount,
      status: "Paid", 
      transactionType: "Online",// Assuming "Paid" for now, update if dynamic
      paymentMethod: "UPI",
    });

    await newPurchase.save({ session });

    // Clear the cart after placing the order
    await Cart.findOneAndDelete({ buyer: buyerId }, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ message: "Order placed successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error placing order:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


module.exports = {
  getCart,
  addProductToCart,
  deleteProductFromCart,
  placeOrderFromCart,
  clearCart,
  isCartEmpty
};
