// app/(web)/(unauth)/register/page.js
"use client";

import React, { useState, useEffect } from "react";
import { useActionState } from "react";
import { registrationWizardAction } from "./actions"; // your server action

export default function RegisterWizardPage() {
  const [wizardStep, setWizardStep] = useState("collectInfo");

  const [form, setForm] = useState({
    email: "",
    name: "",
    address: "",
    phone: "",
    line: "",
    subdistric: "",
    distric: "",
    department: "",
    year: "",
    province: "",
    postCode: "",
  });

  const [refCode, setRefCode] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const [fieldErrors, setFieldErrors] = useState({
    email: "",
    name: "",
    address: "",
    phone: "",
    line: "",
    subdistric: "",
    distric: "",
    department: "",
    year: "",
    province: "",
    postCode: "",
  });
  const [otpError, setOtpError] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [wizardState, doWizardAction, wizardPending] = useActionState(
    registrationWizardAction,
    {}
  );

  function resetWizard() {
    setWizardStep("collectInfo");
    setErrorMsg("");
    setOtpError("");
    setFieldErrors({
      email: "",
      name: "",
      address: "",
      phone: "",
      line: "",
      subdistric: "",
      distric: "",
      department: "",
      year: "",
      province: "",
      postCode: "",
    });
    setForm({
      email: "",
      name: "",
      address: "",
      phone: "",
      line: "",
      subdistric: "",
      distric: "",
      department: "",
      year: "",
      province: "",
      postCode: "",
    });
    setRefCode("");
    setOtpCode("");
  }

  // ─────────────────────────────────────────────────────────────────
  // 1) SERVER RESPONSE HANDLING
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!wizardState) return;

    // 1) If we have "structured" errors => wizardState.errors
    if (wizardState.errors) {
      setErrorMsg("");
      setOtpError("");

      const nextFieldErrors = { ...fieldErrors };
      for (const key of Object.keys(nextFieldErrors)) {
        if (
          wizardState.errors[key] &&
          wizardState.errors[key].length > 0
        ) {
          nextFieldErrors[key] = wizardState.errors[key].join(", ");
        } else {
          nextFieldErrors[key] = "";
        }
      }
      if (wizardState.errors.otpCode) {
        setOtpError(wizardState.errors.otpCode.join(", "));
      }

      // ─────────────────────────────────────────────────────────────────
      // NEW LINES: Check wizardState.errors._global for maxAttempt or "no user data"
      // ─────────────────────────────────────────────────────────────────
      if (wizardState.errors._global && wizardState.errors._global.length > 0) {
        const globalMsg = wizardState.errors._global.join(", ");
        if (globalMsg.includes("Max attempts reached")) {
          alert("OTP failed too many times. Returning to Step 1.");
          resetWizard();
          return;
        }
        if (
          globalMsg.includes("no user data was ever stored") ||
          globalMsg.includes("No registration OTP record found")
        ) {
          alert("OTP failed you must verify in 5 minute. Returning to Step 1.");
          resetWizard();
          return;
        }
        // If it doesn't match those, just show it as a normal global error
        setErrorMsg(globalMsg);
      }

      setFieldErrors(nextFieldErrors);
      return;
    }

    // 2) If we have a single string error => wizardState.error
    if (wizardState.error) {
      const serverErr = wizardState.error.toString() || "no user data was ever stored";
      if (serverErr.includes("Max attempts reached")) {
        alert("OTP failed too many times. Returning to Step 1.");
        resetWizard();
        return;
      }
      if (
        serverErr.includes("no user data was ever stored") ||
        serverErr.includes("No registration OTP record found for this device/email")
      ) {
        alert("OTP failed you must verify in 5 minute. Returning to Step 1.");
        resetWizard();
        return;
      }
      // Otherwise show as global
      setErrorMsg(serverErr);
      return;
    }

    // 3) If success
    if (wizardState.ok) {
      setErrorMsg("");
      setOtpError("");
      setFieldErrors({
        email: "",
        name: "",
        address: "",
        phone: "",
        line: "",
        subdistric: "",
        distric: "",
        department: "",
        year: "",
        province: "",
        postCode: "",
      });

      if (wizardState.nextStep === "otp") {
        setWizardStep("otp");
        if (wizardState.refCode) {
          setRefCode(wizardState.refCode);
        }
      } else if (wizardState.nextStep === "success") {
        setWizardStep("success");
      }
    }
  }, [wizardState]);

  // ─────────────────────────────────────────────────────────────────────
  // 2) LOCAL VALIDATION (Step 1) onChange
  // ─────────────────────────────────────────────────────────────────────
  // We do live validation in handleFormChange. If any field has an error, we store it in `fieldErrors`.
  function handleFormChange(field, value) {
    // Update form
    const newForm = { ...form, [field]: value };
    setForm(newForm);

    // Clear existing error for that field
    const newFieldErrors = { ...fieldErrors, [field]: "" };

    // Validate that single field
    if (field === "email") {
      if (!value.trim()) {
        newFieldErrors.email = "Email is required";
      } else if (!value.endsWith("chula.ac.th")) {
        newFieldErrors.email = "Email must be in chula.ac.th domain";
      }
    } else if (field === "name") {
      if (!value.trim()) {
        newFieldErrors.name = "Name is required";
      }
    } else if (field === "address") {
      if (!value.trim()) {
        newFieldErrors.address = "Address is required";
      }
    } else if (field === "phone") {
      if (!/^[0-9]{10}$/.test(value)) {
        newFieldErrors.phone = "Phone must be 10 digits";
      }
    } else if (field === "line") {
      if (!value.trim()) {
        newFieldErrors.line = "Line ID is required";
      }
    } else if (field === "subdistric") {
      if (!value.trim()) {
        newFieldErrors.subdistric = "Subdistric is required";
      }
    } else if (field === "distric") {
      if (!value.trim()) {
        newFieldErrors.distric = "District is required";
      }
    } else if (field === "department") {
      if (!value.trim()) {
        newFieldErrors.department = "Department is required";
      }
    } else if (field === "year") {
      if (!/^[1-8]$/.test(value)) {
        newFieldErrors.year = "Year must be 1-8";
      }
    } else if (field === "province") {
      if (!value.trim()) {
        newFieldErrors.province = "Province is required";
      }
    } else if (field === "postCode") {
      if (!/^[0-9]{5}$/.test(value)) {
        newFieldErrors.postCode = "Post Code must be 5 digits";
      }
    }

    setFieldErrors(newFieldErrors);
  }

  // If any field has a stored error => return true
  function anyErrorExists() {
    return Object.values(fieldErrors).some((errMsg) => errMsg);
  }

  // If any required field is empty => incomplete
  function isFormIncomplete() {
    const requiredFields = [
      "email",
      "name",
      "address",
      "phone",
      "line",
      "subdistric",
      "distric",
      "department",
      "year",
      "province",
      "postCode",
    ];
    for (const f of requiredFields) {
      if (!form[f].trim()) return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3) Step 1: "Collect Info"
  // ─────────────────────────────────────────────────────────────────────
  function renderCollectInfoForm() {
    return (
      <div>
        <h3>Registration Step 1</h3>

        {/* 
          We'll let Next handle the actual submission if the button is not disabled.
        */}
        <form action={doWizardAction}>
          <input type="hidden" name="step" value="collectInfo" />

          <div style={{ marginBottom: "1rem" }}>
            <label>Email (@chula.ac.th):</label>
            <input
              type="email"
              name="email"
              required
              value={form.email}
              onChange={(e) => handleFormChange("email", e.target.value)}
            />
            {fieldErrors.email && (
              <p style={{ color: "red" }}>{fieldErrors.email}</p>
            )}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label>Name:</label>
            <input
              type="text"
              name="name"
              required
              value={form.name}
              onChange={(e) => handleFormChange("name", e.target.value)}
            />
            {fieldErrors.name && (
              <p style={{ color: "red" }}>{fieldErrors.name}</p>
            )}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label>Address:</label>
            <textarea
              name="address"
              required
              value={form.address}
              onChange={(e) => handleFormChange("address", e.target.value)}
            />
            {fieldErrors.address && (
              <p style={{ color: "red" }}>{fieldErrors.address}</p>
            )}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label>Phone (10 digits):</label>
            <input
              type="tel"
              name="phone"
              maxLength={10}
              required
              value={form.phone}
              onChange={(e) => handleFormChange("phone", e.target.value)}
            />
            {fieldErrors.phone && (
              <p style={{ color: "red" }}>{fieldErrors.phone}</p>
            )}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label>Line ID:</label>
            <input
              type="text"
              name="line"
              required
              value={form.line}
              onChange={(e) => handleFormChange("line", e.target.value)}
            />
            {fieldErrors.line && (
              <p style={{ color: "red" }}>{fieldErrors.line}</p>
            )}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label>Subdistric:</label>
            <input
              type="text"
              name="subdistric"
              required
              value={form.subdistric}
              onChange={(e) => handleFormChange("subdistric", e.target.value)}
            />
            {fieldErrors.subdistric && (
              <p style={{ color: "red" }}>{fieldErrors.subdistric}</p>
            )}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label>District:</label>
            <input
              type="text"
              name="distric"
              required
              value={form.distric}
              onChange={(e) => handleFormChange("distric", e.target.value)}
            />
            {fieldErrors.distric && (
              <p style={{ color: "red" }}>{fieldErrors.distric}</p>
            )}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label>Department:</label>
            <select
              name="department"
              required
              value={form.department}
              onChange={(e) => handleFormChange("department", e.target.value)}
            >
              <option value="" disabled>
                Select Department
              </option>
              <option value="1">Chemical Engineering</option>
              <option value="2">Civil Engineering</option>
              <option value="3">Computer Engineering</option>
              <option value="4">Electrical Engineering</option>
              <option value="5">Environmental Engineering</option>
              <option value="6">Industrial Engineering</option>
              <option value="7">International School of Engineering</option>
              <option value="8">Mechanical Engineering</option>
              <option value="9">Mining and Petroleum Engineering</option>
              <option value="10">Nuclear Engineering</option>
              <option value="11">Survey Engineering</option>
              <option value="12">Water Resources Engineering</option>
              <option value="13">Engineering</option>
            </select>
            {fieldErrors.department && (
              <p style={{ color: "red" }}>{fieldErrors.department}</p>
            )}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label>Year (1-8):</label>
            <select
              name="year"
              required
              value={form.year}
              onChange={(e) => handleFormChange("year", e.target.value)}
            >
              <option value="" disabled>
                Select Year
              </option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
              <option value="5">5th Year</option>
              <option value="6">6th Year</option>
              <option value="7">7th Year</option>
              <option value="8">8th Year</option>
            </select>
            {fieldErrors.year && (
              <p style={{ color: "red" }}>{fieldErrors.year}</p>
            )}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label>Province:</label>
            <input
              type="text"
              name="province"
              required
              value={form.province}
              onChange={(e) => handleFormChange("province", e.target.value)}
            />
            {fieldErrors.province && (
              <p style={{ color: "red" }}>{fieldErrors.province}</p>
            )}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label>Post Code (5 digits):</label>
            <input
              type="text"
              name="postCode"
              maxLength={5}
              required
              value={form.postCode}
              onChange={(e) => handleFormChange("postCode", e.target.value)}
            />
            {fieldErrors.postCode && (
              <p style={{ color: "red" }}>{fieldErrors.postCode}</p>
            )}
          </div>

          {/* Submit button is disabled if local errors or incomplete fields */}
          <button
            type="submit"
            disabled={wizardPending || anyErrorExists() || isFormIncomplete()}
          >
            {wizardPending ? "Sending..." : "Submit Registration"}
          </button>
        </form>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4) Step 2: "OTP"
  // ─────────────────────────────────────────────────────────────────────
  function renderOtpForm() {
    function handleOtpChange(e) {
      setOtpCode(e.target.value);
      setOtpError("");
    }

    return (
      <div>
        <h3>Registration Step 2: OTP</h3>
        {/* Show the email from step 1 so user sees which email is being verified */}
        <p>Email: {form.email}</p>
        <p>RefCode: {refCode}</p>

        {/* VERIFY OTP */}
        <form action={doWizardAction}>
          <input type="hidden" name="step" value="verifyOtp" />
          <input type="hidden" name="refCode" value={refCode} />
          <input type="hidden" name="email" value={form.email} />

          <label>OTP Code (6 digits):</label>
          <input
            type="text"
            name="otpCode"
            maxLength={6}
            required
            value={otpCode}
            onChange={handleOtpChange}
          />
          {otpError && <p style={{ color: "red" }}>{otpError}</p>}

          <button
            type="submit"
            disabled={
              wizardPending ||
              otpError ||
              otpCode.length < 6
            }
          >
            {wizardPending ? "Verifying..." : "Verify OTP"}
          </button>
        </form>

        <hr />

        {/* RESEND OTP */}
        <form action={doWizardAction}>
          <input type="hidden" name="step" value="resendOtp" />
          <input type="hidden" name="email" value={form.email} />

          <button type="submit" disabled={wizardPending}>
            {wizardPending ? "Resending..." : "Resend OTP"}
          </button>
        </form>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5) If success => final screen
  // ─────────────────────────────────────────────────────────────────────
  if (wizardStep === "success") {
    return (
      <div>
        <h1>Registration Complete</h1>
        <p>Your account is pending admin approval.</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // 6) Render
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div>
      <h1>Create IPH Account (Wizard in One Page)</h1>

      {/* Global error if not a field error */}
      {errorMsg && <p style={{ color: "red" }}>{errorMsg}</p>}

      {wizardStep === "collectInfo" && renderCollectInfoForm()}
      {wizardStep === "otp" && renderOtpForm()}
    </div>
  );
}
