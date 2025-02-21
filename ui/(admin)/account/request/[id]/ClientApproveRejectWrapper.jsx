// ui/(admin)/account/request/[id]/ClientApproveRejectWrapper.jsx
'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { approveAccount, rejectAccount } from '@/app/(web)/(admin)/account/actions';
import ReasonAndCheckPopup from '@/ui/ReasonAndCheckPopup.js';
import InformationPopup from '@/ui/InformationPopup.js';
import { useRouter } from 'next/navigation';

export default function ClientApproveRejectWrapper({ account }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // 1) Admin note for both approving & rejecting
  const [adminNote, setAdminNote] = useState(account.note || ''); 
  // 2) We show/hide the "Reject Reason" popup
  const [showReasonPopup, setShowReasonPopup] = useState(false);
  // 3) If success/error => show info popup
  const [infoMessage, setInfoMessage] = useState(null);

  const [isLoading, setIsLoading] = useState(false);

  // ──────────────────────────────────────────
  // Approve => call server action
  // Pass "adminNote" as the second argument
  // ──────────────────────────────────────────
  async function handleApprove() {
    setIsLoading(true);
    const result = await approveAccount(account.id, adminNote);
    if (result?.error) {
      setInfoMessage(`Error: ${result.error}`);
    } else {
      setInfoMessage(`Approved user: ${account.email}`);
    }
    setIsLoading(false);
  }
  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ──────────────────────────────────────────
  // Reject => open the ReasonAndCheckPopup
  // ──────────────────────────────────────────
  function openRejectPopup() {
    setShowReasonPopup(true);
  }

  // Confirm reject => we get (reason, banChecked) 
  // But we also have adminNote in local state.
  async function confirmReject(reason, banChecked) {
    setShowReasonPopup(false);

    // server action => pass (id, note, reason, ban?)
    setIsLoading(true);
    const result = await rejectAccount(account.id, adminNote, reason, banChecked);
    if (result?.error) {
      setInfoMessage(`Reject Error: ${result.error}`);
    } else {
      setInfoMessage(`Rejected user: ${account.email}`);
    }
    setIsLoading(false);
  }

  // Cancel => just close popup
  function cancelReject() {
    setShowReasonPopup(false);
  }

  // ──────────────────────────────────────────
  // Close info => go back to /account/request
  // ──────────────────────────────────────────
  function closeInfo() {
    queryClient.invalidateQueries({ queryKey: ['pendingAccounts'] });
    setInfoMessage(null);
    router.push('/account/request');
  }

  // ──────────────────────────────────────────
  // Render the entire form
  // ──────────────────────────────────────────
  return (
    <div style={{ padding: '1rem' }}>
      <h3>Manage Pending Account: {account.id}</h3>

      <table style={{ marginBottom: '1rem' }}>
        <tbody>
          <tr>
            <td><strong>Email:</strong></td>
            <td>{account.email}</td>
          </tr>
          <tr>
            <td><strong>Name:</strong></td>
            <td>{account.name}</td>
          </tr>
          <tr>
            <td><strong>Department:</strong></td>
            <td>{account.departmentName || '(none)'}</td>
          </tr>
          <tr>
            <td><strong>Year:</strong></td>
            <td>{account.year || '(unknown)'}</td>
          </tr>
          <tr>
            <td><strong>Phone:</strong></td>
            <td>{account.phone}</td>
          </tr>
          <tr>
            <td><strong>Line ID:</strong></td>
            <td>{account.lineId}</td>
          </tr>
          <tr>
            <td><strong>Address:</strong></td>
            <td>{account.address}</td>
          </tr>
          <tr>
            <td><strong>Created At:</strong></td>
            <td>{formatDate(account.createAt)}</td>
          </tr>
        </tbody>
      </table>

      {/* Admin note input: might be appended or override, depending on your server code */}
      <div style={{ marginBottom: '1rem' }}>
        <label>Admin Note (for Approve or added to Reject):</label>
        <br />
        <textarea
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          rows={3}
          style={{ width: '100%', marginTop: '0.5rem' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button onClick={handleApprove} disabled={isLoading}>Approve</button>
        <button onClick={openRejectPopup} disabled={isLoading}>Reject</button>
      </div>

      {/* REASON & BAN POPUP for REJECT */}
      <ReasonAndCheckPopup
  isOpen={showReasonPopup}
  checkboxLabel="Ban this email?"
  onConfirm={confirmReject}
  onCancel={cancelReject}
  // sub-popup content:
  checkChildren={<p>Are you sure you want to ban this email?</p>}
>
  {/* main popup content instead of `message` prop */}
  <p>Rejecting {account.email}. Please provide reason:</p>
</ReasonAndCheckPopup>


{/* Info popup for success/error */}
<InformationPopup
  isOpen={!!infoMessage}
  title="Result"
  onClose={closeInfo}
>
  {/* If the infoMessage contains 'error', color red; otherwise color green */}
  {infoMessage && infoMessage.toLowerCase().includes('error')
    ? <p style={{ color: 'red' }}>{infoMessage}</p>
    : <p style={{ color: 'green' }}>{infoMessage}</p>
  }
</InformationPopup>

    </div>
  );
}
