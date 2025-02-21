// ui/Popup.js
'use client'
import React from 'react'

export default function Popup({
  isOpen,
  children,              // allow JSX instead of just a message
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  title = 'Confirmation Needed',

  // Style overrides
  overlayStyle: userOverlayStyle = {},
  contentStyle: userContentStyle = {},
  confirmButtonStyle = {},
  cancelButtonStyle = {},
  titleStyle = {},
}) {
  if (!isOpen) return null

  // Default overlay/content styles
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
    maxWidth: '400px',
    width: '100%',
  }
  const defaultTitleStyle = {
    margin: '0 0 1rem',
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
        <h3 style={{ ...defaultTitleStyle, ...titleStyle }}>{title}</h3>
        <div>{children}</div>

        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <button
            style={{ ...defaultCancelButtonStyle, ...cancelButtonStyle }}
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            style={{ 
              ...defaultConfirmButtonStyle, 
              marginLeft: '1rem',
              ...confirmButtonStyle,
            }}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
