import { NextRequest, NextResponse } from 'next/server';

export async function GET(request) {
  // 1) Check if the cookie already exists
  const existingCookie = request.cookies.get('cookieIds');

  if (!existingCookie) {
    // 2) If no cookie, set a new one
    const response = NextResponse.json(
      { message: 'Cookie was missing. Setting a new one!' },
      { status: 200 }
    );

    response.cookies.set('cookieIds', 'someRandomValue', {
      httpOnly: true,
      secure: true,
      path: '/',
      maxAge: 24 * 60 * 60, // 1 day (in seconds)
    });

    return response;
  } else {
    // 3) If cookie already exists, just return its value
    return NextResponse.json(
      {
        message: 'Cookie found!',
        cookieValue: existingCookie.value,
      },
      { status: 200 }
    );
  }
}
