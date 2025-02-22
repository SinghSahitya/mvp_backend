const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // Customer name
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true }, // The business that owns this customer
    contact: { type: String, required: false },
    address: { type: String, required: false },
  },
  { timestamps: true }
);

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
