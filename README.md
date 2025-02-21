# IPH
IPH Reservation System Next.js
![image](https://github.com/user-attachments/assets/acaa0940-8ff3-479c-bf03-7357512ed5eb)
Non uploading file
.next
node_modules
.env

Varible in .env are secret 
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SENDER_NAME
SENDER_EMAIL
ADMIN_EMAIL
EMAIL_API_KEY
DEVICE_ID_SECRET
DEVICE_ID_ENCRYPT
SECRET_COOKIE_ID
SESSION_SECRET

{
  "name": "iph",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "packageManager": "npm@10.8.2",
  "overrides": {
    "react": "$react",
    "react-dom": "$react-dom"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.64.0",
    "@tanstack/react-query-devtools": "^5.64.0",
    "clsx": "^2.1.1",
    "dayjs": "^1.11.13",
    "dotenv": "^16.4.7",
    "handlebars": "^4.7.8",
    "ioredis": "^5.4.2",
    "next": "^15.1.1-canary.22",
    "nodemailer": "^6.9.16",
    "nodemailer-express-handlebars": "^7.0.0",
    "pg": "^8.13.1",
    "qrcode": "^1.5.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sanitize-html": "^2.14.0",
    "ua-parser-js": "^2.0.0",
    "use-debounce": "^10.0.4",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3",
    "eslint": "^9",
    "eslint-config-next": "15.1.2",
    "postcss": "^8",
    "tailwindcss": "^3.4.1"
  }
}


