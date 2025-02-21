'use client' // Error boundaries must be Client Components

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Next.js will automatically show this component if
 * an unhandled error happens in (web)/(user)/layout.js or any child route.
 */
export default function Error({ error, reset }) {
  const router = useRouter();

  useEffect(() => {
    // Optionally log to an error reporting service
    console.error('[User layout error boundary]:', error);
  }, [error]);

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Access Error</h2>
      <p>
        {error?.message
          ? error.message
          : 'We encountered an unexpected issue. Please try again.'}
      </p>

      <div style={{ marginTop: '1rem' }}>
        <button
          style={{ marginRight: '1rem' }}
          onClick={() => {
            // Attempt to recover by re-rendering the segment
            reset();
          }}
        >
          Try Again
        </button>

        <button
          style={{ marginRight: '1rem' }}
          onClick={() => {
            // Return to home
            router.push('/');
          }}
        >
          Go Home
        </button>

        <button
          onClick={() => {
            // If you have a dedicated logout page or route:
            router.push('/logout');
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
