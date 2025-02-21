// /components/login/LoginForm.js
"use client";

import React, { useState, useEffect } from "react";
import { useActionState } from "react";
import { loginWizardAction } from "@/app/(web)/(unauth)/login/actions.js";

export default function LoginForm() {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [refCode, setRefCode] = useState("");
  const [otpCode, setOtpCode] = useState("");

  // Basic client-side errors
  const [emailError, setEmailError] = useState("");
  const [otpError, setOtpError] = useState("");

  // 1) Single server action for all steps:
  const [wizardState, doWizardAction, wizardPending] = useActionState(
    loginWizardAction,
    {}
  );

  // 2) Handle server responses:
  useEffect(() => {
    if (!wizardState) return;

    if (wizardState.error) {
      alert(`Error: ${wizardState.error}`);
      // We do NOT change step if there's an error; user remains on the same form
    } else if (wizardState.ok) {
      // If we got "ok", see if we have new "step" or "refCode"
      if (wizardState.refCode) {
        setRefCode(wizardState.refCode);
      }
      if (wizardState.nextStep === "otp") {
        setStep("otp");
      } else if (wizardState.nextStep === "success") {
        alert("Login success");
        window.location.href = "/";
      }
    }
  }, [wizardState]);

  // 4) Basic client-side validation

  // Validate email onChange
  function handleEmailChange(e) {
    const val = e.target.value;
    setEmail(val);

    // Simple regex check for an email pattern
    if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setEmailError("Invalid email format");
    } else {
      setEmailError("");
    }
  }

  // Validate OTP onChange
  function handleOtpChange(e) {
    const val = e.target.value;

    // Only allow digits, up to 6 characters
    if (!/^\d{0,6}$/.test(val)) {
      // This means user typed a non-digit or more than 6
      setOtpError("OTP must be up to 6 digits (0-9 only)");
    } else {
      setOtpCode(val);
      setOtpError("");
    }
  }

  // ------------------------------------------------------------------
  // RENDER FORMS
  // ------------------------------------------------------------------
  if (step === "email") {
    return (
      <div>
        <h1>Login</h1>
        <form action={doWizardAction}>
          <input type="hidden" name="step" value="sendOtp" />

          <label>Email:</label>
          <input
            type="email"
            name="email"
            placeholder="Enter your email"
            value={email}
            onChange={handleEmailChange}
            required
          />
          {emailError && <p style={{ color: "red" }}>{emailError}</p>}

          <button
            type="submit"
            disabled={wizardPending || emailError || !email}
          >
            {wizardPending ? "Sending..." : "Send OTP"}
          </button>
        </form>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div>
        <h1>Verify OTP</h1>
        {/* refCode is displayed but not editable, since it's auto-generated. */}
        <p>RefCode: {refCode}</p>

        {/* VERIFY OTP */}
        <form action={doWizardAction}>
          <input type="hidden" name="step" value="verifyOtp" />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="refCode" value={refCode} />

          <label>OTP Code:</label>
          <input
            type="text"
            name="otpCode"
            value={otpCode}
            onChange={handleOtpChange}
            maxLength={6}
            required
          />
          {otpError && <p style={{ color: "red" }}>{otpError}</p>}

          <button
            type="submit"
            disabled={wizardPending || otpError || otpCode.length < 6}
          >
            {wizardPending ? "Verifying..." : "Verify"}
          </button>
        </form>

        {/* RESEND OTP */}
        <form action={doWizardAction}>
          <input type="hidden" name="step" value="resendOtp" />
          <input type="hidden" name="email" value={email} />

          <button
            type="submit"
            disabled={wizardPending}
          >
            {wizardPending ? "Resending..." : "Resend"}
          </button>
        </form>
      </div>
    );
  }

  return null;
}
