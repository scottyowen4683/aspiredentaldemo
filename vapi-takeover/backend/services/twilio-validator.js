// services/twilio-validator.js - Twilio Phone Number Validation
import twilio from 'twilio';
import logger from './logger.js';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// Initialize Twilio client if credentials are available
let twilioClient = null;
if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
}

/**
 * Validate that a phone number exists in your Twilio account
 * and can receive incoming calls/messages
 */
export async function validateTwilioNumber(phoneNumber) {
  try {
    // Check if Twilio is configured
    if (!twilioClient) {
      logger.error('Twilio not configured - cannot validate phone number');
      return {
        valid: false,
        error: 'Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.',
        number: phoneNumber
      };
    }

    // Normalize phone number format (E.164)
    const normalizedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    // Fetch incoming phone numbers from Twilio account
    const incomingPhoneNumbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: normalizedNumber
    });

    if (incomingPhoneNumbers.length === 0) {
      return {
        valid: false,
        error: `Phone number ${normalizedNumber} not found in your Twilio account. Please purchase this number first.`,
        number: normalizedNumber
      };
    }

    const number = incomingPhoneNumbers[0];

    // Check if number can handle voice calls
    if (!number.capabilities.voice) {
      return {
        valid: false,
        error: `Phone number ${normalizedNumber} does not have voice capabilities enabled`,
        number: normalizedNumber
      };
    }

    logger.info('Twilio number validated:', {
      number: normalizedNumber,
      sid: number.sid,
      capabilities: number.capabilities
    });

    return {
      valid: true,
      number: normalizedNumber,
      sid: number.sid,
      friendlyName: number.friendlyName,
      capabilities: number.capabilities,
      message: 'Phone number validated successfully'
    };

  } catch (error) {
    logger.error('Twilio validation error:', {
      error: error.message,
      number: phoneNumber
    });

    // Check for specific Twilio errors
    if (error.code === 20003) {
      return {
        valid: false,
        error: 'Invalid Twilio credentials. Please check your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
      };
    }

    if (error.code === 20404) {
      return {
        valid: false,
        error: `Phone number ${phoneNumber} not found in your Twilio account.`
      };
    }

    return {
      valid: false,
      error: `Twilio validation failed: ${error.message}`
    };
  }
}

/**
 * List all available phone numbers in Twilio account
 */
export async function listTwilioNumbers() {
  try {
    if (!twilioClient) {
      return {
        success: false,
        error: 'Twilio not configured',
        numbers: []
      };
    }

    const incomingPhoneNumbers = await twilioClient.incomingPhoneNumbers.list();

    const numbers = incomingPhoneNumbers.map(num => ({
      phoneNumber: num.phoneNumber,
      friendlyName: num.friendlyName,
      sid: num.sid,
      capabilities: num.capabilities,
      voiceUrl: num.voiceUrl,
      smsUrl: num.smsUrl
    }));

    logger.info('Twilio numbers listed:', { count: numbers.length });

    return {
      success: true,
      numbers
    };

  } catch (error) {
    logger.error('List Twilio numbers error:', error);
    return {
      success: false,
      error: error.message,
      numbers: []
    };
  }
}

/**
 * Configure webhooks for a Twilio phone number
 */
