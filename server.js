require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const authRoutes = require('./Routes/authRoutes.js'); // Ensure this path is correct
const homeRoutes = require('./Routes/homeRoutes.js'); 
const profileRoutes = require('./Routes/profileRoutes.js');
const businessRoutes = require('./Routes/businessRoutes.js');
const placeOrderRoutes = require('./Routes/placeOrderRoutes.js');
const ordersRoutes = require('./Routes/ordersRoutes.js');
const cartRoutes = require('./Routes/cartRoutes.js');

const callRoutes = require('./Routes/callRoutes.js');
const notifRoutes = require('./Routes/notifRoutes.js');
const inviRoutes = require('./Routes/inventoryRoutes.js')
const app = express();

// MongoDB connection string from environment variables
const mongoURI = process.env.MONGO_DB;

// Connect to MongoDB
mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Middleware
app.use(bodyParser.json()); // Parses incoming JSON requests
app.use(cors()); // Enables Cross-Origin Resource Sharing
app.use(express.json()); // Parses incoming JSON payloads

// Auth routes
app.use("/api/home", homeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/business', businessRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/place-order', placeOrderRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/cart', cartRoutes);

app.use('/api/call', callRoutes);
app.use('/api/notif', notifRoutes);
app.use('/api/invi', inviRoutes);
// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`)
);
