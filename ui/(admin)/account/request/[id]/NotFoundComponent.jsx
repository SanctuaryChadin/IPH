'use client';
import InformationPopup from '@/ui/InformationPopup';
import { redirect } from 'next/navigation';

export default function NotFoundComponent() {
  return (
    <InformationPopup
      isOpen={true}
      title="Error"
      onClose={() => {
        redirect('/account/request');
      }}
    >
      {/* Children go here instead of `message` prop */}
      <p>Account not found or not pending.</p>
    </InformationPopup>
  )
}
