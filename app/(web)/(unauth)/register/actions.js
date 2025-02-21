// app/(web)/(unauth)/register/actions.js
"use server";

import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import { UAParser } from "ua-parser-js"; 
import { queueEmailTask } from '@/modules/taskServices.js';
import { validateAndSanitize } from "@/modules/sanitizeService.js";
import { sendRegOtp, validateRegOtp } from "@/modules/registrationOtpService.js";
import { createPendingUser, checkIfEmailExists } from "@/modules/userService.js";
import { getOrResetDeviceId } from "@/modules/deviceIdService.js";
import { z } from "zod";

export async function registrationWizardAction(_, formData) {
  try {
    const rawData = Object.fromEntries(formData); // or convert if needed
    const step = rawData.step;
    if (!step) {
      return { error: "Missing step in registration wizard." };
    }

    let chosenSchema;
    switch (step) {
      case "collectInfo":
        chosenSchema = collectInfoSchema;
        break;
      case "resendOtp":
        chosenSchema = resendOtpSchema;
        break;
      case "verifyOtp":
        chosenSchema = verifyOtpSchema;
        break;
      default:
        return { error: `Unknown step: ${step}` };
    }

    const { valid, data, errors } = validateAndSanitize(rawData, chosenSchema);
if (!valid) {
  // Return a structured format
  return {
    ok: false,
    errors // This is already a per-field object, e.g. { email: ["..."], phone: ["..."] }
  };
}

    // Grab headers & cookies
    const [headersList, cookieStore] = await Promise.all([
      nextHeaders(),
      nextCookies(),
    ]);

    // user IP
    let userIp =
      headersList.get("x-real-ip") ||
      headersList.get("x-forwarded-for") ||
      "127.0.0.1";
    if (userIp.includes(",")) {
      userIp = userIp.split(",")[0].trim();
    }
    console.log(userIp);

    // userAgent
    const [userAgentString,approxLocation,deviceIdObj] = 
    await Promise.all([getUserAgentString(headersList),
      getIpLocation(userIp),getOrResetDeviceId(cookieStore, userIp)
    ]);
    const deviceId = deviceIdObj.deviceId;

    switch (data.step) {
      case "collectInfo": {
        // Check if email is available
        try {
          const isFree = await checkIfEmailExists(data.email);
          // if it returns true => good
        } catch (err) {
          return { error: err.message };
        }

        // Build userData object
        // If your DB uses departmentId, you can map it. 
        // For example:
        // const deptId = MAP_DEPARTMENT_STRING_TO_ID[data.department]
        // We'll just store the text for now, or do it in createPendingUser
        const userData = {
          email: data.email,
          name: data.name,
          phone: data.phone,
          line: data.line,
          address: data.address,
          subdistric: data.subdistric,
          distric: data.distric,
          // In your new DB, department is an integer. But if you prefer, do that mapping later.
          department: data.department, 
          year: data.year,
          province: data.province,
          postCode: data.postCode,
        };

        // Send OTP => store userData in Redis
        const otpRes = await sendRegOtp(
          userData,
          data.email,
          deviceId,
          data.name,           // userName for email
          userAgentString,     // deviceName 
          approxLocation       // locationName
        );
        if (otpRes.error) {
          return { error: otpRes.error[1] };
        }

        return {
          ok: true,
          nextStep: "otp",
          refCode: otpRes.refCode
        };
      }

      case "resendOtp": {
        // We do NOT overwrite user data, so pass an empty object
        const otpRes = await sendRegOtp(
          {},
          data.email,
          deviceId,
          "",                  // userName
          userAgentString,     // deviceName
          approxLocation       // location
        );
        if (otpRes.error) {
          return { error: otpRes.error[1] };
        }
        return { ok: true, nextStep: "otp", refCode: otpRes.refCode };
      }

      case "verifyOtp": {
        // Validate the OTP => get user data
        const valRes = await validateRegOtp(
          data.email,
          deviceId,
          data.refCode,
          data.otpCode
        );
        if (valRes.error) {
          return { error: valRes.error[1] };
        }
        if (!valRes.userData) {
          return { error: "No user data found. Possibly a mismatch or expired record." };
        }

        // Insert user in DB => role='pending'
        // We do the department mapping now if needed:
        // For example:
        //   const deptId = MAP_DEPARTMENT_STRING_TO_ID[valRes.userData.department];
        //   const yearInt = parseInt(valRes.userData.year, 10) || 1;
        //   ...
        // but for demonstration, we'll pass the string. 
        try {
          await createPendingUser(valRes.userData); 
        } catch (err) {
          return { error: `DB Error: ${err.message}` };
        }
        function getEngineeringLabel(valueStr) {
          const engineeringMap = {
            "1":  "Chemical Engineering",
            "2":  "Civil Engineering",
            "3":  "Computer Engineering",
            "4":  "Electrical Engineering",
            "5":  "Environmental Engineering",
            "6":  "Industrial Engineering",
            "7":  "International School of Engineering",
            "8":  "Mechanical Engineering",
            "9":  "Mining and Petroleum Engineering",
            "10": "Nuclear Engineering",
            "11": "Survey Engineering",
            "12": "Water Resources Engineering",
            "13": "Engineering"
          };
          
          return engineeringMap[valueStr] || "Unknown";
        }
        const combinedAddress = [
          valRes.userData.address,
          valRes.userData.subdistric,
          valRes.userData.distric,
          valRes.userData.province,
          valRes.userData.postCode
        ].join(", ");
        try {
          await queueEmailTask({
            email_case: 'register_pending',
            recipient: valRes.userData.email,
            variables: {
              name: valRes.userData.name,
              tel: valRes.userData.phone,
              lineId: valRes.userData.line,
              departmentYear: getEngineeringLabel(valRes.userData.department)+"#"+valRes.userData.year,
              address: combinedAddress,
            }
          });
        } catch (err) {
        }

        return { ok: true, nextStep: "success" };
      }

      default:
        return { error: "Unhandled step." };
    }
  } catch (err) {
    return { error: err.message || "Something went wrong." };
  }
}


