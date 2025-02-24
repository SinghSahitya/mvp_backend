const admin = require('../config/firebaseConfig');
const jwt = require('jsonwebtoken');
const Business = require('../models/Business');

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
        { expiresIn: "7d" }
      );

      const accessToken = jwt.sign({ id: user._id, phoneNumber: decodedToken.phone_number }, process.env.JWT_SECRET, { expiresIn: "1h" });
      const refreshToken = jwt.sign({ id: user._id, phoneNumber: decodedToken.phone_number }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
      user.refreshToken = refreshToken;
      await user.save();
      const bname = user.businessName;
      console.log(bname, phoneNumber);
      res.json({ message: "Login successful", token, phoneNumber, bname,accessToken, refreshToken });
    } catch (err) {
      res.status(400).json({ message: "Invalid OTP", error: err.message });
    }
  };

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

      let refreshToken = null;
      // Create a new Business document
      const newBusiness = new Business({
        gstin,
        businessName,
        ownerName,
        contact,
        location,
        businessType,
        refreshToken
      });
  
      await newBusiness.save();
  
      // Generate a JWT token for the user
      const token = jwt.sign(
        { id: newBusiness._id, phoneNumber: newBusiness.contact },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      const accessToken = jwt.sign({ id: newBusiness._id, phoneNumber: newBusiness.contact }, process.env.JWT_SECRET, { expiresIn: "1h" });
      refreshToken = jwt.sign({ id: newBusiness._id, phoneNumber: newBusiness.contact }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

      newBusiness.refreshToken = refreshToken;
      await newBusiness.save();

      res.status(201).json({ message: "Signup successful", token, accessToken, refreshToken  });
    } catch (err) {
      console.error("Error during signup:", err);
      res.status(500).json({ message: "Signup failed", error: err.message });
    }
  };


  exports.refreshToken = async (req, res) => {
    const { refreshToken } = req.body;
    
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      const user = await Business.findById(decoded.id);
  
      if (!user || user.refreshToken !== refreshToken) {
        return res.status(401).json({ message: "Invalid refresh token" });
      }
  
      const newAccessToken = jwt.sign({ id: user._id,phoneNumber:decoded.phone_number  }, process.env.JWT_SECRET, { expiresIn: "1h" });
      const newRefreshToken = jwt.sign({ id: user._id,phoneNumber:decoded.phone_number }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
  
      user.refreshToken = newRefreshToken;
      await user.save();
  
      res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
    } catch (error) {
      res.status(401).json({ message: "Invalid refresh token" });
    }
  };
  

