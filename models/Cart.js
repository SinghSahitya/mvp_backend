const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema(
  {
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true, // The business that owns the cart
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: false, // Optional: only relevant if there are items in the cart
    },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true }
);

const Cart = mongoose.model("Cart", cartSchema);

module.exports = Cart;
