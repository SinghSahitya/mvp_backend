const crypto = require("crypto");

// ZEGOCLOUD credentials (replace with your actual App ID and Server Secret)
const APP_ID = process.env.ZEGOCLOUD_APP_ID; // Your ZEGOCLOUD App ID
const SERVER_SECRET = process.env.ZEGOCLOUD_SERVER_SECRET; // Your ZEGOCLOUD Server Secret

// Function to generate ZEGOCLOUD token
const generateZegoToken = (userID, expireTimeInSeconds = 3600) => {
  const payload = {
    app_id: Number(APP_ID),
    user_id: userID, // GSTIN used as user ID
    nonce: Math.floor(Math.random() * 1000000),
    ctime: Math.floor(Date.now() / 1000), // Current time in seconds
    expire: expireTimeInSeconds, // Token expiry time in seconds
  };

  const payloadString = JSON.stringify(payload);
  const hash = crypto.createHmac("sha256", SERVER_SECRET).update(payloadString).digest();
  const token = Buffer.concat([Buffer.from(payloadString), hash]).toString("base64");

  return token;
};

// Controller: Generate ZEGOCLOUD Token
exports.getZegoToken = (req, res) => {
  const { gstin } = req.body; // GSTIN as the unique user identifier

  if (!gstin) {
    return res.status(400).json({ success: false, message: "GSTIN is required." });
  }

  try {
    const token = generateZegoToken(gstin); // Generate token using GSTIN
    res.status(200).json({ success: true, token });
  } catch (error) {
    console.error("Error generating ZEGOCLOUD token:", error);
    res.status(500).json({ success: false, message: "Failed to generate token." });
  }
};

// Controller: Handle Voice Call
exports.handleVoiceCall = (req, res) => {
  const { callerGstin, receiverGstin, roomID } = req.body;

  if (!callerGstin || !receiverGstin || !roomID) {
    return res.status(400).json({
      success: false,
      message: "Caller GSTIN, Receiver GSTIN, and Room ID are required.",
    });
  }

  try {
    // You can log the call request here or save it in the database for tracking
    console.log(`Call initiated by ${callerGstin} to ${receiverGstin} in room ${roomID}`);

    res.status(200).json({
      success: true,
      message: `Call successfully initiated in room ${roomID}.`,
      data: {
        caller: callerGstin,
        receiver: receiverGstin,
        roomID,
      },
    });
  } catch (error) {
    console.error("Error handling voice call:", error);
    res.status(500).json({ success: false, message: "Failed to handle the call." });
  }
};
