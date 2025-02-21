// ===============================================
// BanTableClient.jsx
// ===============================================
'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { searchBannedEmails, unbanEmail } from '@/app/(web)/(admin)/account/actions.js'

// Import your own popup components
import Popup from '@/ui/Popup.js'
import InformationPopup from '@/ui/InformationPopup.js'

/** 
 * Helper to format timestamps nicely
 */
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Button that on click, confirms "Unban email?",
 * calls `unbanEmail`, and shows loading state.
 */
function UnbanButton({ email, onShowInfo }) {
  const queryClient = useQueryClient()

  // Confirmation popup & loading state
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  function handleUnbanClick() {
    setShowConfirm(true)
  }

  async function doUnban() {
    setShowConfirm(false)
    setLoading(true)

    try {
      const result = await unbanEmail(email)
      if (result?.error) {
        onShowInfo({
          isError: true,
          message: `Failed to unban: ${result.error}`,
        })
      } else {
        onShowInfo({
          isError: false,
          message: `Successfully unbanned: ${email}`,
        })
        // Refresh the banned list after success
        queryClient.invalidateQueries(['bans'])
      }
    } catch (err) {
      onShowInfo({
        isError: true,
        message: `Failed to unban: ${err}`,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button onClick={handleUnbanClick} disabled={loading}>
        {loading ? 'Unbanning...' : 'Unban'}
      </button>

      {/* Replace old ConfirmPopup with your Popup */}
      <Popup
        isOpen={showConfirm}
        title="Confirm"
        confirmText="OK"
        cancelText="Cancel"
        onConfirm={doUnban}
        onCancel={() => setShowConfirm(false)}
      >
        <p>Unban "{email}"? Are you sure?</p>
      </Popup>
    </>
  )
}

/**
 * Main table client component:
 * - Fetches banned emails
 * - Displays them with "Unban" buttons
 * - The InfoPopup is rendered here at parent level
 */
export default function BanTableClient() {
  // Info popup state
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoTitle, setInfoTitle] = useState('')
  const [infoMessage, setInfoMessage] = useState('')

  // Called by child "UnbanButton" on success/error
  function handleShowInfo({ isError, message }) {
    setInfoTitle(isError ? 'Error' : 'Success')
    setInfoMessage(message)
    setInfoOpen(true)
  }

  const searchParams = useSearchParams()
  const filterBy = (searchParams.get('filterBy') || 'email').trim()
  const searchQuery = (searchParams.get('searchQuery') || '').trim().toLowerCase()
  const page = parseInt(searchParams.get('page') || '1', 10)

  // React Query fetch
  const { data } = useQuery({
    queryKey: ['bans', filterBy, searchQuery, page],
    queryFn: () => searchBannedEmails(filterBy, searchQuery, page),
    staleTime: 30_000, // 30s
    cacheTime: 30_000, // 30s
    suspense: true,
  })

  if (data.error) {
    // If there's a top-level error
    return (
      <tr>
        <td colSpan={4} style={{ color: 'red' }}>
          {data.error}
        </td>
      </tr>
    )
  }

  if (!data.bans || data.bans.length === 0) {
    return (
      <tr>
        <td colSpan={4}>No banned emails found.</td>
      </tr>
    )
  }

  return (
    <>
      {data.bans.map((ban) => (
        <tr key={ban.email}>
          <td>{ban.email}</td>
          <td>{ban.reason || ''}</td>
          <td>{formatDate(ban.timestamp)}</td>
          <td>
            <UnbanButton email={ban.email} onShowInfo={handleShowInfo} />
          </td>
        </tr>
      ))}

      {/* Replace old InfoPopup with your InformationPopup */}
      <InformationPopup
        isOpen={infoOpen}
        title={infoTitle}
        onClose={() => setInfoOpen(false)}
      >
        {/* If error => red; else => green. Or customize as you wish */}
        {infoTitle.toLowerCase().includes('error') ? (
          <p style={{ color: 'red' }}>{infoMessage}</p>
        ) : (
          <p style={{ color: 'green' }}>{infoMessage}</p>
        )}
      </InformationPopup>
    </>
  )
}
