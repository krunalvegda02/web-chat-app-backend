import Setting from '../models/setting.model.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * Get global pricing settings
 * Default fallback if not found: textCost=5, mediaCost=20
 */
export const getGlobalPricing = async (req, res) => {
  try {
    let pricingSetting = await Setting.findOne({ key: 'MESSAGE_PRICING' });
    
    if (!pricingSetting) {
      pricingSetting = {
        value: {
          textCost: 5,
          mediaCost: 20,
          textTranslationCost: 10,
          voiceCost: 15,
          voiceTranslationCost: 25,
        }
      };
    }
    
    return successResponse(res, pricingSetting.value, 'Pricing fetched successfully');
  } catch (error) {
    console.error('Error fetching global pricing:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Update global pricing settings
 */
export const updateGlobalPricing = async (req, res) => {
  try {
    const { textCost, mediaCost, textTranslationCost, voiceCost, voiceTranslationCost } = req.body;
    
    if (textCost === undefined || mediaCost === undefined) {
      return errorResponse(res, 'textCost and mediaCost are required', 400);
    }
    
    const value = {
      textCost: Number(textCost),
      mediaCost: Number(mediaCost),
      textTranslationCost: textTranslationCost !== undefined ? Number(textTranslationCost) : 10,
      voiceCost: voiceCost !== undefined ? Number(voiceCost) : 15,
      voiceTranslationCost: voiceTranslationCost !== undefined ? Number(voiceTranslationCost) : 25,
    };
    
    const pricingSetting = await Setting.findOneAndUpdate(
      { key: 'MESSAGE_PRICING' },
      { 
        value,
        updatedBy: req.user._id,
        description: 'Global cost for messages in ChatCoins'
      },
      { new: true, upsert: true }
    );
    
    return successResponse(res, pricingSetting.value, 'Pricing updated successfully');
  } catch (error) {
    console.error('Error updating global pricing:', error);
    return errorResponse(res, error.message, 500);
  }
};
