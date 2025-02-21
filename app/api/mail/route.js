// app/api/mail/route.js
/*

//this service not open yet

import { NextResponse } from 'next/server'
import { sendEmailByCase } from '@/lib/email/sendEmail'

export async function POST(request) {
  try {
    // 1) Check the secret key
    const providedApiKey = request.headers.get('x-api-key')
    if (providedApiKey !== process.env.EMAIL_API_KEY) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 2) Parse JSON body
    const { emailCase, to, variables } = await request.json()

    // 3) Call the email function
    await sendEmailByCase(emailCase, to, variables)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in /api/mail route:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
*/