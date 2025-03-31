const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    buyer: { 
      type: mongoose.Schema.Types.ObjectId,
      refPath: "buyerType", // Dynamic reference
      required: true,
    },
    buyerType: { 
      type: String,
      enum: ["Business", "Customer"], // Can be a registered business or a manually added customer
      required: true,
    },
    products: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
      },
    ],
    transactionType: { type: String, enum: ["Online", "Offline"], required: true },
    status: { type: String, enum: ["Paid", "Unpaid"], required: true },
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

const Sale = mongoose.model("Sale", saleSchema);

module.exports = Sale;
