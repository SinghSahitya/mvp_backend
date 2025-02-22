const mongoose = require('mongoose');

// Define the schema
const notifSchema = new mongoose.Schema({
    initiator: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true }, 
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true }, 
    order: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      refPath: 'orderType' // Use refPath instead of ref
    },
    orderType: {
      type: String,
      enum: ["Order", "Purchase"],
      required: function() { return this.order != null }
    },
    type: {
      type: String,
      enum: ["ORDER_RECEIVED", "ORDER_UPDATE", "ORDER_CONFIRMED", "ORDER_REJECTED"],
      required: true
    },
    isRead: { 
      type: Boolean, 
      default: false 
    },
  },
  { timestamps: true }
);

// Create the model
const Notification = mongoose.model('Notification', notifSchema);

module.exports = Notification;