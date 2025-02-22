require('dotenv').config();
const Customer = require("../models/Customer");
const Business  = require("../models/Business");
const Inventory = require("../models/Inventory");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Invoice = require("../models/Invoice");
const mongoose = require("mongoose");
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts  } = require('pdf-lib');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const FormData = require('form-data');
const PersonalizedPrice = require("../models/PersonalizedPrice");

const PCLOUD_USERNAME = process.env.PCLOUD_USERNAME;
const PCLOUD_PASSWORD = process.env.PCLOUD_PASSWORD;

async function authenticateWithPCloud() {
  const response = await axios.get('https://api.pcloud.com/userinfo', {
    params: {
      getauth: 1,
      username: PCLOUD_USERNAME,
      password: PCLOUD_PASSWORD,
    },
  });

  if (response.data.result === 0) {
    return response.data.auth;
  } else {
    throw new Error('Authentication failed: ' + response.data.error);
  }
}

// Function to upload a file to pCloud
async function uploadFileToPCloud(authToken, filePath) {
  const formData = new FormData();
  formData.append('auth', authToken);
  formData.append('filename', fs.createReadStream(filePath));

  const response = await axios.post('https://api.pcloud.com/uploadfile', formData, {
    headers: formData.getHeaders(),
  });

  if (response.data.result === 0) {
    return response.data.metadata[0].fileid; // Get the file ID of the uploaded file
  } else {
    throw new Error('File upload failed: ' + response.data.error);
  }
}

// Function to generate a public link for the uploaded file
async function generatePublicLink(authToken, fileid) {
  const response = await axios.get('https://api.pcloud.com/getfilepublink', {
    params: {
      auth: authToken,
      fileid: fileid,
    },
  });

  if (response.data.result === 0) {
    return response.data.link; // The public link for the file
  } else {
    throw new Error('Failed to generate public link: ' + response.data.error);
  }
}

