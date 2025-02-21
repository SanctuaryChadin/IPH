// app/(web)/(admin)/account/create/page.jsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useActionState } from 'react';
import { z } from 'zod';
import Popup from '@/ui/Popup.js';
import InformationPopup from '@/ui/InformationPopup.js';
// or wherever your action is located
import { createPartnerAccount } from '../actions.js';

// The same Zod schema client side (or a subset)
const ClientPartnerSchema = z.object({
  clubName: z.string().min(1, 'Club Name required'),
  repName: z.string().min(1, 'Representative required'),
  partnerEmail: z.string().email('Invalid email format'),
  phone: z.string().regex(/^[0-9]{10}$/, 'Phone must be 10 digits'),
  point: z.coerce.number().min(0, 'Points must be >= 0'),
  line: z.string().min(1, 'Line ID required'),
});

export default function AccountCreatePage() {
  const formRef = useRef(null);

  // local states for fields
  const [fields, setFields] = useState({
    clubName: '',
    repName: '',
    partnerEmail: '',
    phone: '',
    point: '0',
    line: '',
  });

  // local error messages per field
  const [fieldErrors, setFieldErrors] = useState({
    clubName: '',
    repName: '',
    partnerEmail: '',
    phone: '',
    point: '',
    line: '',
  });

  // show/hide confirmation popup
  const [showPopup, setShowPopup] = useState(false);

  // For a global success/error info message from the server
  const [infoMessage, setInfoMessage] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);

  // useActionState => handle server results
  const [serverState, formAction, pending] = useActionState(createPartnerAccount, {});

  // ──────────────────────────────────────────────────────────
  // 1) Handle Server Response
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!serverState) return; // No submission yet

    if (serverState.ok === true) {
      // Success => show info popup & reset form
      setInfoMessage(`Partner Created! ID: ${serverState.accountId}`);
      setInfoOpen(true);

      // Clear form
      setFields({
        clubName: '',
        repName: '',
        partnerEmail: '',
        phone: '',
        point: '0',
        line: '',
      });
      setFieldErrors({
        clubName: '',
        repName: '',
        partnerEmail: '',
        phone: '',
        point: '',
        line: '',
      });
    } else if (serverState.ok === false) {
      // If the server provided field errors, show them below each field
      if (serverState.fieldErrors) {
        const newFE = { ...fieldErrors };
        for (const key of Object.keys(newFE)) {
          if (serverState.fieldErrors[key]) {
            newFE[key] = serverState.fieldErrors[key].join(', ');
          } else {
            newFE[key] = '';
          }
        }
        setFieldErrors(newFE);
        // Optionally show a generic message if you like
        setInfoMessage('Some fields had server-side errors. Please check.');
        setInfoOpen(true);
      }
      // If a global server error
      else if (serverState.error) {
        setInfoMessage(`Server Error: ${serverState.error}`);
        setInfoOpen(true);
      }
    }
  }, [serverState]);

  // ──────────────────────────────────────────────────────────
  // 2) Local validation (Zod) for immediate feedback
  // ──────────────────────────────────────────────────────────
  function validateField(field, value) {
    // shape must match exactly one field
    const partialShape = { [field]: ClientPartnerSchema.shape[field] };
    const partialSchema = z.object(partialShape);

    const result = partialSchema.safeParse({ [field]: value });
    if (!result.success) {
      return result.error.issues[0].message;
    }
    return ''; // no error
  }

  // ──────────────────────────────────────────────────────────
  // 3) Handle changes in any field
  // ──────────────────────────────────────────────────────────
  function handleChange(e) {
    const { name, value } = e.target;

    // run local validation for that single field
    const errMsg = validateField(name, value);

    setFields((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: errMsg }));
  }

  // ──────────────────────────────────────────────────────────
  // 4) "Create Partner" => first ensure no errors
  // ──────────────────────────────────────────────────────────
  function handleOpenPopup() {
    // Step A: re-validate *all* fields in case user typed something but didn't blur
    const newErrors = { ...fieldErrors };
    for (const key of Object.keys(fields)) {
      const value = fields[key].trim();
      // If empty, local check: required
      if (!value) {
        newErrors[key] = `${key} cannot be empty.`;
      } else {
        // Zod check
        const err = validateField(key, value);
        newErrors[key] = err;
      }
    }
    setFieldErrors(newErrors);

    // Step B: if any error remains, do not open popup
    const hasError = Object.values(newErrors).some((err) => err !== '');
    if (hasError) {
      // Optionally set a top-level message or just rely on inline errors:
      setInfoMessage('Please fix all errors before proceeding.');
      setInfoOpen(true);
      return;
    }

    // If we reach here, no errors => show confirmation popup
    setShowPopup(true);
  }

  // ──────────────────────────────────────────────────────────
  // 5) If user confirms in the popup => submit form
  // ──────────────────────────────────────────────────────────
  function handleConfirm() {
    setShowPopup(false);

    // Transfer fields to the hidden form, then submit
    if (formRef.current) {
      for (const [k, v] of Object.entries(fields)) {
        formRef.current[k].value = v;
      }
    }
    formRef.current?.requestSubmit(); // triggers formAction
  }

  function handleCancel() {
    setShowPopup(false);
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Create Partner Account</h2>

      {/* Our form calls the server action using formAction from useActionState */}
      <form ref={formRef} action={formAction}>
        <div>
          <label>Club Name</label>
          <input
            name="clubName"
            value={fields.clubName}
            onChange={handleChange}
          />
          {fieldErrors.clubName && (
            <p style={{ color: 'red' }}>{fieldErrors.clubName}</p>
          )}
        </div>

        <div>
          <label>Representative Person</label>
          <input
            name="repName"
            value={fields.repName}
            onChange={handleChange}
          />
          {fieldErrors.repName && (
            <p style={{ color: 'red' }}>{fieldErrors.repName}</p>
          )}
        </div>

        <div>
          <label>Partner Email</label>
          <input
            name="partnerEmail"
            type="email"
            value={fields.partnerEmail}
            onChange={handleChange}
          />
          {fieldErrors.partnerEmail && (
            <p style={{ color: 'red' }}>{fieldErrors.partnerEmail}</p>
          )}
        </div>

        <div>
          <label>Phone (10 digits)</label>
          <input
            name="phone"
            maxLength={10}
            value={fields.phone}
            onChange={handleChange}
          />
          {fieldErrors.phone && (
            <p style={{ color: 'red' }}>{fieldErrors.phone}</p>
          )}
        </div>

        <div>
          <label>Points</label>
          <input
            name="point"
            type="number"
            value={fields.point}
            onChange={handleChange}
          />
          {fieldErrors.point && (
            <p style={{ color: 'red' }}>{fieldErrors.point}</p>
          )}
        </div>

        <div>
          <label>Line</label>
          <input
            name="line"
            value={fields.line}
            onChange={handleChange}
          />
          {fieldErrors.line && (
            <p style={{ color: 'red' }}>{fieldErrors.line}</p>
          )}
        </div>

        {/* Instead of type="submit", we do a button that calls handleOpenPopup */}
        <button
          type="button"
          onClick={handleOpenPopup}
          disabled={pending}
        >
          {pending ? 'Creating...' : 'Create Partner'}
        </button>
      </form>

      {/* Confirmation Popup */}
      <Popup
        isOpen={showPopup}
        title="Confirm Creation"
        confirmText="Yes"
        cancelText="Cancel"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      >
        <p>
          Are you sure you want to create a partner account with email: 
          <strong> {fields.partnerEmail}</strong>?
        </p>
      </Popup>

      {/* Optional Info Popup for success/errors */}
      <InformationPopup
        isOpen={infoOpen}
        title="Notice"
        onClose={() => setInfoOpen(false)}
      >
        {/* If the message includes 'error', color red, else green */}
        {infoMessage.toLowerCase().includes('error') ? (
          <p style={{ color: 'red', whiteSpace: 'pre-wrap' }}>{infoMessage}</p>
        ) : (
          <p style={{ color: 'green', whiteSpace: 'pre-wrap' }}>{infoMessage}</p>
        )}
      </InformationPopup>
    </div>
  );
}
