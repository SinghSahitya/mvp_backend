const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema(
  {
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true }, // The business making the purchase
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    products: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
      },
    ],
    transactionType: { type: String, enum: ['Online', 'Offline'], required: true },
    status: { type: String, enum: ['Paid', 'Unpaid'], required: true },
    paymentMethod: {
      type: String,
      enum: ['UPI', 'Cash', 'Bank Transfer', 'Credit'],
      required: function () {
        return this.status === 'Paid';
      },
    },
  },
  { timestamps: true }
);

const Purchase = mongoose.model('Purchase', purchaseSchema);

module.exports = Purchase;