// ========== Zod Schemas ==========

const collectInfoSchema = z.object({
  step: z.literal("collectInfo"),
  email: z
    .string()
    .email()
    .refine((v) => v.endsWith("chula.ac.th"), { message: "Must be in chula.ac.th domain" }),
  name: z.string().min(1, "Name is required"),
  phone: z.string().regex(/^[0-9]{10}$/, "Personal Phone must be 10 digits"),
  line: z.string().min(1),
  address: z.string().min(5),
  subdistric: z.string().min(1),
  distric: z.string().min(1),
  department: z.string().min(1),
  year: z.string().regex(/^[1-8]$/),
  province: z.string().min(2),
  postCode: z.string().regex(/^[0-9]{5}$/),
});

const resendOtpSchema = z.object({
  step: z.literal("resendOtp"),
  email: z.string().email(),
});

const verifyOtpSchema = z.object({
  step: z.literal("verifyOtp"),
  email: z.string().email(),
  refCode: z.string().min(1),
  otpCode: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});


// --------------
// Helpers
// --------------
async function getUserAgentString(headersList) {
  const rawUA = headersList.get("user-agent") || "UnknownAgent";
  const parser = new UAParser(rawUA);
  const { model } = parser.getDevice();
  const { name: osName, version: osVersion } = parser.getOS();
  const { name: browserName } = parser.getBrowser();

  const userAgent = [model || "", osName || "", osVersion || "", browserName || ""]
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");
  return userAgent;
}

// A minimal getIpLocation
async function getIpLocation(ip) {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`,{ cache: 'force-cache' });
    if (!res.ok) {
      console.log('ipapi not ok');
      return "Unknown location";
    }
    const data = await res.json();
    if (data?.city && data?.country_name) {
      return `${data.city}, ${data.country_name}`;
    }
    return "Unknown location";
  } catch (error) {
    console.error("Error fetching IP location:", error);
    return "Unknown location";
  }
}
