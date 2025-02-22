const Inventory = require("../models/Inventory");
const Business = require("../models/Business");
const jwt = require("jsonwebtoken");
const mongoose = require('mongoose');

// Fetch all businesses excluding the logged-in user's business
// Fetch all businesses excluding the logged-in user's business
const getAllBusinesses = async (req, res) => {
  try {
    const businessId = req.user.id; // Logged-in user's business ID

    if (!businessId) {
      return res.status(403).json({ message: "Invalid business ID" });
    }

    // Exclude the logged-in user's business from the results
    const businesses = await Business.find({ _id: { $ne: businessId } }).select(
      "businessName ownerName contact location businessImage ownerImage createdAt"
    );
    
    res.status(200).json(businesses); // Return businesses with image URLs directly
  } catch (error) {
    console.error("Error fetching businesses:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

const getAvailableProducts = async (req, res) => {
  try {
    const businessId = req.user.id; // Logged-in user's business ID

    if (!businessId) {
      return res.status(403).json({ message: "Invalid business ID" });
    }

    const businessAccount = new mongoose.Types.ObjectId(businessId);

    // Fetch all inventory items excluding those linked to the user's business
    const products = await Inventory.find({ business: { $ne: businessAccount } }).select(
      "name qty price business image_url"
    ).limit(20);

    res.status(200).json(products); // Return products with image URLs directly
  } catch (error) {
    console.error("Error fetching available products:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// Fetch inventory products linked to the logged-in user's business
const getUserInventoryProducts = async (req, res) => {
  try {
    const businessId = req.user.id; // Logged-in user's business ID

    if (!businessId) {
      return res.status(403).json({ message: "Invalid business ID" });
    }

    // Fetch all inventory items linked to the logged-in user's business
    const products = await Inventory.find({ business: businessId }).select(
      "name qty price business image_url"
    ).limit(20);

    res.status(200).json(products); // Return products with image URLs directly
  } catch (error) {
    console.error("Error fetching user inventory products:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

const searchBusinesses = async (req, res) => {
  try {
    const businessId = req.user.id; // Logged-in user's business ID
    const searchTerm = req.query.search || "";

    if (!businessId) {
      return res.status(403).json({ message: "Invalid business ID" });
    }

    // Dynamic search across multiple business fields
    const businesses = await Business.find({
      // Exclude the logged-in user's business
      _id: { $ne: businessId },
      // Case-insensitive search across multiple fields
      $or: [
        { businessName: { $regex: searchTerm, $options: 'i' } },
        { ownerName: { $regex: searchTerm, $options: 'i' } },
        { location: { $regex: searchTerm, $options: 'i' } }
      ]
    }).select(
      "businessName ownerName contact location businessImage ownerImage createdAt"
    ).limit(5); 

    res.status(200).json(businesses);
  } catch (error) {
    console.error("Error searching businesses:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// Search Products Dynamically
const searchProducts = async (req, res) => {
  try {
    const businessId = req.user.id; // Logged-in user's business ID
    const searchTerm = req.query.search || "";

    if (!businessId) {
      return res.status(403).json({ message: "Invalid business ID" });
    }

    // Dynamic search across product fields
    const products = await Inventory.find({
      // Case-insensitive search across multiple fields
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } }
      ]
    }).select(
      "name qty price business image_url"
    ).populate('business', 'businessName').limit(5); // Populate business details

    res.status(200).json(products);
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

const getBusinessesByProduct = async (req, res) => {
  try {
    const { productName } = req.params;
    const currentBusinessId = req.user.id;

    if (!currentBusinessId) {
      return res.status(403).json({ message: "Invalid business ID" });
    }

    const businesses = await Inventory.aggregate([
      { $match: { 
        name: { $regex: productName, $options: 'i' },
        business: { $ne: new mongoose.Types.ObjectId(currentBusinessId) }
      }},
      { $group: { _id: "$business" }},
      { $lookup: {
        from: "businesses",
        localField: "_id",
        foreignField: "_id",
        as: "businessDetails"
      }},
      { $unwind: "$businessDetails" },
      { $project: {
        _id: "$businessDetails._id",
        businessName: "$businessDetails.businessName",
        ownerName: "$businessDetails.ownerName",
        contact: "$businessDetails.contact",
        location: "$businessDetails.location",
        businessImage: "$businessDetails.businessImage",
        ownerImage: "$businessDetails.ownerImage",
        createdAt: "$businessDetails.createdAt"
      }}
    ]);

    res.status(200).json(businesses);
  } catch (error) {
    console.error("Error fetching businesses by product:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

module.exports = {
  getAllBusinesses,
  getAvailableProducts,
  getUserInventoryProducts,
  searchBusinesses,
  searchProducts,
  getBusinessesByProduct
};
