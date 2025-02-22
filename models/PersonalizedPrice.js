const mongoose = require('mongoose');

// Define the schema
const personalizedPriceSchema = new mongoose.Schema({
    business: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business',
        required: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: true
    },
    effective_date : {  type:String, required:true  },
    price: {
        type: Number,
        required: true,
        min: 0
    }
}, { timestamps: true });

// Create the model
const PersonalizedPrice = mongoose.model('PersonalizedPrice', personalizedPriceSchema);

module.exports = PersonalizedPrice;