export async function configureTwilioWebhooks(phoneNumber, options) {
  try {
    if (!twilioClient) {
      throw new Error('Twilio not configured');
    }

    const { voiceUrl, statusCallbackUrl } = options;

    // Normalize phone number
    const normalizedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    // Find the phone number SID
    const numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: normalizedNumber
    });

    if (numbers.length === 0) {
      throw new Error(`Phone number ${normalizedNumber} not found`);
    }

    const numberSid = numbers[0].sid;

    // Update webhooks
    const updated = await twilioClient.incomingPhoneNumbers(numberSid).update({
      voiceUrl,
      voiceMethod: 'POST',
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: 'POST'
    });

    logger.info('Twilio webhooks configured:', {
      number: normalizedNumber,
      voiceUrl,
      statusCallbackUrl
    });

    return {
      success: true,
      number: normalizedNumber,
      voiceUrl: updated.voiceUrl,
      statusCallback: updated.statusCallback
    };

  } catch (error) {
    logger.error('Configure webhooks error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get full details about a Twilio phone number (all settings)
 */
export async function getPhoneNumberDetails(phoneNumber) {
  try {
    if (!twilioClient) {
      return { success: false, error: 'Twilio not configured' };
    }

    const normalizedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    // Find the phone number
    const numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: normalizedNumber
    });

    if (numbers.length === 0) {
      return {
        success: false,
        error: `Phone number ${normalizedNumber} not found in your Twilio account`
      };
    }

    const number = numbers[0];

    // Return ALL configuration details
    return {
      success: true,
      number: {
        sid: number.sid,
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName,
        accountSid: number.accountSid,
        // Voice configuration
        voiceUrl: number.voiceUrl,
        voiceMethod: number.voiceMethod,
        voiceFallbackUrl: number.voiceFallbackUrl,
        voiceFallbackMethod: number.voiceFallbackMethod,
        voiceCallerIdLookup: number.voiceCallerIdLookup,
        voiceApplicationSid: number.voiceApplicationSid, // Important! If set, overrides voiceUrl
        // Status callbacks
        statusCallback: number.statusCallback,
        statusCallbackMethod: number.statusCallbackMethod,
        // SMS configuration
        smsUrl: number.smsUrl,
        smsMethod: number.smsMethod,
        smsFallbackUrl: number.smsFallbackUrl,
        smsFallbackMethod: number.smsFallbackMethod,
        smsApplicationSid: number.smsApplicationSid,
        // Capabilities
        capabilities: number.capabilities,
        // Trunk/SIP
        trunkSid: number.trunkSid, // Important! If set, routes to SIP trunk instead of webhook
        // Other
        apiVersion: number.apiVersion,
        emergencyStatus: number.emergencyStatus,
        emergencyAddressSid: number.emergencyAddressSid,
        bundleSid: number.bundleSid,
        addressRequirements: number.addressRequirements,
        beta: number.beta,
        origin: number.origin,
        dateCreated: number.dateCreated,
        dateUpdated: number.dateUpdated
      }
    };
  } catch (error) {
    logger.error('Get phone number details error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clear any SIP trunk or TwiML app association and set direct webhook
 */
export async function resetPhoneNumberToWebhook(phoneNumber, webhookUrl, statusCallbackUrl) {
  try {
    if (!twilioClient) {
      return { success: false, error: 'Twilio not configured' };
    }

    const normalizedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    // Find the phone number
    const numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: normalizedNumber
    });

    if (numbers.length === 0) {
      return {
        success: false,
        error: `Phone number ${normalizedNumber} not found in your Twilio account`
      };
    }

    const numberSid = numbers[0].sid;

    // Update with explicit null for trunkSid and applicationSid to clear any associations
    const updated = await twilioClient.incomingPhoneNumbers(numberSid).update({
      voiceUrl: webhookUrl,
      voiceMethod: 'POST',
      voiceApplicationSid: '', // Clear TwiML app association
      trunkSid: '', // Clear SIP trunk association
      voiceFallbackUrl: '',
      voiceFallbackMethod: 'POST',
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: 'POST'
    });

    logger.info('Phone number reset to webhook:', {
      number: normalizedNumber,
      voiceUrl: updated.voiceUrl,
      clearedTrunk: !updated.trunkSid,
      clearedApp: !updated.voiceApplicationSid
    });

    return {
      success: true,
      number: normalizedNumber,
      voiceUrl: updated.voiceUrl,
      statusCallback: updated.statusCallback,
      trunkSid: updated.trunkSid || null,
      voiceApplicationSid: updated.voiceApplicationSid || null
    };
  } catch (error) {
    logger.error('Reset phone number error:', error);
    return { success: false, error: error.message };
  }
}

export default {
  validateTwilioNumber,
  listTwilioNumbers,
  configureTwilioWebhooks,
  getPhoneNumberDetails,
  resetPhoneNumberToWebhook
};
