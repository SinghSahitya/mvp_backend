const Business = require("../models/Business");
const Inventory = require("../models/Inventory");
const Customer = require("../models/Customer");
const PersonalizedPrice = require("../models/PersonalizedPrice");
const jwt = require("jsonwebtoken");
const mongoose = require('mongoose');
// Get Business Details and Associated Products
// const getBusinessDetails = async (req, res) => {
//   const { businessName, contact } = req.body;
//   const customer_Id = req.user.id;
  
//   if (!businessName || !contact) {
//     return res.status(400).json({ message: "Business name and contact are required" });
//   }

//   try {
//     // Find the business
//     const business = await Business.findOne({
//       businessName,
//       contact,
//     }).select("businessName ownerName location contact ownerImage gstin _id");

//     if (!business) {
//       return res.status(404).json({ message: "Business not found" });
//     }

//     const businessAccount = new mongoose.Types.ObjectId(business._id);
//     console.log(`Fetching inventory for business: ${business._id}`);

//     // Get inventory items with pricing
//     const inventoryItems = await Inventory.find({
//       business: businessAccount,
//       $or: [
//         { gen_price: { $exists: true } },
//         { price: { $exists: true } }
//       ]
//     }).select("name qty gen_price price image_url");
    
//     console.log(`Found ${inventoryItems.length} items with potential prices`);

//     // Get personalized prices
//     const productIds = inventoryItems.map(item => item._id);
   

//     const loggedInUser = await Business.findOne({
//       _id: new mongoose.Types.ObjectId(customer_Id)
//     });
//     console.log("LOGGED IN USER: ",loggedInUser);

//     const cus= await Customer.findOne({ 
//       name: loggedInUser.businessName,
//       business: businessAccount
//      });
//     const cusId = cus._id;
//     console.log("CUSTOMER ID: ",cusId);
//     const personalizedPrices = await PersonalizedPrice.find({
//       customer: cusId,
//       business: businessAccount,
//       product: { $in: productIds }
//     });
    
//     console.log(`Found ${personalizedPrices.length} personalized prices for customer ${cusId}`);
//     console.log('Personalized price IDs:', personalizedPrices.map(pp => pp.product));

//     // Process items with price priority
//     const priceMap = new Map(personalizedPrices.map(pp => [
//       pp.product.toString(), 
//       { price: pp.price, effectiveDate: pp.effective_date }
//     ]));

//     let personalizedCount = 0;
//     let genPriceCount = 0;
//     let defaultPriceCount = 0;
//     let excludedCount = 0;

//     const processedProducts = inventoryItems
//       .map(item => {
//         const itemId = item._id.toString();
//         const ppData = priceMap.get(itemId);
//         let finalPrice;
//         let priceSource;

//         if (ppData) {
//           finalPrice = ppData.price;
//           priceSource = 'personalized';
//           personalizedCount++;
//           console.log(`[${itemId}] ${item.name} - Using personalized price ${finalPrice} (effective ${ppData.effectiveDate})`);
//         } else if (item.gen_price !== undefined) {
//           finalPrice = item.gen_price;
//           priceSource = 'gen_price';
//           genPriceCount++;
//           console.log(`[${itemId}] ${item.name} - Using gen_price ${finalPrice}`);
//         } else if (item.price !== undefined) {
//           finalPrice = item.price;
//           priceSource = 'default';
//           defaultPriceCount++;
//           console.log(`[${item.name}] - Using default price ${finalPrice}`);
//         } else {
//           console.warn(`[${itemId}] ${item.name} - No valid prices found, excluding`);
//           excludedCount++;
//           return null;
//         }

//         return {
//           _id: item._id,
//           name: item.name,
//           qty: item.qty,
//           price: finalPrice,
//           image_url: item.image_url,
//           priceSource // Optional: include price source in response for debugging
//         };
//       })
//       .filter(item => item !== null);

//     console.log(`Price breakdown:
//       Personalized: ${personalizedCount}
//       Gen Price: ${genPriceCount}
//       Default: ${defaultPriceCount}
//       Excluded: ${excludedCount}
//     `);

//     res.status(200).json({ 
//       business,
//       products: processedProducts 
//     });

//   } catch (error) {
//     console.error("Error fetching business details:", error);
//     res.status(500).json({ message: "Internal server error", error: error.message });
//   }
// };

const getBusinessDetails = async (req, res) => {
  const { businessName, contact } = req.body;
  const customer_Id = req.user.id;

  if (!businessName || !contact) {
    return res.status(400).json({ message: "Business name and contact are required" });
  }
  const priceMap = new Map();
  try {
    const business = await Business.findOne({ businessName, contact })
      .select("businessName ownerName location contact ownerImage gstin _id")
      .lean();

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const businessAccount = new mongoose.Types.ObjectId(business._id);
    
    const inventoryItems = await Inventory.find({
      business: businessAccount,
      $or: [{ gen_price: { $exists: true } }, { price: { $exists: true } }]
    }).select("name qty gen_price price image_url unit").lean();

    const productIds = inventoryItems.map(item => item._id);
    
    const loggedInUser = await Business.findById(customer_Id).lean();
    const cus = await Customer.findOne({ 
      name: loggedInUser.businessName,
      business: businessAccount
    }).lean();

    if (cus) {
    const personalizedPrices = await PersonalizedPrice.find({
      customer: cus._id,
      business: businessAccount,
      product: { $in: productIds }
    }).select("product price effective_date").lean();

    
    personalizedPrices.forEach(pp => priceMap.set(pp.product.toString(), pp.price));
  } else {
    
    console.log("Not an already existing customer");
  }
    const processedProducts = [];
    
    for (const item of inventoryItems) {
      const itemId = item._id.toString();
      const finalPrice = priceMap.get(itemId) || item.gen_price || item.price;
      
      if (finalPrice !== undefined) {
        processedProducts.push({
          _id: item._id,
          name: item.name,
          qty: item.qty,
          price: finalPrice,
          image_url: item.image_url,
          unit: item.unit
        });
      }
    }

    res.status(200).json({ 
      business,
      products: processedProducts 
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

module.exports = { getBusinessDetails };
