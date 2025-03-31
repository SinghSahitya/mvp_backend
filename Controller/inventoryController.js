const mongoose = require('mongoose');
const Inventory = require("../models/Inventory");
const Business = require("../models/Business");
const Expense = require("../models/Expense")

exports.updateItemPricing = async (req, res) => {
    try {
      const { generalizedPrice, itemId } = req.body;
      console.log("Updating pricing:", generalizedPrice, itemId);
  
      // Validate input
      if (!itemId || generalizedPrice === undefined) {
        res.status(400);
        throw new Error("Missing item ID or generalized price value");
      }
  
      // Parse the price to ensure it's a number
      const parsedPrice = parseFloat(generalizedPrice);
      if (isNaN(parsedPrice)) {
        res.status(400);
        throw new Error("Invalid price value");
      }
  
      // Find and update the item
      const updatedItem = await Inventory.findByIdAndUpdate(
        itemId,
        { gen_price: parsedPrice },
        { new: true } // Return the updated document
      );
  
      console.log("PRICE UPDATED: ", updatedItem);
  
      if (!updatedItem) {
        res.status(404);
        throw new Error("Item not found");
      }
  
      res.status(200).json({
        success: true,
        item: updatedItem,
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  };
  

exports.fetchInventoryWithExpenseRate = async (req, res) => {
    try {
        const businessId = req.user.id;
        console.log('[DEBUG] Starting fetch for business:', businessId);

        // 1. Fetch inventory items with debugging
        const inventoryItems = await Inventory.find({ business: businessId });
        console.log('[DEBUG] Raw inventory items:', inventoryItems.map(i => i.name));
        const businessAccount = new mongoose.Types.ObjectId(businessId);
        // 2. Enhanced expense aggregation with case-insensitive matching
        const expenseRates = await Expense.aggregate([
            {
                $match: {
                    business_id: businessAccount
                }
            },
            {
                $addFields: {
                    cleanName: { $trim: { input: { $toLower: "$stock_item_name" } } }
                }
            },
            {
                $sort: { effective_date: -1 }
            },
            {
                $group: {
                    _id: "$cleanName",
                    lastRate: { $first: "$rate" },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    name: "$_id",
                    lastRate: 1,
                    count: 1
                }
            }
        ]);

        console.log('[DEBUG] Aggregated expense rates:', JSON.stringify(expenseRates, null, 2));

        // 3. Create normalized rate map
        const rateMap = {};
        expenseRates.forEach(doc => {
            const cleanKey = doc.name.trim().toLowerCase();
            rateMap[cleanKey] = doc.lastRate;
            console.log(`[DEBUG] Mapped ${cleanKey} => ${doc.lastRate} (${doc.count} entries)`);
        });

        // 4. Merge data with detailed matching logging
        const resultItems = inventoryItems.map(item => {
            const itemObj = item.toObject();
            const cleanName = itemObj.name.trim().toLowerCase();
            const matchedRate = rateMap[cleanName];
            
            console.log(`[MATCHING] Inventory item "${itemObj.name}" (clean: ${cleanName}) =>`, 
                matchedRate ? `Found rate ${matchedRate}` : 'No rate found');

            return {
                ...itemObj,
                lastBuyingPrice: matchedRate || '0',
                _id: itemObj._id.toString()
            };
        });

        console.log('[DEBUG] Final result items:', JSON.stringify(resultItems.slice(0, 3), null, 2));

        return res.status(200).json({
            message: "Inventory details with latest expense prices fetched successfully.",
            items: resultItems
        });

    } catch (error) {
        console.error("[ERROR] Failed to fetch inventory:", error);
        return res.status(500).json({ 
            message: "Internal server error",
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};



exports.updateInventoryItem = async (req, res) => {
    try {
    const { newStock, itemId } = req.body;
    console.log(newStock, itemId);
  // Validate input
  if (!itemId || newStock === undefined) {
    res.status(400);
    throw new Error("Missing item ID or new stock value");
  }

  // Find and update the item
  const updatedItem = await Inventory.findByIdAndUpdate(
    itemId,
    { qty: newStock },
    { new: true } // Return the updated document
  );
  console.log("TO UPDATE: ", updatedItem);
  if (!updatedItem) {
    res.status(404);
    throw new Error("Item not found");
  }

  res.status(200).json({
    success: true,
    item: updatedItem,
  });
        
    } catch (error) {
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
};


exports.deleteInventoryItem  = async (req, res) => {
    try {
        const { itemId } = req.params;
        console.log("DELETEING: ", itemId);
        // Validate input
        if (!itemId) {
          res.status(400);
          throw new Error("Item ID is required");
        }
      
        // Find and delete the item
        const deletedItem = await Inventory.findByIdAndDelete(itemId);
        console.log("TO DELETE: ", deletedItem);
        if (!deletedItem) {
          res.status(404);
          throw new Error("Item not found");
        }
      
        res.status(200).json({
          success: true,
          message: "Item deleted successfully",
        });
    } catch (error){
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
};