const searchCustomers = async (req, res) => {
  try {
    const businessId = req.user.id;
    const searchTerm = req.query.name || "";
    
    if (!businessId) {
      return res.status(403).json({ message: "Invalid business ID" });
    }

    const businessObjectId = new mongoose.Types.ObjectId(businessId);
    
    // Create dynamic regex pattern that matches any occurrence of the search term
    const searchRegex = new RegExp(searchTerm.split('').join('.*'), 'i');

    // Fetch data from both sources in parallel
    const [sales, directCustomers] = await Promise.all([
      Sale.find({ seller: businessObjectId })
        .populate({
          path: "buyer",
          select: "name contact address",
          match: { 
            name: { $regex: searchRegex } 
          }
        }),
      Customer.find({
        business: businessObjectId,
        name: { $regex: searchRegex }
      }).select('name contact address')
    ]);

    // Process sales buyers
    const salesBuyers = sales
      .map(sale => sale.buyer)
      .filter(buyer => buyer !== null && buyer !== undefined);

    // Merge and deduplicate
    const uniqueBuyers = {};

    // Add direct customers first
    directCustomers.forEach(customer => {
      uniqueBuyers[customer._id] = {
        _id: customer._id,
        name: customer.name,
        contact: customer.contact,
        address: customer.address
      };
    });

    // Add sales buyers without overriding
    salesBuyers.forEach(buyer => {
      if (!uniqueBuyers[buyer._id]) {
        uniqueBuyers[buyer._id] = {
          _id: buyer._id,
          name: buyer.name,
          contact: buyer.contact,
          address: buyer.address
        };
      }
    });

    // Convert to array and sort by name
    const results = Object.values(uniqueBuyers).sort((a, b) => 
      a.name.localeCompare(b.name)
    );

    res.status(200).json(results);

  } catch (error) {
    console.error("Error searching customers:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


// Add a new customer
const addCustomer = async (req, res) => {
    try {
      const { name } = req.body;
      const businessId = req.user.id;
      console.log("Inside Add Customer");
      if (!businessId || !name) {
        return res.status(400).json({ message: "Business ID and customer name are required" });
      }
  
      // Create a new customer
      const newCustomer = new Customer({
        business: businessId,
        name,
      });
  
      const savedCustomer = await newCustomer.save();
  
      // Update the Business model to include the new customer
      await Business.findByIdAndUpdate(
        businessId,
        { $push: { customers: savedCustomer._id } },
        { new: true }
      );
  
      res.status(201).json(savedCustomer);
    } catch (error) {
      console.error("Error adding customer:", error);
      res.status(500).json({ message: "Internal server error", error: error.message });
    }
  };
  

// Search for products in the logged-in business's inventory
const searchProducts = async (req, res) => {
  try {
    const businessId = req.user.id;
    const searchTerm = req.query.name || "";
    const cusName = req.query.customerName || "";

    if (!businessId) {
      return res.status(403).json({ message: "Invalid business ID" });
    }

    const businessAccount = new mongoose.Types.ObjectId(businessId);
    console.log("CusName:", cusName);
    // Find customer if name provided
    let priceMap = new Map();
    if (cusName) {
      const cus = await Customer.findOne({ 
        name: cusName,
        business: businessAccount
      }).select('_id').lean();
      console.log("Customer:", cus);
      if (cus) {
        // Get all personalized prices in single query
        const personalizedPrices = await PersonalizedPrice.find({
          customer: cus._id,
          business: businessAccount
        }).select('product price').lean();

        // Create productID -> price map
        priceMap = new Map(
          personalizedPrices.map(pp => [
            pp.product.toString(), 
            pp.price
          ])
        );
      }
    }

    // Find products with search filter
    const products = await Inventory.find({
      business: businessAccount,
      name: { $regex: searchTerm, $options: "i" },
      $or: [
        { gen_price: { $exists: true } },
        { price: { $exists: true } }
      ]
    }).select("name qty gen_price price image_url _id").lean();

    // Process prices with fallback
    const processedProducts = products.map(product => ({
      ...product,
      price: priceMap.get(product._id.toString()) || 
            product.gen_price || 
            product.price
    })).filter(product => product.price !== undefined);

    res.status(200).json(processedProducts);

  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


// Place an order
const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("Inside create order");
    const businessId = req.user.id; // Logged-in user's business ID
    const { customerId, products, transactionType, status, paymentMethod } = req.body;

    console.log("Products:", products);

    if (!businessId || !customerId || !products || !transactionType || !status || !paymentMethod) {
      return res.status(400).json({
        message: "Business ID, customer ID, products, transaction type, status, and payment method are required",
      });
    }

    const productDetails = products.map(product => ({
      product: product.productId,
      quantity: product.quantity,
      price: product.price,
    }));
    console.log("Product Details:", productDetails);
    // Determine if the buyer is a Business or Customer
    const buyerType = await Business.findById(customerId) ? "Business" : "Customer";

    // Create Sale
    const newSale = new Sale({
      seller: businessId,
      buyer: customerId,
      buyerType,
      products: productDetails,
      transactionType,
      status,
      paymentMethod,
    });

    const savedSale = await newSale.save({ session });
    console.log("Saved Sale:", savedSale);
    // Update the seller's Business model with the new Sale
    await Business.findByIdAndUpdate(
      businessId,
      { $push: { sales: savedSale._id } },
      { new: true, session }
    );

    let purId = null;
    // If the buyer is a Business, create a corresponding Purchase record
    if (buyerType === "Business") {
      const newPurchase = new Purchase({
        buyer: customerId,
        seller: businessId,
        products: productDetails,
        transactionType,
        status,
        paymentMethod,
      });

      const savedPurchase = await newPurchase.save({ session });
      console.log("Saved Purchase:", savedPurchase);
      purId = savedPurchase._id;
      // Update the buyer's Business model with the new Purchase
      await Business.findByIdAndUpdate(
        customerId,
        { $push: { purchases: savedPurchase._id } },
        { new: true, session }
      );
    }
    let finalCustomerId = customerId;
    if (buyerType === "Business") {
      const buyerBusiness = await Business.findById(customerId).session(session);
      const newCustomer = new Customer({
        name: buyerBusiness.businessName,
        business: businessId,
        contact: buyerBusiness.contact,
        address: buyerBusiness.location
      });
      
      const savedCustomer = await newCustomer.save({ session });
      finalCustomerId = savedCustomer._id;
    }

    const effectiveDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const bulkOps = productDetails.map(product => ({
      updateOne: {
        filter: {
          business: businessId,
          customer: finalCustomerId,
          product: product.product
        },
        update: {
          $set: {
            price: product.price,
            effective_date: effectiveDate
          }
        },
        upsert: true
      }
    }));

    await PersonalizedPrice.bulkWrite(bulkOps, { session });
    console.log("Saved Personalized Prices");
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(201).json({ message: "Order created successfully", order: savedSale, saleId: savedSale._id, purId:purId });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating order:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
  };

 
const generateMemoPDF = async (req, res) => {
  try {
    const { customerName, items } = req.body;
    if (!customerName || !items || items.length === 0) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Fetch business details
    const businessId = req.user.id;
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }
    const { businessName, location, gstin } = business;
    const invoiceId = `#${uuidv4().slice(0, 8).toUpperCase()}`;
    const currentDate = new Date().toLocaleDateString("en-GB"); // DD/MM/YYYY format

    // Create a new PDF document (A4 dimensions: 595 x 842 points)
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();

    // Embed fonts
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Colors
    const darkGreen = rgb(0.1, 0.5, 0.1);
    const lightGreen = rgb(0.9, 1, 0.9);

    // Add green header
    page.drawRectangle({
      x: 0,
      y: height - 100,
      width: width,
      height: 100,
      color: darkGreen,
    });

    // Business details in the header (top left)
    let yPosition = height - 60;
    page.drawText(businessName, {
      x: 40,
      y: yPosition,
      size: 24,
      font: boldFont,
      color: rgb(1, 1, 1)
    });
    yPosition -= 20;
    page.drawText(location, {
      x: 40,
      y: yPosition,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1)
    });
    yPosition -= 15;
    page.drawText(`GSTIN: ${gstin}`, {
      x: 40,
      y: yPosition,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1)
    });

    // Invoice metadata on the top right side
    let metaY = height - 60;
    page.drawText(`INVOICE`, {
      x: width - 150,
      y: metaY,
      size: 24,
      font: boldFont,
      color: rgb(1, 1, 1)
    });
    metaY -= 20;
    page.drawText(`Invoice ID: ${invoiceId}`, {
      x: width - 150,
      y: metaY,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1)
    });
    metaY -= 15;
    page.drawText(`Date: ${currentDate}`, {
      x: width - 150,
      y: metaY,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1)
    });

    // Invoice To section
    let sectionY = height - 150;
    page.drawText("INVOICE TO", {
      x: 40,
      y: sectionY,
      size: 12,
      font: boldFont,
      color: darkGreen
    });
    sectionY -= 20;
    page.drawText(customerName, {
      x: 40,
      y: sectionY,
      size: 10,
      font: regularFont,
      color: rgb(0, 0, 0)
    });

    // Table header for the ordered items
    let tableY = sectionY - 40;
    const colPositions = {
      product: 40,
      price: 250,
      quantity: 350,
      total: 450
    };

    // Draw table header background
    page.drawRectangle({
      x: 30,
      y: tableY - 5,
      width: width - 60,
      height: 25,
      color: lightGreen,
    });

    page.drawText("PRODUCT", {
      x: colPositions.product,
      y: tableY,
      size: 10,
      font: boldFont,
      color: darkGreen
    });
    page.drawText("PRICE", {
      x: colPositions.price,
      y: tableY,
      size: 10,
      font: boldFont,
      color: darkGreen
    });
    page.drawText("QTY", {
      x: colPositions.quantity,
      y: tableY,
      size: 10,
      font: boldFont,
      color: darkGreen
    });
    page.drawText("TOTAL", {
      x: colPositions.total,
      y: tableY,
      size: 10,
      font: boldFont,
      color: darkGreen
    });

    // Populate the table with item rows and calculate total amount
    tableY -= 30;
    let totalAmount = 0;
    items.forEach((item, index) => {
      const { productName, quantity, price } = item;
      const itemTotal = price * quantity;
      totalAmount += itemTotal;

      // Alternate row background
      if (index % 2 !== 0) {
        page.drawRectangle({
          x: 30,
          y: tableY - 5,
          width: width - 60,
          height: 25,
          color: lightGreen,
        });
      }

      page.drawText(productName, {
        x: colPositions.product,
        y: tableY,
        size: 10,
        font: regularFont,
        color: rgb(0, 0, 0)
      });
      page.drawText(price.toFixed(2), {
        x: colPositions.price,
        y: tableY,
        size: 10,
        font: regularFont,
        color: rgb(0, 0, 0)
      });
      page.drawText(quantity.toString(), {
        x: colPositions.quantity,
        y: tableY,
        size: 10,
        font: regularFont,
        color: rgb(0, 0, 0)
      });
      page.drawText(itemTotal.toFixed(2), {
        x: colPositions.total,
        y: tableY,
        size: 10,
        font: regularFont,
        color: rgb(0, 0, 0)
      });
      tableY -= 25;
    });

    // Draw a summary line and display the total amount
    tableY -= 10;
    page.drawLine({
      start: { x: 30, y: tableY },
      end: { x: width - 30, y: tableY },
      thickness: 1,
      color: darkGreen
    });
    tableY -= 20;
    page.drawText("TOTAL", {
      x: colPositions.quantity,
      y: tableY,
      size: 12,
      font: boldFont,
      color: darkGreen
    });
    page.drawText(totalAmount.toFixed(2), {
      x: colPositions.total,
      y: tableY,
      size: 12,
      font: boldFont,
      color: darkGreen
    });

    // Serialize the PDF and write it as a file
    const pdfBytes = await pdfDoc.save();
    const fileName = `${invoiceId}.pdf`.replace(/\s+/g, "_");
    const savePath = path.resolve(__dirname, `../invoices/${fileName}`);
    fs.writeFileSync(savePath, pdfBytes);
    console.log('PDF saved locally at:', savePath);

    const authToken = await authenticateWithPCloud();
    console.log(authToken);
    const fileid = await uploadFileToPCloud(authToken, savePath);
    console.log(fileid);
    const publicLink = await generatePublicLink(authToken, fileid);
    console.log('Public Link:', publicLink);

    res.status(200).json({ message: "File generated successfully", fileName });
  } catch (error) {
    console.error("Error generating invoice PDF:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};
  

const generateInvoiceByOrderId = async (req, res) => {
  try {
  // Get the order id from the route parameters or request body.
  const orderId = req.params.orderId || req.body.orderId;
  const purchaseId = req.body.pur_orderId || null;
  console.log(orderId);
  if (!orderId) {
  return res.status(400).json({ message: "Order ID is required" });
  }
  
  
  // Find the Sale record and populate the buyer, seller, and product details.
  const sale = await Sale.findById(orderId)
    .populate("buyer")       // Assuming "buyer" is a referenced Customer or Business
    .populate("seller")      // Assuming "seller" is referenced in Business model
    .populate("products.product");  // Assuming each sale.products item has a "product" ref
  console.log(sale);
  if (!sale) {
    return res.status(404).json({ message: "Sale/Order not found" });
  }
  
  // Retrieve business details from the seller.
  const business = sale.seller;
  if (!business) {
    return res.status(404).json({ message: "Seller/Business not found" });
  }
  const { businessName, location, gstin } = business;
  
  // Use buyer details for invoice recipient.
  const customerName = sale.buyer && sale.buyer.businessName ? sale.buyer.businessName : sale.buyer.name;
  
  // Map sale.products to an "items" array required for the PDF.
  // Ensure that each item has productName, quantity, and price.
  const items = sale.products.map((item) => {
    return {
      productName: item.product && item.product.name ? item.product.name : "Product",
      quantity: item.quantity,
      price: item.product && item.price ? item.price : 0,
    };
  });
  console.log(items);
  // Generate a unique invoice id.
  const invoiceId = `#${uuidv4().slice(0, 8).toUpperCase()}`;
  const currentDate = new Date().toLocaleDateString("en-GB"); // DD/MM/YYYY format
  
  // Create a new PDF document (A4: 595 x 842 points)
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595][842]);
  const { width, height } = page.getSize();
  
  // Embed fonts
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Define colors
  const darkGreen = rgb(0.1, 0.5, 0.1);
  const lightGreen = rgb(0.9, 1, 0.9);
  
  // Green header
  page.drawRectangle({
    x: 0,
    y: height - 100,
    width: width,
    height: 100,
    color: darkGreen,
  });
  
  // Business details in header (top left)
  let yPosition = height - 60;
  page.drawText(businessName, {
    x: 40,
    y: yPosition,
    size: 24,
    font: boldFont,
    color: rgb(1, 1, 1),
  });
  yPosition -= 20;
  page.drawText(location, {
    x: 40,
    y: yPosition,
    size: 10,
    font: regularFont,
    color: rgb(1, 1, 1),
  });
  yPosition -= 15;
  page.drawText(`GSTIN: ${gstin}`, {
    x: 40,
    y: yPosition,
    size: 10,
    font: regularFont,
    color: rgb(1, 1, 1),
  });
  
  // Invoice metadata on the top right
  let metaY = height - 60;
  page.drawText("INVOICE", {
    x: width - 150,
    y: metaY,
    size: 24,
    font: boldFont,
    color: rgb(1, 1, 1),
  });
  metaY -= 20;
  page.drawText(`Invoice ID: ${invoiceId}`, {
    x: width - 150,
    y: metaY,
    size: 10,
    font: regularFont,
    color: rgb(1, 1, 1),
  });
  metaY -= 15;
  page.drawText(`Date: ${currentDate}`, {
    x: width - 150,
    y: metaY,
    size: 10,
    font: regularFont,
    color: rgb(1, 1, 1),
  });
  
  // "Invoice To" section
  let sectionY = height - 150;
  page.drawText("INVOICE TO", {
    x: 40,
    y: sectionY,
    size: 12,
    font: boldFont,
    color: darkGreen,
  });
  sectionY -= 20;
  page.drawText(customerName, {
    x: 40,
    y: sectionY,
    size: 10,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  
  // Table header for items.
  let tableY = sectionY - 40;
  const colPositions = {
    product: 40,
    price: 250,
    quantity: 350,
    total: 450,
  };
  
  // Draw a rectangle for table header background.
  page.drawRectangle({
    x: 30,
    y: tableY - 5,
    width: width - 60,
    height: 25,
    color: lightGreen,
  });
  page.drawText("PRODUCT", {
    x: colPositions.product,
    y: tableY,
    size: 10,
    font: boldFont,
    color: darkGreen,
  });
  page.drawText("PRICE", {
    x: colPositions.price,
    y: tableY,
    size: 10,
    font: boldFont,
    color: darkGreen,
  });
  page.drawText("QTY", {
    x: colPositions.quantity,
    y: tableY,
    size: 10,
    font: boldFont,
    color: darkGreen,
  });
  page.drawText("TOTAL", {
    x: colPositions.total,
    y: tableY,
    size: 10,
    font: boldFont,
    color: darkGreen,
  });
  
  // Populate table rows with each product’s details.
  tableY -= 30;
  let totalAmount = 0;
  items.forEach((item, index) => {
    const { productName, quantity, price } = item;
    const itemTotal = price * quantity;
    totalAmount += itemTotal;
    
    // Alternate row background
    if (index % 2 !== 0) {
      page.drawRectangle({
        x: 30,
        y: tableY - 5,
        width: width - 60,
        height: 25,
        color: lightGreen,
      });
    }
    page.drawText(productName, {
      x: colPositions.product,
      y: tableY,
      size: 10,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    page.drawText(price.toFixed(2), {
      x: colPositions.price,
      y: tableY,
      size: 10,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    page.drawText(quantity.toString(), {
      x: colPositions.quantity,
      y: tableY,
      size: 10,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    page.drawText(itemTotal.toFixed(2), {
      x: colPositions.total,
      y: tableY,
      size: 10,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    tableY -= 25;
  });
  
  // Summary line and total amount.
  tableY -= 10;
  page.drawLine({
    start: { x: 30, y: tableY },
    end: { x: width - 30, y: tableY },
    thickness: 1,
    color: darkGreen,
  });
  tableY -= 20;
  page.drawText("TOTAL", {
    x: colPositions.quantity,
    y: tableY,
    size: 12,
    font: boldFont,
    color: darkGreen,
  });
  page.drawText(totalAmount.toFixed(2), {
    x: colPositions.total,
    y: tableY,
    size: 12,
    font: boldFont,
    color: darkGreen,
  });
  console.log("GENERATING PDF");
  // Serialize PDF and write to a local file.
  const pdfBytes = await pdfDoc.save();
  const fileName = `${invoiceId}.pdf`.replace(/\s+/g, "_");
  const savePath = path.resolve(__dirname, `../invoices/${fileName}`);
  fs.writeFileSync(savePath, pdfBytes);
  console.log("PDF saved locally at:", savePath);
  
  // Upload the PDF to pCloud.
  const authToken = await authenticateWithPCloud();
  const fileid = await uploadFileToPCloud(authToken, savePath);
  const publicLink = await generatePublicLink(authToken, fileid);
  console.log("Public Link:", publicLink);
  
  // Delete the local file after upload.
  fs.unlinkSync(savePath);
  console.log("Local PDF deleted:", savePath);
  
  // Create the Invoice document using the provided schema.
  const invoiceData = {
    sale_orderId: orderId,
    purchase_orderId: purchaseId,  // provided order id
    invoiceId: invoiceId,
    invoiceLink: publicLink,
  };
  
  const newInvoice = await Invoice.create(invoiceData);
  
  // Return a success response with the created invoice details.
  res.status(200).json({
    message: "Invoice generated and uploaded successfully",
    invoice: newInvoice,
  });
  } catch (error) {
  console.error("Error generating invoice from order:", error);
  res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

const getInvoiceUrlByOrderId = async (req, res) => {
  try {
  // We expect the order id to be provided as a URL parameter (e.g. GET /api/invoice/:orderId)
  const id  = req.body.id;
  console.log("Backedn ORderID: ", id);
  console.log(req.body.id);
  if (!id) {
  return res.status(400).json({ message: "Order ID is required" });
  }
  // Look up the invoice document by orderId
  const invoice = await Invoice.findOne({
    $or: [
      { sale_orderId: id },
      { purchase_orderId: id } // Use this if you store it in a second field
    ]
  });
  if (!invoice) {
    console.log("Invoice not found for order id: " + id);
    return res.status(404).json({ message: "Invoice not found for order id: " + id });
  }
  console.log(invoice);
  // Return the invoice URL (and optionally other fields)
  return res.status(200).json({ 
    invoiceUrl: invoice.invoiceLink,
    invoiceId: invoice.invoiceId
  });
  } catch (error) {
  console.error("Error retrieving invoice:", error);
  return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

module.exports = {
  searchCustomers,
  addCustomer,
  searchProducts,
  createOrder,
  generateMemoPDF,
  generateInvoiceByOrderId,
  getInvoiceUrlByOrderId
};
