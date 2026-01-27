// services/twilio-service.js - Twilio Call Transfer and SMS Service
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
 * Transfer an active call to another phone number
 * This updates the live call to dial a new number
 *
 * @param {string} callSid - The CallSid of the call to transfer
 * @param {string} transferNumber - The phone number to transfer to (E.164 format)
 * @param {object} options - Additional options
 * @param {string} options.callerId - Caller ID to display (default: original caller)
 * @param {number} options.timeout - Ring timeout in seconds (default: 30)
 * @param {string} options.statusCallback - URL for status updates
 */
export async function transferCall(callSid, transferNumber, options = {}) {
  try {
    if (!twilioClient) {
      logger.error('Twilio not configured - cannot transfer call');
      return {
        success: false,
        error: 'Twilio credentials not configured'
      };
    }

    if (!callSid || !transferNumber) {
      return {
        success: false,
        error: 'Missing required parameters: callSid and transferNumber'
      };
    }

    // Normalize phone number to E.164 format
    const normalizedNumber = transferNumber.startsWith('+') ? transferNumber : `+${transferNumber}`;

    const {
      callerId = null,
      timeout = 30,
      statusCallback = null
    } = options;

    logger.info('Transferring call', {
      callSid,
      transferTo: normalizedNumber,
      timeout
    });

    // Create TwiML for transfer
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    // Add a brief message before transfer
    response.say({ voice: 'Polly.Joanna' }, 'Please hold while I transfer your call.');

    // Dial the transfer number
    const dial = response.dial({
      callerId: callerId || undefined,
      timeout: timeout,
      action: statusCallback || undefined,
      method: 'POST'
    });

    dial.number(normalizedNumber);

    // Update the call with new TwiML
    const updatedCall = await twilioClient.calls(callSid).update({
      twiml: response.toString()
    });

    logger.info('Call transfer initiated', {
      callSid,
      transferTo: normalizedNumber,
      status: updatedCall.status
    });

    return {
      success: true,
      callSid,
      transferTo: normalizedNumber,
      status: updatedCall.status
    };

  } catch (error) {
    logger.error('Call transfer error:', {
      error: error.message,
      callSid,
      transferNumber
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send an SMS notification
 *
 * @param {string} toNumber - Recipient phone number (E.164 format)
 * @param {string} message - SMS message content
 * @param {object} options - Additional options
 * @param {string} options.fromNumber - Sender phone number (must be Twilio number)
 */
export async function sendSMS(toNumber, message, options = {}) {
  try {
    if (!twilioClient) {
      logger.error('Twilio not configured - cannot send SMS');
      return {
        success: false,
        error: 'Twilio credentials not configured'
      };
    }

    if (!toNumber || !message) {
      return {
        success: false,
        error: 'Missing required parameters: toNumber and message'
      };
    }

    // Normalize phone number
    const normalizedTo = toNumber.startsWith('+') ? toNumber : `+${toNumber}`;
    const fromNumber = options.fromNumber || process.env.TWILIO_PHONE_NUMBER;

    if (!fromNumber) {
      return {
        success: false,
        error: 'No Twilio phone number configured. Set TWILIO_PHONE_NUMBER environment variable.'
      };
    }

    const normalizedFrom = fromNumber.startsWith('+') ? fromNumber : `+${fromNumber}`;

    logger.info('Sending SMS', {
      to: normalizedTo,
      from: normalizedFrom,
      messageLength: message.length
    });

    const smsResult = await twilioClient.messages.create({
      to: normalizedTo,
      from: normalizedFrom,
      body: message
    });

    logger.info('SMS sent successfully', {
      sid: smsResult.sid,
      to: normalizedTo,
      status: smsResult.status
    });

    return {
      success: true,
      sid: smsResult.sid,
      to: normalizedTo,
      from: normalizedFrom,
      status: smsResult.status
    };

  } catch (error) {
    logger.error('SMS send error:', {
      error: error.message,
      to: toNumber
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * End an active call
 *
 * @param {string} callSid - The CallSid of the call to end
 */
export async function endCall(callSid) {
  try {
    if (!twilioClient) {
      return { success: false, error: 'Twilio not configured' };
    }

    const updatedCall = await twilioClient.calls(callSid).update({
      status: 'completed'
    });

    logger.info('Call ended', { callSid, status: updatedCall.status });

    return {
      success: true,
      callSid,
      status: updatedCall.status
    };

  } catch (error) {
    logger.error('End call error:', { error: error.message, callSid });
    return { success: false, error: error.message };
  }
}

/**
 * Get call details
 *
 * @param {string} callSid - The CallSid to lookup
 */
export async function getCallDetails(callSid) {
  try {
    if (!twilioClient) {
      return { success: false, error: 'Twilio not configured' };
    }

    const call = await twilioClient.calls(callSid).fetch();

    return {
      success: true,
      call: {
        sid: call.sid,
        status: call.status,
        from: call.from,
        to: call.to,
        direction: call.direction,
        duration: call.duration,
        startTime: call.startTime,
        endTime: call.endTime
      }
    };

  } catch (error) {
    logger.error('Get call details error:', { error: error.message, callSid });
    return { success: false, error: error.message };
  }
}

export default {
  transferCall,
  sendSMS,
  endCall,
  getCallDetails
};
