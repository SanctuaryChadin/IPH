import transporter from './nodemailerClient.js'
import emailCases from './emailCases.js'
import path from 'path'
import { generateQR } from './generateQR.js'

export async function sendEmailByCase(emailCase, to, variables = {}) {
  const caseConfig = emailCases[emailCase]
  if (!caseConfig) {
    throw new Error(`Email case '${emailCase}' is not defined.`)
  }

  // Build attachments array for your CIDs (logo, icon, etc.)
  const attachments = [
    {
      filename: 'iphLogo.png',
      path: path.join(process.cwd(), 'public', 'image', 'iphLogo.png'),
      cid: 'iphLogo-image'
    }
  ]

  // If we have an icon in the case config
  if (caseConfig.icon_cid) {
    attachments.push({
      filename: `${caseConfig.icon_cid}.png`,
      path: path.join(process.cwd(), 'public', 'image', `${caseConfig.icon_cid}.png`),
      cid: caseConfig.icon_cid
    })
  }

  // Optionally generate a QR code if needed
  // e.g. if your case has 'requiresQr' or if variables include 'qrLink'
  let qrDataUrl = null
  if (caseConfig.requiresQr && variables.qrLink) {
    // 1) get base64 dataUrl
    const dataUrl = await generateQR(variables.qrLink)
    // dataUrl = "data:image/png;base64,iVBOR..."
  
    // 2) Convert base64 string to a Buffer
    const base64Image = dataUrl.split(';base64,').pop()  // remove the prefix
    const qrBuffer = Buffer.from(base64Image, 'base64')
  
    // 3) Add to attachments with cid: 'qr-code'
    attachments.push({
      filename: 'qr.png',
      content: qrBuffer,
      cid: 'qr-code'
    })
  }
  

  // Prepare the Handlebars context
  const context = {
    subject: caseConfig.subject,
    color: caseConfig.color || '#ffffff',
    icon_cid: caseConfig.icon_cid || 'checked',
    icon_alt: caseConfig.icon_alt || 'checked',
    title: caseConfig.title || '',
    qrData: qrDataUrl, // We'll use {{qrData}} in the .hbs template
    ...variables
  }

  const mailOptions = {
    from: `"Intania Production House" <${process.env.SENDER_EMAIL}>`,
    to,
    subject: caseConfig.subject,
    template: caseConfig.template, // e.g. 'reservation_request_accept'
    context,
    attachments
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    console.log(`Email sent to ${to}: ${info.messageId}`)
    return info
  } catch (error) {
    console.error(`Error sending email to ${to}`, error)
    throw error
  }
}
