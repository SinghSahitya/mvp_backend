const admin = require('../config/firebaseConfig');
const jwt = require('jsonwebtoken');
const Business = require('../models/Business');
const axios = require("axios");

const VoximplantApiClient = require('@voximplant/apiclient-nodejs').default;

const path = require('path');
// Twilio credentials

const credentialsPath = path.join(__dirname, '..', 'config', 'a1b016b8-e589-4914-9760-8ccc2e089f4c_private.json');
const client = new VoximplantApiClient(credentialsPath);


// Login Handler
exports.login = async (req, res) => {
    const { phoneNumber } = req.body;
    console.log("Recieve Login Request");
    console.log(phoneNumber);
  
    if (!phoneNumber) {
      return res.status(400).json({ message: "Phone number is required" });
    }
  
    try {
      // Check if the phone number exists in the database
      const user = await Business.findOne({ contact: phoneNumber });
      console.log(user);

      if (!user) {
        return res.status(404).json({ message: "No such phone number exists" });
      }
  
      // Send OTP using Firebase
      const phoneAuth = await admin.auth().createCustomToken(phoneNumber); // Custom token if needed
      console.log(phoneAuth);

      return res.status(200).json({ message: "User found, OTP can be sent", phoneAuth });
    } catch (error) {
      console.error("Error during login:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

// Verify OTP Handler
exports.verifyOtp = async (req, res) => {
    const { phoneNumber, idToken } = req.body;
    console.log(phoneNumber, idToken);
    try {
      // Verify the Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
  
      // Ensure the phone number matches
      if (decodedToken.phone_number !== phoneNumber) {
        return res.status(401).json({ message: "OTP verification failed" });
      }

      const user = await Business.findOne({ contact: phoneNumber });
      if (!user) {
        return res.status(404).json({ message: "No such phone number exists" });
      }
      
      // Generate your JWT token (or handle user authentication)
      const token = jwt.sign(
        { id: user._id, phoneNumber: decodedToken.phone_number },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      const bname = user.businessName;
      console.log(bname, phoneNumber);
      res.json({ message: "Login successful", token, phoneNumber, bname });
    } catch (err) {
      res.status(400).json({ message: "Invalid OTP", error: err.message });
    }
  };

  function generateSecurePassword() {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }

  function generateValidUserName(name) {
    // Convert to lowercase, remove non-Latin characters, and replace spaces with hyphens
    let sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '');

    // Ensure the username starts with a letter or digit
    if (!/^[a-z0-9]/.test(sanitized)) {
        sanitized = 'user-' + sanitized;
    }

    // Ensure a minimum length of 3 characters
    if (sanitized.length < 3) {
        sanitized = sanitized.padEnd(3, 'x');
    }

    return sanitized;
}

async function createVoximplantUser(businessName, ownerName, phoneNumber) {
  try {

      const params = {
          userName: businessName,
          userDisplayName: ownerName,
          userPassword: phoneNumber,
          applicationName: 'kb.krish.n2.voximplant.com' // Replace this with your actual application ID from Voximplant Control Panel
      };
      console.log("Inside create: ", phoneNumber, businessName);
      const result = await client.Users.addUser(params);
      return result;
  } catch (error) {
      console.error('Error creating Voximplant user:', error);
      throw error;
  }
}

  
// Signup Handlerc
exports.signup = async (req, res) => {
    console.log("INSIDE SIGNUP");
    const { gstin, businessName, ownerName, contact, location, businessType, idToken } = req.body;
    console.log("Received signup request: ", req.body);
    if (!gstin || !businessName || !ownerName || !contact || !location) {
      return res.status(400).json({ message: "All required fields must be filled" });
    }
  
    try {
      // Verify the Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
  
      // Ensure the phone number matches
      if (decodedToken.phone_number !== contact) {
        return res.status(401).json({ message: "OTP verification failed" });
      }
  
      // Check if the user already exists in the database
      const existingUser = await Business.findOne({ contact });
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

    // Validate the GST number using the external API
    // const apiKey = process.env.GSTIN_API_KEY; // Your API key stored in .env
    // const gstApiUrl = `http://sheet.gstincheck.co.in/check/${apiKey}/${gstin}`;

    // const gstResponse = await axios.get(gstApiUrl);

    // if (!gstResponse.data.flag) {
    //   return res.status(400).json({ message: "Invalid GST number" });
    // }
    // const validatedAddress = gstResponse.data.data.pradr.adr;

    
      // Create a new Business document
      const newBusiness = new Business({
        gstin,
        businessName,
        ownerName,
        contact,
        location,
        businessType,
      });
  
      await newBusiness.save();
  
      // Generate a JWT token for the user
      const token = jwt.sign(
        { id: newBusiness._id, phoneNumber: newBusiness.contact },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      try {
        const output = await createVoximplantUser(newBusiness.businessName, newBusiness.ownerName, newBusiness.contact);
        console.log("User successfully registered: ", output);
    } catch (voxError) {
        console.error('Error creating Voximplant user:', voxError);
        // Decide if you want to fail the verification or continue despite the error
    }
      
      res.status(201).json({ message: "Signup successful", token });
    } catch (err) {
      console.error("Error during signup:", err);
      res.status(500).json({ message: "Signup failed", error: err.message });
    }
  };


