const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
    gstin: { type: String, required: true },
    businessName: { type: String, required: true },
    ownerName: { type: String, required: true },
    contact: { type: String, required: true },
    ownerImage: { type: String, required: false },
    location: { type: String, required: true },
    businessImage: { type: String, required: false },
    refreshToken: { type: String, required: false },
    inventory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: false,
    },
    businessType: { type: String, required: false },
    report: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Report',
        required: false,
    },
    customers: [
        {
            customerId: {
                type: mongoose.Schema.Types.ObjectId,
                refPath: 'customers.customerType', // Dynamic reference to 'Customer' or 'Business'
            },
            customerType: {
                type: String,
                enum: ['Customer', 'Business'], // Can be a manually added customer or registered business
            },
            addedAt: { type: Date, default: Date.now }, // To track when the customer was added
        },
    ],
    sales: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Sale', // Reference to Sale table
        },
    ],
    purchases: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Purchase', // Reference to Purchase table
        },
    ],
    expenses: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expense',
        required: false,
    },
    createdAt: { type: Date, default: Date.now },
});

const Business = mongoose.model('Business', businessSchema);

module.exports = Business;
