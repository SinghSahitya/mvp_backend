const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    products: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
      },
    ],
    transactionType: { type: String, enum: ["Online", "Offline"], required: false },
    status: { type: String, enum: ["Paid", "Unpaid"], required: false },
    paymentMethod: {
      type: String,
      enum: ["UPI", "Cash", "Bank Transfer", "Credit"],
      required: function () {
        return this.status === "Paid";
      },
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
