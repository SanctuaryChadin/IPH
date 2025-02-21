// ui/InformationPopup.js
'use client'
import React from 'react'

export default function InformationPopup({
  isOpen,
  title = 'Information',
  children,
  onClose,
  closeText = 'Close',

  // Style overrides
  overlayStyle: userOverlayStyle = {},
  contentStyle: userContentStyle = {},
  titleStyle = {},
  closeButtonStyle = {},
}) {
  if (!isOpen) return null

  // Default overlay/content styles
  const defaultOverlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  }
  const defaultContentStyle = {
    background: '#fff',
    padding: '1.5rem',
    borderRadius: '4px',
    minWidth: '300px',
    maxWidth: '600px',
  }
  const defaultTitleStyle = {
    margin: '0 0 1rem',
  }
  const defaultCloseButtonStyle = {
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
        <h2 style={{ ...defaultTitleStyle, ...titleStyle }}>{title}</h2>
        <div>{children}</div>
        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <button
            style={{ ...defaultCloseButtonStyle, ...closeButtonStyle }}
            onClick={onClose}
          >
            {closeText}
          </button>
        </div>
      </div>
    </div>
  )
}
