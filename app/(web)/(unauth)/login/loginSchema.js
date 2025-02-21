import { z } from "zod";

// Step: "sendOtp" => requires an email
export const sendOtpSchema = z.object({
  step: z.literal("sendOtp"),
  email: z.string().email({ message: "Invalid email format" }),
});

// Step: "resendOtp" => also just needs email
export const resendOtpSchema = z.object({
  step: z.literal("resendOtp"),
  email: z.string().email({ message: "Invalid email format" }),
});

// Step: "verifyOtp" => requires email, refCode, and otpCode
export const verifyOtpSchema = z.object({
  step: z.literal("verifyOtp"),
  email: z.string().email({ message: "Invalid email format" }),
  refCode: z
    .string()
    .regex(/^[A-Za-z0-9]{8}$/, {
      message: "RefCode must be exactly 8 alphanumeric characters",
    }),

  otpCode: z
    .string()
    .regex(/^[0-9]{6}$/, {
      message: "OTP code must be exactly 6 digits (0-9)",
    }),
});
