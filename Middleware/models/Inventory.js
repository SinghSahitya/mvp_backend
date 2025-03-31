const mongoose = require('mongoose');

// Define the schema
const inventorySchema = new mongoose.Schema({
    name : {  type:String, required:true  },
    qty : {type: Number, required:true },
    gen_price : {type: Number, required:true },
    unit: { type: String, required: false},
    image_url : {type:String, required:false},
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
}, { timestamps: true });

// Create the model
const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;