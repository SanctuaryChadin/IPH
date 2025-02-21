// lib/email/generateQR.js

import QRCode from 'qrcode'

/**
 * Generates a QR code from `link` and returns a dataURL (base64 PNG).
 */
export async function generateQR(link) {
  try {
    console.log('Generating QR for link:', link)
    const dataUrl = await QRCode.toDataURL(link, {
      errorCorrectionLevel: 'M', // or 'M'/'Q'/'H'
      margin: 1,
      scale: 16 // size
    })
    return dataUrl
  } catch (error) {
    console.error('Error generating QR code:', error)
    throw error
  }
}
