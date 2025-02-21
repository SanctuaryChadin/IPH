// lib/email/nodemailerClient.js

import nodemailer from 'nodemailer'
import hbs from 'nodemailer-express-handlebars'
import path from 'path'

/**
 * Create a nodemailer transporter using environment variables
 */
const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: {
    user: "alpha@intaniaproductionhouse.site",
    pass: "1]i0Lln!V"
  }
})

// Configure the handlebars plugin
const handlebarOptions = {
  viewEngine: {
    extname: '.hbs',
    layoutsDir: path.join(process.cwd(), 'lib', 'email', 'templates', 'layouts'),
    defaultLayout: 'main', // name of main layout file
    partialsDir: path.join(process.cwd(), 'lib', 'email', 'templates', 'partials')
  },
  viewPath: path.join(process.cwd(), 'lib', 'email', 'templates'),
  extName: '.hbs'
}

// Attach the Handlebars plugin to the transporter
transporter.use('compile', hbs(handlebarOptions))

export default transporter
