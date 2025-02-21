// app/protected/page.js

export default async function ProtectedPage() {
  // 3) If cookie is present, render the page
  return (
    <div style={{ padding: '1rem' }}>
      <h1>Protected Page</h1>
      <p>This is only shown if you have the deviceId cookie.</p>
    </div>
  );
}
