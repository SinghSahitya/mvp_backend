const mongoose = require('mongoose');

// Define the schema
const invoiceSchema = new mongoose.Schema({
    sale_orderId: {
        type: String,
        required: true,
    },
    purchase_orderId: {
        type: String,
        required: false,
    },
    invoiceId: {
        type: String,
        required: true,
    },
    invoiceLink: {
        type: String,
        required: true,
    }
}, { timestamps: true });

// Create the model
const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;