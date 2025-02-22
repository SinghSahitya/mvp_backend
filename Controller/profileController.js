const Business = require('../models/Business');
const Inventory = require('../models/Inventory');
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const axios = require('axios');
const FormData = require('form-data');

const memoryStorage = multer.memoryStorage();
const uploadMemory = multer({ storage: memoryStorage });

exports.addProductToInventory = async (req, res) => {
  try {
    const { name, qty, price } = req.body;
    const businessId = req.user.id; // Extract businessId from auth middleware

    if (!name || !qty || !price) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const newProduct = new Inventory({
      name,
      qty,
      price,
      business: businessId,
    });

    await newProduct.save();
    res.status(201).json({ message: 'Product added successfully', product: newProduct });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.details = async (req, res) => {
  try {
    const businessId = req.user.id;
    const business = new mongoose.Types.ObjectId(businessId);

    // Fetch business details including images
    const businessDetails = await Business.findOne({ _id: business }).select(
      "businessName ownerName contact location businessImage ownerImage gstin topItems businessType"
    );

    if (!businessDetails) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.status(200).json({
      message: "Details Fetched Successfully!",
      businessDetails: businessDetails,
    });
  } catch (error) {
    console.error("Error fetching details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.inventory = async (req, res) => {
  try {
    // console.log("Inside Inventory");
    const businessId = req.user.id; // Ensure this is correctly set by authMiddleware
    const business = new mongoose.Types.ObjectId(businessId);

    // Fetch inventory items for the business
    const businessInventory = await Inventory.find({ business: business });
    // console.log(businessInventory); // Log fetched inventory items

    res.status(201).json({ message: 'Inventory Fetched Successfully!', items: businessInventory });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.uploadImages = [
  uploadMemory.fields([
    { name: "businessImage", maxCount: 1 },
    { name: "ownerImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const businessId = req.user.id; // Get business ID from auth middleware
      const updateData = {};

      // Check if businessImage is uploaded
      if (req.files.businessImage) {
        const businessImagePath = `/uploads/business/${req.files.businessImage[0].filename}`;
        updateData.businessImage = businessImagePath;
      }

      // Check if ownerImage is uploaded
      if (req.files.ownerImage) {
        const ownerImagePath = `/uploads/owner/${req.files.ownerImage[0].filename}`;
        updateData.ownerImage = ownerImagePath;
      }

      // Update the business document
      const updatedBusiness = await Business.findByIdAndUpdate(
        businessId,
        updateData,
        { new: true }
      );

      res.status(200).json({
        message: "Images uploaded successfully!",
        business: updatedBusiness,
      });
    } catch (error) {
      console.error("Error uploading images:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
];

exports.updateProfile = async (req, res) => {
  try {
    const businessId = req.user.id; // Get the business ID from the auth middleware

    // Debugging: Log the incoming request body
    console.log('Inside Update Request body:', req.body);

    // Update the business details directly
    const updatedBusiness = await Business.findByIdAndUpdate(
      businessId,
      { $set: req.body }, // Use the entire request body for the update
      { new: true } // Return the updated document
    );

    // Check if the business exists
    if (!updatedBusiness) {
      console.log('Business not found for ID:', businessId); // Debugging
      return res.status(404).json({ message: "Business not found" });
    }

    // Debugging: Log the updated business details
    console.log('Updated Business Details:', updatedBusiness);

    // Respond with the updated business details
    res.status(200).json({
      message: "Profile updated successfully!",
      business: updatedBusiness,
    });
  } catch (error) {
    console.error("Error updating profile:", error); // Debugging
    res.status(500).json({ message: "Internal server error" });
  }
};


exports.uploadProfileImageImgbb = [
  uploadMemory.single("profileImage"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
      }

      // Convert the file buffer to a base64 string.
      const base64Image = req.file.buffer.toString("base64");

      // Use your imgbb API key from an environment variable (or a fallback)
      const imgbbApiKey = process.env.IMGBB_API_KEY || "YOUR_IMGBB_API_KEY";
      const imgbbUrl = `https://api.imgbb.com/1/upload?key=${imgbbApiKey}`;
      console.log("IMGBB ID: ", imgbbApiKey);

      // Create a FormData instance and append the base64 image.
      const form = new FormData();
      form.append("image", base64Image);

      // Post to imgbb API using axios, including the proper headers.
      const imgbbResponse = await axios.post(imgbbUrl, form, {
        headers: form.getHeaders(),
      });
      console.log("imgbbResponse:", imgbbResponse.data);

      // Retrieve the direct viewing link from the API response.
      const imageUrl = imgbbResponse.data?.data?.display_url;
      if (!imageUrl) {
        return res.status(500).json({ message: "Image uploaded but no URL returned from imgbb." });
      }

      // Update the user's business profile with the new image URL.
      // Assuming that req.user.id exists (set by your authentication middleware).
      const businessId = req.user.id;
      const updatedBusiness = await Business.findByIdAndUpdate(
        businessId,
        { ownerImage: imageUrl },
        { new: true }
      );

      // Respond with the new image URL.
      return res.status(200).json({
        message: "Profile image updated successfully!",
        imageUrl,
        business: updatedBusiness,
      });
    } catch (error) {
      console.error("Error uploading image to imgbb:", error.message);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },
  ];