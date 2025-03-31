require("dotenv").config()
const Customer = require("../models/Customer")
const Business = require("../models/Business")
const Inventory = require("../models/Inventory")
const Sale = require("../models/Sale")
const Purchase = require("../models/Purchase")
const Invoice = require("../models/Invoice")
const mongoose = require("mongoose")
const fs = require("fs")
const path = require("path")
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib")
const { v4: uuidv4 } = require("uuid")
const axios = require("axios")
const FormData = require("form-data")
const PersonalizedPrice = require("../models/PersonalizedPrice")
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3")
const { Upload } = require("@aws-sdk/lib-storage")
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner")

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

// Add this function to upload files to S3
async function uploadFileToS3(filePath, fileName) {
  try {
    const fileContent = fs.readFileSync(filePath)

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileName,
        Body: fileContent,
        ContentType: "application/pdf",
      },
    })

    const result = await upload.done()
    console.log("File uploaded successfully to S3:", result.Location)
    return result.Location
  } catch (error) {
    console.error("Error uploading file to S3:", error)
    throw error
  }
}

// Function to generate a pre-signed URL for temporary access
async function generatePresignedUrl(fileName, expirySeconds = 3600) {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileName,
    })

    const url = await getSignedUrl(s3Client, command, { expiresIn: expirySeconds })
    return url
  } catch (error) {
    console.error("Error generating presigned URL:", error)
    throw error
  }
}

const PCLOUD_USERNAME = process.env.PCLOUD_USERNAME
const PCLOUD_PASSWORD = process.env.PCLOUD_PASSWORD

async function authenticateWithPCloud() {
  const response = await axios.get("https://api.pcloud.com/userinfo", {
    params: {
      getauth: 1,
      username: PCLOUD_USERNAME,
      password: PCLOUD_PASSWORD,
    },
  })

  if (response.data.result === 0) {
    return response.data.auth
  } else {
    throw new Error("Authentication failed: " + response.data.error)
  }
}

// Function to upload a file to pCloud
async function uploadFileToPCloud(authToken, filePath) {
  const formData = new FormData()
  formData.append("auth", authToken)
  formData.append("filename", fs.createReadStream(filePath))

  const response = await axios.post("https://api.pcloud.com/uploadfile", formData, {
    headers: formData.getHeaders(),
  })

  if (response.data.result === 0) {
    return response.data.metadata[0].fileid // Get the file ID of the uploaded file
  } else {
    throw new Error("File upload failed: " + response.data.error)
  }
}

// Function to generate a public link for the uploaded file
async function generatePublicLink(authToken, fileid) {
  const response = await axios.get("https://api.pcloud.com/getfilepublink", {
    params: {
      auth: authToken,
      fileid: fileid,
    },
  })

  if (response.data.result === 0) {
    return response.data.link // The public link for the file
  } else {
    throw new Error("Failed to generate public link: " + response.data.error)
  }
}

