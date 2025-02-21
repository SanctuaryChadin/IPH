// modules/emailService.js
import { sendEmailByCase } from '../lib/email/sendEmail.js';

export async function sendOtpEmail(toEmail, name, otpCode, refCode, deviceName, location) {
  const variables = {
    name,
    otpFirst: otpCode.slice(0, 3),
    otpSecond: otpCode.slice(3, 6),
    refCode,
    deviceName,
    locationName: location,
  };

  try {
    const info = await sendEmailByCase('otp_verification', toEmail, variables);
    // We can return { success: true } or pass along info
    return { success: true, info };
  } catch (error) {
    return { error };
  }
}

export async function sendRegOtpEmail(toEmail, name, otpCode, refCode, deviceName, location) {
  const variables = {
    name,
    otpFirst: otpCode.slice(0, 3),
    otpSecond: otpCode.slice(3, 6),
    refCode,
    deviceName,
    locationName: location,
  };

  try {
    const info = await sendEmailByCase('register_otp_verification', toEmail, variables);
    // We can return { success: true } or pass along info
    return { success: true, info };
  } catch (error) {
    return { error };
  }
}
