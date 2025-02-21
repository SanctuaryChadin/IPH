// ui/ReasonAndCheckPopup.js
'use client'
import React, { useState } from 'react'
import { z } from 'zod'
import Popup from './Popup.js' // your generic popup

// Real-time validation schema for reason
const reasonSchema = z.object({
  reason: z.string().min(5, 'Reason must have at least 5 characters'),
})

export default function ReasonAndCheckPopup({
  isOpen,
  children,                // allow JSX for main popup content
  checkboxLabel,
  checkChildren,           // allow JSX for sub-popup content
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',

  // Button style overrides
  mainConfirmButtonStyle = {},
  mainCancelButtonStyle = {},

  // For the sub-popup confirm/cancel
  checkConfirmButtonStyle = {},
  checkCancelButtonStyle = {},

  // Container style overrides
  overlayStyle: userOverlayStyle = {},
  contentStyle: userContentStyle = {},
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isChecked, setIsChecked] = useState(false)

  // For sub-popup to confirm the checkbox
  const [showCheckPopup, setShowCheckPopup] = useState(false)

  if (!isOpen) return null

  // ──────────────────────────────────────────────────────────
  // 1) Real-time text area onChange => validate with Zod
  // ──────────────────────────────────────────────────────────
  function handleReasonChange(e) {
    const newReason = e.target.value
    setReason(newReason)

    // Live-validate as user types
    const parsed = reasonSchema.safeParse({ reason: newReason })
    if (!parsed.success) {
      setError(parsed.error.errors[0].message)
    } else {
      setError('')
    }
  }

  // ──────────────────────────────────────────────────────────
  // 2) When user toggles the checkbox
  // ──────────────────────────────────────────────────────────
  function handleCheckboxToggle(e) {
    const wantChecked = e.target.checked
    if (wantChecked) {
      setShowCheckPopup(true)
    } else {
      setIsChecked(false)
    }
  }

  function confirmCheck() {
    setIsChecked(true)
    setShowCheckPopup(false)
  }

  function cancelCheck() {
    setIsChecked(false)
    setShowCheckPopup(false)
  }

  // ──────────────────────────────────────────────────────────
  // 3) Main popup: Confirm => if valid, call onConfirm
  // ──────────────────────────────────────────────────────────
  function handleMainConfirm() {
    // Final check: if there's an error or reason is invalid
    const parsed = reasonSchema.safeParse({ reason })
    if (!parsed.success) {
      setError(parsed.error.errors[0].message)
      return
    }
    // If valid -> pass data up
    onConfirm(reason, isChecked)

    // Reset everything
    setReason('')
    setError('')
    setIsChecked(false)
    setShowCheckPopup(false)
  }

  // ──────────────────────────────────────────────────────────
  // 4) Main popup: Cancel => close but do NOT reset reason
  // ──────────────────────────────────────────────────────────
  function handleMainCancel() {
    setError('')
    setIsChecked(false)
    setShowCheckPopup(false)
    onCancel()
  }

  // Default styles (fallback) for overlay/content
  const defaultOverlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  }
  const defaultContentStyle = {
    background: '#fff',
    padding: '1.5rem',
    borderRadius: '4px',
    maxWidth: '600px',
    width: '100%',
  }

  // Default button styles
  const defaultCancelButtonStyle = {
    background: '#ccc',
    color: '#333',
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  }
  const defaultConfirmButtonStyle = {
    background: '#007bff',
    color: '#fff',
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  }

  return (
    <div style={{ ...defaultOverlayStyle, ...userOverlayStyle }}>
      <div style={{ ...defaultContentStyle, ...userContentStyle }}>
        {/* Instead of a simple message, we accept children */}
        <div style={{ marginBottom: '1rem' }}>
          {children}
        </div>

        {/* Reason text area with real-time validation */}
        <div style={{ marginBottom: '1rem' }}>
          <label>
            <textarea
              value={reason}
              onChange={handleReasonChange}
              rows={3}
              style={{ width: '100%', marginTop: '0.5rem' }}
            />
          </label>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>

        {/* Checkbox */}
        <div style={{ marginBottom: '1rem' }}>
          <label>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={handleCheckboxToggle}
            />
            {checkboxLabel}
          </label>
        </div>

        {/* Main popup buttons */}
        <div style={{ textAlign: 'right' }}>
          <button
            style={{ ...defaultCancelButtonStyle, ...mainCancelButtonStyle }}
            onClick={handleMainCancel}
          >
            {cancelText}
          </button>
          <button
            style={{ 
              ...defaultConfirmButtonStyle,
              marginLeft: '1rem',
              ...mainConfirmButtonStyle,
            }}
            onClick={handleMainConfirm}
          >
            {confirmText}
          </button>
        </div>

        {/* Sub-popup using the generic <Popup> to confirm checking */}
        <Popup
          isOpen={showCheckPopup}
          onConfirm={confirmCheck}
          onCancel={cancelCheck}
          confirmButtonStyle={checkConfirmButtonStyle}
          cancelButtonStyle={checkCancelButtonStyle}
        >
          {checkChildren || <p>Are you sure you want to check the box?</p>}
        </Popup>
      </div>
    </div>
  )
}