const searchCustomers = async (req, res) => {
  try {
    const businessId = req.user.id
    const searchTerm = req.query.name || ""

    if (!businessId) {
      return res.status(403).json({ message: "Invalid business ID" })
    }

    const businessObjectId = new mongoose.Types.ObjectId(businessId)

    // Create dynamic regex pattern that matches any occurrence of the search term
    const searchRegex = new RegExp(searchTerm.split("").join(".*"), "i")

    // Fetch data from both sources in parallel
    const [sales, directCustomers] = await Promise.all([
      Sale.find({ seller: businessObjectId }).populate({
        path: "buyer",
        select: "name contact address",
        match: {
          name: { $regex: searchRegex },
        },
      }),
      Customer.find({
        business: businessObjectId,
        name: { $regex: searchRegex },
      }).select("name contact address"),
    ])

    // Process sales buyers
    const salesBuyers = sales.map((sale) => sale.buyer).filter((buyer) => buyer !== null && buyer !== undefined)

    // Merge and deduplicate
    const uniqueBuyers = {}

    // Add direct customers first
    directCustomers.forEach((customer) => {
      uniqueBuyers[customer._id] = {
        _id: customer._id,
        name: customer.name,
        contact: customer.contact,
        address: customer.address,
      }
    })

    // Add sales buyers without overriding
    salesBuyers.forEach((buyer) => {
      if (!uniqueBuyers[buyer._id]) {
        uniqueBuyers[buyer._id] = {
          _id: buyer._id,
          name: buyer.name,
          contact: buyer.contact,
          address: buyer.address,
        }
      }
    })

    // Convert to array and sort by name
    const results = Object.values(uniqueBuyers).sort((a, b) => a.name.localeCompare(b.name))

    res.status(200).json(results)
  } catch (error) {
    console.error("Error searching customers:", error)
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

// Add a new customer
const addCustomer = async (req, res) => {
  try {
    const { name } = req.body
    const businessId = req.user.id
    console.log("Inside Add Customer")
    if (!businessId || !name) {
      return res.status(400).json({ message: "Business ID and customer name are required" })
    }

    // Create a new customer
    const newCustomer = new Customer({
      business: businessId,
      name,
    })

    const savedCustomer = await newCustomer.save()

    // Update the Business model to include the new customer
    await Business.findByIdAndUpdate(businessId, { $push: { customers: savedCustomer._id } }, { new: true })

    res.status(201).json(savedCustomer)
  } catch (error) {
    console.error("Error adding customer:", error)
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

// Search for products in the logged-in business's inventory
const searchProducts = async (req, res) => {
  try {
    const businessId = req.user.id
    const searchTerm = req.query.name || ""
    const cusName = req.query.customerName || ""

    if (!businessId) {
      return res.status(403).json({ message: "Invalid business ID" })
    }

    const businessAccount = new mongoose.Types.ObjectId(businessId)
    console.log("CusName:", cusName)
    // Find customer if name provided
    let priceMap = new Map()
    if (cusName) {
      const cus = await Customer.findOne({
        name: cusName,
        business: businessAccount,
      })
        .select("_id")
        .lean()
      console.log("Customer:", cus)
      if (cus) {
        // Get all personalized prices in single query
        const personalizedPrices = await PersonalizedPrice.find({
          customer: cus._id,
          business: businessAccount,
        })
          .select("product price")
          .lean()

        // Create productID -> price map
        priceMap = new Map(personalizedPrices.map((pp) => [pp.product.toString(), pp.price]))
      }
    }

    // Find products with search filter
    const products = await Inventory.find({
      business: businessAccount,
      name: { $regex: searchTerm, $options: "i" },
      $or: [{ gen_price: { $exists: true } }, { price: { $exists: true } }],
    })
      .select("name qty gen_price price image_url _id")
      .lean()

    // Process prices with fallback
    const processedProducts = products
      .map((product) => ({
        ...product,
        price: priceMap.get(product._id.toString()) || product.gen_price || product.price,
      }))
      .filter((product) => product.price !== undefined)

    res.status(200).json(processedProducts)
  } catch (error) {
    console.error("Error searching products:", error)
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

// Place an order
const createOrder = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    console.log("Inside create order")
    const businessId = req.user.id // Logged-in user's business ID
    const { customerId, products, transactionType, status, paymentMethod } = req.body

    console.log("Products:", products)

    if (!businessId || !customerId || !products || !transactionType || !status || !paymentMethod) {
      return res.status(400).json({
        message: "Business ID, customer ID, products, transaction type, status, and payment method are required",
      })
    }

    const productDetails = products.map((product) => ({
      product: product.productId,
      quantity: product.quantity,
      price: product.price,
    }))
    console.log("Product Details:", productDetails)
    // Determine if the buyer is a Business or Customer
    const buyerType = (await Business.findById(customerId)) ? "Business" : "Customer"

    // Create Sale
    const newSale = new Sale({
      seller: businessId,
      buyer: customerId,
      buyerType,
      products: productDetails,
      transactionType,
      status,
      paymentMethod,
    })

    const savedSale = await newSale.save({ session })
    console.log("Saved Sale:", savedSale)
    // Update the seller's Business model with the new Sale
    await Business.findByIdAndUpdate(businessId, { $push: { sales: savedSale._id } }, { new: true, session })

    let purId = null
    // If the buyer is a Business, create a corresponding Purchase record
    if (buyerType === "Business") {
      const newPurchase = new Purchase({
        buyer: customerId,
        seller: businessId,
        products: productDetails,
        transactionType,
        status,
        paymentMethod,
      })

      const savedPurchase = await newPurchase.save({ session })
      console.log("Saved Purchase:", savedPurchase)
      purId = savedPurchase._id
      // Update the buyer's Business model with the new Purchase
      await Business.findByIdAndUpdate(customerId, { $push: { purchases: savedPurchase._id } }, { new: true, session })
    }
    let finalCustomerId = customerId
    if (buyerType === "Business") {
      const buyerBusiness = await Business.findById(customerId).session(session)
      const newCustomer = new Customer({
        name: buyerBusiness.businessName,
        business: businessId,
        contact: buyerBusiness.contact,
        address: buyerBusiness.location,
      })

      const savedCustomer = await newCustomer.save({ session })
      finalCustomerId = savedCustomer._id
    }

    const effectiveDate = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const bulkOps = productDetails.map((product) => ({
      updateOne: {
        filter: {
          business: businessId,
          customer: finalCustomerId,
          product: product.product,
        },
        update: {
          $set: {
            price: product.price,
            effective_date: effectiveDate,
          },
        },
        upsert: true,
      },
    }))

    await PersonalizedPrice.bulkWrite(bulkOps, { session })
    console.log("Saved Personalized Prices")

    await session.commitTransaction()
    session.endSession()

    res
      .status(201)
      .json({ message: "Order created successfully", order: savedSale, saleId: savedSale._id, purId: purId })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    console.error("Error creating order:", error)
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

const generateMemoPDF = async (req, res) => {
  try {
    const { customerName, items } = req.body
    if (!customerName || !items || items.length === 0) {
      return res.status(400).json({ message: "Missing required fields" })
    }

    // Fetch business details
    const businessId = req.user.id
    const business = await Business.findById(businessId)
    if (!business) {
      return res.status(404).json({ message: "Business not found" })
    }

    const { businessName, location, gstin, contact } = business
    const orderId = `ORD-${new Date().getFullYear()}-${uuidv4().slice(0, 5).toUpperCase()}`
    const currentDate = new Date().toLocaleDateString("en-IN") // DD/MM/YYYY format

    // Create a new PDF document (A4 dimensions: 595 x 842 points)
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595, 842])
    const { width, height } = page.getSize()

    // Embed fonts
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Colors
    const primaryGreen = rgb(0.027, 0.757, 0.345) // #07C158
    const lightGreen = rgb(0.95, 1, 0.95)
    const black = rgb(0, 0, 0)
    const darkGray = rgb(0.2, 0.2, 0.2)
    const lightGray = rgb(0.9, 0.9, 0.9)

    // Add green header
    page.drawRectangle({
      x: 0,
      y: height - 80,
      width: width,
      height: 80,
      color: primaryGreen,
    })

    // Business details in the header (top left)
    let yPosition = height - 30
    page.drawText(businessName, {
      x: 40,
      y: yPosition,
      size: 18,
      font: boldFont,
      color: rgb(1, 1, 1),
    })

    yPosition -= 15
    page.drawText(location, {
      x: 40,
      y: yPosition,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1),
    })

    yPosition -= 15
    page.drawText(`GSTIN: ${gstin} | Phone: ${contact}`, {
      x: 40,
      y: yPosition,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1),
    })

    // Order details on the top right side
    let metaY = height - 30
    page.drawText(`Order Memo`, {
      x: width - 200,
      y: metaY,
      size: 18,
      font: boldFont,
      color: rgb(1, 1, 1),
    })

    metaY -= 15
    page.drawText(`Order ID: ${orderId}`, {
      x: width - 200,
      y: metaY,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1),
    })

    metaY -= 15
    page.drawText(`Date: ${currentDate}`, {
      x: width - 200,
      y: metaY,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1),
    })

    // Buyer Details section
    const buyerY = height - 120

    // Draw buyer details box
    page.drawRectangle({
      x: 40,
      y: buyerY - 80,
      width: 250,
      height: 80,
      borderColor: lightGray,
      borderWidth: 1,
      color: rgb(1, 1, 1, 0.02), // Very light background
    })

    // Buyer details header with icon
    page.drawText("Buyer Details", {
      x: 65,
      y: buyerY - 20,
      size: 12,
      font: boldFont,
      color: primaryGreen,
    })

    // Draw a small circle for the icon
    page.drawCircle({
      x: 55,
      y: buyerY - 15,
      size: 5,
      color: primaryGreen,
    })

    // Buyer details content
    page.drawText(customerName, {
      x: 65,
      y: buyerY - 40,
      size: 11,
      font: boldFont,
      color: darkGray,
    })

    // Placeholder for address and contact
    page.drawText("42 Green Avenue, Jayanagar, Bangalore", {
      x: 65,
      y: buyerY - 55,
      size: 10,
      font: regularFont,
      color: darkGray,
    })

    page.drawText("GSTIN: 29AADFS6341T2P", {
      x: 65,
      y: buyerY - 70,
      size: 10,
      font: regularFont,
      color: darkGray,
    })

    // Table header for the ordered items
    const tableY = buyerY - 120

    // Table headers
    const tableHeaders = [
      { text: "Item Description", x: 40, width: 220 },
      { text: "Unit", x: 260, width: 80 },
      { text: "Qty", x: 340, width: 50 },
      { text: "Unit Price", x: 390, width: 80 },
      { text: "Amount", x: 470, width: 80 },
    ]

    // Draw table header background
    page.drawRectangle({
      x: 40,
      y: tableY - 5,
      width: width - 80,
      height: 25,
      color: lightGray,
    })

    // Draw table headers
    tableHeaders.forEach((header) => {
      page.drawText(header.text, {
        x: header.x,
        y: tableY,
        size: 10,
        font: boldFont,
        color: darkGray,
      })
    })

    // Populate the table with item rows and calculate totals
    let itemY = tableY - 30
    let subtotal = 0
    let totalTax = 0
    const taxRates = {}

    items.forEach((item, index) => {
      const { productName, quantity, price, unit = "Piece", gst = 0 } = item
      const itemTotal = price * quantity
      subtotal += itemTotal

      // Calculate tax
      const taxAmount = (itemTotal * gst) / 100
      totalTax += taxAmount

      // Track tax by rate for breakdown
      if (gst > 0) {
        const cgstRate = gst / 2
        const sgstRate = gst / 2

        if (!taxRates[cgstRate]) {
          taxRates[cgstRate] = { cgst: 0, sgst: 0 }
        }

        taxRates[cgstRate].cgst += (itemTotal * cgstRate) / 100
        taxRates[cgstRate].sgst += (itemTotal * sgstRate) / 100
      }

      // Alternate row background
      if (index % 2 !== 0) {
        page.drawRectangle({
          x: 40,
          y: itemY - 5,
          width: width - 80,
          height: 25,
          color: lightGreen,
        })
      }

      // Draw item details
      page.drawText(productName, {
        x: 40,
        y: itemY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      // Draw small product code/description if available
      if (item.code) {
        page.drawText(item.code, {
          x: 40,
          y: itemY - 12,
          size: 8,
          font: regularFont,
          color: rgb(0.5, 0.5, 0.5),
        })
      }

      page.drawText(unit, {
        x: 260,
        y: itemY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(quantity.toString(), {
        x: 340,
        y: itemY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(`Rs${price.toFixed(2)}`, {
        x: 390,
        y: itemY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(`Rs${itemTotal.toFixed(2)}`, {
        x: 470,
        y: itemY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      itemY -= 25
    })

    // Calculate total amount
    const totalAmount = subtotal + totalTax

    // Tax Breakdown Section
    const taxY = itemY - 40

    // Draw tax breakdown box
    page.drawRectangle({
      x: 40,
      y: taxY - 80,
      width: 250,
      height: 80,
      borderColor: lightGray,
      borderWidth: 1,
      color: rgb(1, 1, 1, 0.02), // Very light background
    })

    // Tax breakdown header with icon
    page.drawText("Tax Breakdown", {
      x: 65,
      y: taxY - 20,
      size: 12,
      font: boldFont,
      color: primaryGreen,
    })

    // Draw a small circle for the icon
    page.drawCircle({
      x: 55,
      y: taxY - 15,
      size: 5,
      color: primaryGreen,
    })

    // Tax breakdown content
    let taxBreakdownY = taxY - 40
    let taxBreakdownTotal = 0

    // CGST and SGST breakdown
    Object.keys(taxRates).forEach((rate) => {
      const cgstAmount = taxRates[rate].cgst
      const sgstAmount = taxRates[rate].sgst
      taxBreakdownTotal += cgstAmount + sgstAmount

      // CGST
      page.drawText(`CGST`, {
        x: 65,
        y: taxBreakdownY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(`(${rate}%)`, {
        x: 100,
        y: taxBreakdownY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(`Rs${cgstAmount.toFixed(2)}`, {
        x: 220,
        y: taxBreakdownY,
        size: 10,
        font: boldFont,
        color: darkGray,
      })

      taxBreakdownY -= 15

      // SGST
      page.drawText(`SGST`, {
        x: 65,
        y: taxBreakdownY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(`(${rate}%)`, {
        x: 100,
        y: taxBreakdownY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(`Rs${sgstAmount.toFixed(2)}`, {
        x: 220,
        y: taxBreakdownY,
        size: 10,
        font: boldFont,
        color: darkGray,
      })

      taxBreakdownY -= 15
    })

    // Total tax
    page.drawText(`Total Tax`, {
      x: 65,
      y: taxBreakdownY,
      size: 10,
      font: boldFont,
      color: primaryGreen,
    })

    page.drawText(`Rs${taxBreakdownTotal.toFixed(2)}`, {
      x: 220,
      y: taxBreakdownY,
      size: 10,
      font: boldFont,
      color: primaryGreen,
    })

    // Payment Summary Section
    const summaryY = taxY - 40

    // Draw payment summary box
    page.drawRectangle({
      x: 300,
      y: summaryY - 80,
      width: 250,
      height: 80,
      borderColor: lightGray,
      borderWidth: 1,
      color: rgb(1, 1, 1, 0.02), // Very light background
    })

    // Payment summary header with icon
    page.drawText("Payment Summary", {
      x: 325,
      y: summaryY - 20,
      size: 12,
      font: boldFont,
      color: primaryGreen,
    })

    // Draw a small circle for the icon
    page.drawCircle({
      x: 315,
      y: summaryY - 15,
      size: 5,
      color: primaryGreen,
    })

    // Payment summary content
    let summaryContentY = summaryY - 40

    // Subtotal
    page.drawText(`Subtotal`, {
      x: 325,
      y: summaryContentY,
      size: 10,
      font: regularFont,
      color: darkGray,
    })

    page.drawText(`Rs${subtotal.toFixed(2)}`, {
      x: 480,
      y: summaryContentY,
      size: 10,
      font: regularFont,
      color: darkGray,
    })

    summaryContentY -= 15

    // Tax
    page.drawText(`Tax`, {
      x: 325,
      y: summaryContentY,
      size: 10,
      font: regularFont,
      color: darkGray,
    })

    page.drawText(`Rs${taxBreakdownTotal.toFixed(2)}`, {
      x: 480,
      y: summaryContentY,
      size: 10,
      font: regularFont,
      color: darkGray,
    })

    summaryContentY -= 15

    // Total Amount
    page.drawText(`Total Amount`, {
      x: 325,
      y: summaryContentY,
      size: 10,
      font: boldFont,
      color: primaryGreen,
    })

    page.drawText(`Rs${totalAmount.toFixed(2)}`, {
      x: 480,
      y: summaryContentY,
      size: 10,
      font: boldFont,
      color: primaryGreen,
    })

    // Footer
    const footerY = 40

    // Draw a line above the footer
    page.drawLine({
      start: { x: 40, y: footerY + 20 },
      end: { x: width - 40, y: footerY + 20 },
      thickness: 1,
      color: lightGray,
    })

    // Footer text
    page.drawText("Powered by KiranaBuddy", {
      x: width / 2 - 60,
      y: footerY,
      size: 10,
      font: regularFont,
      color: primaryGreen,
    })

    // Serialize the PDF and write it as a file
    const pdfBytes = await pdfDoc.save()
    const fileName = `${orderId}.pdf`.replace(/\s+/g, "_")
    const savePath = path.resolve(__dirname, `../invoices/${fileName}`)
    fs.writeFileSync(savePath, pdfBytes)
    console.log("PDF saved locally at:", savePath)

    // const authToken = await authenticateWithPCloud();
    // console.log(authToken);
    // const fileid = await uploadFileToPCloud(authToken, savePath);
    // console.log(fileid);
    // const publicLink = await generatePublicLink(authToken, fileid);
    // console.log('Public Link:', publicLink);
    const s3Location = await uploadFileToS3(savePath, fileName)

    // Generate a pre-signed URL (valid for 7 days)
    const presignedUrl = await generatePresignedUrl(fileName, 7 * 24 * 60 * 60)

    res.status(200).json({ message: "File generated successfully", fileName })
  } catch (error) {
    console.error("Error generating invoice PDF:", error)
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

const generateInvoiceByOrderId = async (req, res) => {
  try {
    // Get the order id from the route parameters or request body.
    const orderId = req.params.orderId || req.body.orderId
    const purchaseId = req.body.pur_orderId || null
    console.log(orderId)
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" })
    }

    // Find the Sale record and populate the buyer, seller, and product details.
    const sale = await Sale.findById(orderId)
      .populate("buyer") // Assuming "buyer" is a referenced Customer or Business
      .populate("seller") // Assuming "seller" is referenced in Business model
      .populate("products.product") // Assuming each sale.products item has a "product" ref
    console.log(sale)
    if (!sale) {
      return res.status(404).json({ message: "Sale/Order not found" })
    }

    // Retrieve business details from the seller.
    const business = sale.seller
    if (!business) {
      return res.status(404).json({ message: "Seller/Business not found" })
    }
    const { businessName, location, gstin, contact } = business

    // Use buyer details for invoice recipient.
    const customerName = sale.buyer && sale.buyer.businessName ? sale.buyer.businessName : sale.buyer.name
    const buyerAddress = sale.buyer.location || sale.buyer.address || "No Address Provided"
    const buyerGstin = sale.buyer.gstin || "No GSTIN Provided"
    const buyerContact = sale.buyer.contact || "No Contact Provided"

    // Map sale.products to an "items" array required for the PDF.
    // Ensure that each item has productName, quantity, and price.
    const items = sale.products.map((item) => {
      return {
        productName: item.product && item.product.name ? item.product.name : "Product",
        quantity: item.quantity,
        price: item.price,
        unit: item.unit || "Piece",
        gst: item.product.gst || 8, // Default GST rate
        code: item.product.code || "", // Product code if available
      }
    })
    console.log(items)

    // Generate a unique invoice id.
    const invoiceId = `ORD-${new Date().getFullYear()}-${uuidv4().slice(0, 5).toUpperCase()}`
    const currentDate = new Date().toLocaleDateString("en-IN") // DD/MM/YYYY format

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595, 842]) // A4 size
    const { width, height } = page.getSize()

    // Embed fonts
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Colors
    const primaryGreen = rgb(0.027, 0.757, 0.345) // #07C158
    const lightGreen = rgb(0.839, 0.957, 0.835) // #D6F2D5
    const black = rgb(0, 0, 0)
    const darkGray = rgb(0.2, 0.2, 0.2)
    const lightGray = rgb(0.9, 0.9, 0.9)

    // Constants
    const pageMargin = 40
    const cornerRadius = 8 // Rounded corners radius

    // Add green header
    page.drawRectangle({
      x: 0,
      y: height - 80,
      width: width,
      height: 80,
      color: primaryGreen,
    })

    // Business details in the header (top left)
    let yPosition = height - 30
    page.drawText(businessName, {
      x: pageMargin,
      y: yPosition,
      size: 18,
      font: boldFont,
      color: rgb(1, 1, 1),
    })

    yPosition -= 15
    page.drawText(location, {
      x: pageMargin,
      y: yPosition,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1),
    })

    yPosition -= 15
    page.drawText(`GSTIN: ${gstin} | Phone: ${contact || "N/A"}`, {
      x: pageMargin,
      y: yPosition,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1),
    })

    // Order details on the top right side
    let metaY = height - 30
    page.drawText(`Order Memo`, {
      x: width - 200,
      y: metaY,
      size: 18,
      font: boldFont,
      color: rgb(1, 1, 1),
    })

    metaY -= 15
    page.drawText(`Order ID: ${invoiceId}`, {
      x: width - 200,
      y: metaY,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1),
    })

    metaY -= 15
    page.drawText(`Date: ${currentDate}`, {
      x: width - 200,
      y: metaY,
      size: 10,
      font: regularFont,
      color: rgb(1, 1, 1),
    })

    // Buyer Details section with rounded corners
    const buyerY = height - 120

    // Draw buyer details box with rounded corners
    drawRoundedRectangle(page, {
      x: pageMargin,
      y: buyerY - 80,
      width: 250,
      height: 80,
      borderColor: lightGray,
      borderWidth: 1,
      color: rgb(1, 1, 1, 0.02), // Very light background
      cornerRadius: cornerRadius,
    })

    // Buyer details header with icon
    page.drawCircle({
      x: pageMargin + 10,
      y: buyerY - 15,
      size: 5,
      color: primaryGreen,
    })

    page.drawText("Buyer Details", {
      x: pageMargin + 20,
      y: buyerY - 20,
      size: 12,
      font: boldFont,
      color: primaryGreen,
    })

    // Buyer details content
    page.drawText(customerName, {
      x: pageMargin + 20,
      y: buyerY - 40,
      size: 11,
      font: boldFont,
      color: darkGray,
    })

    // Address
    page.drawText(buyerAddress, {
      x: pageMargin + 20,
      y: buyerY - 55,
      size: 10,
      font: regularFont,
      color: darkGray,
    })

    page.drawText(`GSTIN: ${buyerGstin}`, {
      x: pageMargin + 20,
      y: buyerY - 70,
      size: 10,
      font: regularFont,
      color: darkGray,
    })

    // Table header for the ordered items
    const tableY = buyerY - 120

    // Table headers
    const tableHeaders = [
      { text: "Item Description", x: pageMargin, width: 220 },
      { text: "Unit", x: pageMargin + 220, width: 80 },
      { text: "Qty", x: pageMargin + 300, width: 50 },
      { text: "Unit Price", x: pageMargin + 350, width: 80 },
      { text: "Amount", x: pageMargin + 430, width: 80 },
    ]

    // Draw table header background
    page.drawRectangle({
      x: pageMargin,
      y: tableY - 5,
      width: width - pageMargin * 2,
      height: 25,
      color: lightGray,
    })

    // Draw table headers
    tableHeaders.forEach((header) => {
      page.drawText(header.text, {
        x: header.x,
        y: tableY,
        size: 10,
        font: boldFont,
        color: darkGray,
      })
    })

    // Populate the table with item rows and calculate totals
    let itemY = tableY - 30
    let subtotal = 0
    let totalTax = 0
    const taxRates = {}
    const rowHeight = 25

    items.forEach((item, index) => {
      const { productName, quantity, price, unit = "Piece", gst = 0, code = "" } = item
      const itemTotal = price * quantity
      subtotal += itemTotal

      // Calculate tax
      const taxAmount = (itemTotal * gst) / 100
      totalTax += taxAmount

      // Track tax by rate for breakdown
      if (gst > 0) {
        const cgstRate = gst / 2
        const sgstRate = gst / 2

        if (!taxRates[cgstRate]) {
          taxRates[cgstRate] = { cgst: 0, sgst: 0 }
        }

        taxRates[cgstRate].cgst += (itemTotal * cgstRate) / 100
        taxRates[cgstRate].sgst += (itemTotal * sgstRate) / 100
      }

      // Alternate row background
      if (index % 2 !== 0) {
        page.drawRectangle({
          x: pageMargin,
          y: itemY - 5,
          width: width - pageMargin * 2,
          height: rowHeight,
          color: lightGreen,
        })
      }

      // Draw item details
      page.drawText(productName, {
        x: pageMargin,
        y: itemY,
        size: 10,
        font: boldFont,
        color: darkGray,
      })

      // Draw small product code/description if available
      if (code) {
        page.drawText(code, {
          x: pageMargin,
          y: itemY - 12,
          size: 8,
          font: regularFont,
          color: rgb(0.5, 0.5, 0.5),
        })
      }

      page.drawText(unit, {
        x: pageMargin + 220,
        y: itemY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(quantity.toString(), {
        x: pageMargin + 300,
        y: itemY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(`Rs. ${price.toFixed(2)}`, {
        x: pageMargin + 350,
        y: itemY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(`Rs. ${itemTotal.toFixed(2)}`, {
        x: pageMargin + 430,
        y: itemY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      itemY -= rowHeight
    })

    // Calculate total amount
    const totalAmount = subtotal + totalTax

    // Tax Breakdown Section with rounded corners
    const taxY = itemY - 40

    // Draw tax breakdown box with rounded corners
    drawRoundedRectangle(page, {
      x: pageMargin,
      y: taxY - 80,
      width: 250,
      height: 80,
      borderColor: lightGray,
      borderWidth: 1,
      color: rgb(1, 1, 1, 0.02), // Very light background
      cornerRadius: cornerRadius,
    })

    // Tax breakdown header with icon
    page.drawCircle({
      x: pageMargin + 10,
      y: taxY - 15,
      size: 5,
      color: primaryGreen,
    })

    page.drawText("Tax Breakdown", {
      x: pageMargin + 20,
      y: taxY - 20,
      size: 12,
      font: boldFont,
      color: primaryGreen,
    })

    // Tax breakdown content
    let taxBreakdownY = taxY - 40
    let taxBreakdownTotal = 0

    // CGST and SGST breakdown
    Object.keys(taxRates).forEach((rate) => {
      const cgstAmount = taxRates[rate].cgst
      const sgstAmount = taxRates[rate].sgst
      taxBreakdownTotal += cgstAmount + sgstAmount

      // CGST
      page.drawText(`CGST`, {
        x: pageMargin + 20,
        y: taxBreakdownY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(`Rs. ${cgstAmount.toFixed(2)}`, {
        x: pageMargin + 200,
        y: taxBreakdownY,
        size: 10,
        font: boldFont,
        color: darkGray,
        textAlign: "right",
      })

      taxBreakdownY -= 15

      // SGST
      page.drawText(`SGST`, {
        x: pageMargin + 20,
        y: taxBreakdownY,
        size: 10,
        font: regularFont,
        color: darkGray,
      })

      page.drawText(`Rs. ${sgstAmount.toFixed(2)}`, {
        x: pageMargin + 200,
        y: taxBreakdownY,
        size: 10,
        font: boldFont,
        color: darkGray,
        textAlign: "right",
      })

      taxBreakdownY -= 15
    })

    // IGST (if applicable)
    page.drawText(`IGST`, {
      x: pageMargin + 20,
      y: taxBreakdownY,
      size: 10,
      font: regularFont,
      color: darkGray,
    })

    page.drawText(`Rs. 0.00`, {
      x: pageMargin + 200,
      y: taxBreakdownY,
      size: 10,
      font: boldFont,
      color: darkGray,
      textAlign: "right",
    })

    taxBreakdownY -= 15

    // Total tax
    page.drawText(`Total Tax`, {
      x: pageMargin + 20,
      y: taxBreakdownY,
      size: 10,
      font: boldFont,
      color: primaryGreen,
    })

    page.drawText(`Rs. ${taxBreakdownTotal.toFixed(2)}`, {
      x: pageMargin + 200,
      y: taxBreakdownY,
      size: 10,
      font: boldFont,
      color: primaryGreen,
      textAlign: "right",
    })

    // Payment Summary Section with rounded corners
    const summaryY = taxY

    // Draw payment summary box with rounded corners
    drawRoundedRectangle(page, {
      x: pageMargin + 270,
      y: summaryY - 80,
      width: 250,
      height: 80,
      borderColor: lightGray,
      borderWidth: 1,
      color: rgb(1, 1, 1, 0.02), // Very light background
      cornerRadius: cornerRadius,
    })

    // Payment summary header with icon
    page.drawCircle({
      x: pageMargin + 280,
      y: summaryY - 15,
      size: 5,
      color: primaryGreen,
    })

    page.drawText("Payment Summary", {
      x: pageMargin + 290,
      y: summaryY - 20,
      size: 12,
      font: boldFont,
      color: primaryGreen,
    })

    // Payment summary content
    let summaryContentY = summaryY - 40

    // Subtotal
    page.drawText(`Subtotal`, {
      x: pageMargin + 290,
      y: summaryContentY,
      size: 10,
      font: regularFont,
      color: darkGray,
    })

    page.drawText(`Rs. ${subtotal.toFixed(2)}`, {
      x: pageMargin + 450,
      y: summaryContentY,
      size: 10,
      font: regularFont,
      color: darkGray,
      textAlign: "right",
    })

    summaryContentY -= 15

    // Tax
    page.drawText(`Tax`, {
      x: pageMargin + 290,
      y: summaryContentY,
      size: 10,
      font: regularFont,
      color: darkGray,
    })

    page.drawText(`Rs. ${taxBreakdownTotal.toFixed(2)}`, {
      x: pageMargin + 450,
      y: summaryContentY,
      size: 10,
      font: regularFont,
      color: darkGray,
      textAlign: "right",
    })

    summaryContentY -= 15

    // Total Amount
    page.drawText(`Total Amount`, {
      x: pageMargin + 290,
      y: summaryContentY,
      size: 10,
      font: boldFont,
      color: primaryGreen,
    })

    page.drawText(`Rs. ${totalAmount.toFixed(2)}`, {
      x: pageMargin + 450,
      y: summaryContentY,
      size: 10,
      font: boldFont,
      color: primaryGreen,
      textAlign: "right",
    })

    // Footer
    const footerY = 40

    // Draw a line above the footer
    page.drawLine({
      start: { x: pageMargin, y: footerY + 20 },
      end: { x: width - pageMargin, y: footerY + 20 },
      thickness: 1,
      color: lightGray,
    })

    // Footer text
    page.drawText("Powered by KiranaBuddy", {
      x: width / 2 - 60,
      y: footerY,
      size: 10,
      font: regularFont,
      color: primaryGreen,
    })

    // Helper function to draw rounded rectangles
    function drawRoundedRectangle(page, { x, y, width, height, color, borderColor, borderWidth, cornerRadius }) {
      // Draw the main rectangle (slightly smaller to accommodate the corners)
      page.drawRectangle({
        x: x + cornerRadius,
        y: y + cornerRadius,
        width: width - 2 * cornerRadius,
        height: height - 2 * cornerRadius,
        color: color || rgb(1, 1, 1),
        borderColor: borderColor,
        borderWidth: borderWidth,
      })

      // Draw the left and right rectangles
      page.drawRectangle({
        x: x,
        y: y + cornerRadius,
        width: cornerRadius,
        height: height - 2 * cornerRadius,
        color: color || rgb(1, 1, 1),
        borderColor: borderColor,
        borderWidth: borderWidth,
      })

      page.drawRectangle({
        x: x + width - cornerRadius,
        y: y + cornerRadius,
        width: cornerRadius,
        height: height - 2 * cornerRadius,
        color: color || rgb(1, 1, 1),
        borderColor: borderColor,
        borderWidth: borderWidth,
      })

      // Draw the top and bottom rectangles
      page.drawRectangle({
        x: x + cornerRadius,
        y: y,
        width: width - 2 * cornerRadius,
        height: cornerRadius,
        color: color || rgb(1, 1, 1),
        borderColor: borderColor,
        borderWidth: borderWidth,
      })

      page.drawRectangle({
        x: x + cornerRadius,
        y: y + height - cornerRadius,
        width: width - 2 * cornerRadius,
        height: cornerRadius,
        color: color || rgb(1, 1, 1),
        borderColor: borderColor,
        borderWidth: borderWidth,
      })

      // Draw the four corner circles
      page.drawCircle({
        x: x + cornerRadius,
        y: y + cornerRadius,
        size: cornerRadius,
        color: color || rgb(1, 1, 1),
      })

      page.drawCircle({
        x: x + width - cornerRadius,
        y: y + cornerRadius,
        size: cornerRadius,
        color: color || rgb(1, 1, 1),
      })

      page.drawCircle({
        x: x + cornerRadius,
        y: y + height - cornerRadius,
        size: cornerRadius,
        color: color || rgb(1, 1, 1),
      })

      page.drawCircle({
        x: x + width - cornerRadius,
        y: y + height - cornerRadius,
        size: cornerRadius,
        color: color || rgb(1, 1, 1),
      })
    }

    // Serialize the PDF and write it as a file
    const pdfBytes = await pdfDoc.save()
    const fileName = `${invoiceId}.pdf`.replace(/\s+/g, "_")
    const savePath = path.resolve(__dirname, `../invoices/${fileName}`)
    fs.writeFileSync(savePath, pdfBytes)
    console.log("PDF saved locally at:", savePath)

    const s3Location = await uploadFileToS3(savePath, fileName)

    // Generate a pre-signed URL (valid for 7 days)
    const presignedUrl = await generatePresignedUrl(fileName, 7 * 24 * 60 * 60)

    // Delete the local file after upload.
    fs.unlinkSync(savePath)
    console.log("Local PDF deleted:", savePath)

    // Create the Invoice document using the provided schema.
    const invoiceData = {
      sale_orderId: orderId,
      purchase_orderId: purchaseId, // provided order id
      invoiceId: invoiceId,
      invoiceLink: presignedUrl,
      s3Key: fileName,
    }

    const newInvoice = await Invoice.create(invoiceData)

    // Return a success response with the created invoice details.
    res.status(200).json({
      message: "Invoice generated and uploaded successfully",
      invoice: newInvoice,
    })
  } catch (error) {
    console.error("Error generating invoice from order:", error)
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

const getInvoiceUrlByOrderId = async (req, res) => {
  try {
    // We expect the order id to be provided as a URL parameter (e.g. GET /api/invoice/:orderId)
    const id = req.body.id
    console.log("Backedn ORderID: ", id)
    console.log(req.body.id)
    if (!id) {
      return res.status(400).json({ message: "Order ID is required" })
    }
    // Look up the invoice document by orderId
    const invoice = await Invoice.findOne({
      $or: [
        { sale_orderId: id },
        { purchase_orderId: id }, // Use this if you store it in a second field
      ],
    })
    if (!invoice) {
      console.log("Invoice not found for order id: " + id)
      return res.status(404).json({ message: "Invoice not found for order id: " + id })
    }
    console.log(invoice)
    // Return the invoice URL (and optionally other fields)
    const presignedUrl = await generatePresignedUrl(invoice.s3Key, 3600)

    return res.status(200).json({
      invoiceUrl: presignedUrl,
      invoiceId: invoice.invoiceId,
    })
  } catch (error) {
    console.error("Error retrieving invoice:", error)
    return res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

module.exports = {
  searchCustomers,
  addCustomer,
  searchProducts,
  createOrder,
  generateMemoPDF,
  generateInvoiceByOrderId,
  getInvoiceUrlByOrderId,
}

