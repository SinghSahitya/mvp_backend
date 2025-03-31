const mongoose = require('mongoose');

// Define the schema
const expenseSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    party_name : {  type:String, required:true  },
    effective_date : {  type:String, required:true  },
    stock_item_name : {  type:String, required:true  },
    rate : {  type:String, required:true  },
    quantity : {  type:String, required:true  },
    unit : {  type:String, required:true  },
}, { timestamps: true });

// Create the model
const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;