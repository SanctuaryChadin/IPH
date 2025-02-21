// app/demo-page.js (example usage)
'use client'          // Because we’re using state and a client component
import React, { useState } from 'react'
import ReasonAndCheckPopup from '@/ui/ReasonAndCheckPopup'

export default function DemoPage() {
  const [showPopup, setShowPopup] = useState(false)

  function openPopup() {
    setShowPopup(true)
  }

  function handleConfirm(reason, isChecked) {
    console.log('User reason:', reason)
    console.log('Checkbox is checked:', isChecked)
    setShowPopup(false)
  }

  function handleCancel() {
    setShowPopup(false)
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Demo: Reason & Checkbox Popup</h2>
      <p>
        Click the button to open the popup. Type your reason, optionally check
        the box (which itself asks for confirmation), then confirm or cancel.
      </p>

      <button onClick={openPopup}>Open Popup</button>

      {/* The Popup */}
      <ReasonAndCheckPopup
        isOpen={showPopup}
        message="Please provide a reason and optionally check the box."
        checkboxLabel="Enable special option"
        checkMessage="Are you sure you want to check this box?"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  )
}
