'use client'

import { useState } from 'react'
import { Button, UIText } from '@/components/ui'
import { InviteContactDialog } from '@/components/contacts/InviteContactDialog'

interface ResendInviteDialogButtonProps {
  ownerUserId: string
  email: string
  name?: string | null
}

export function ResendInviteDialogButton({
  ownerUserId,
  email,
  name,
}: ResendInviteDialogButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <UIText>Resend invite</UIText>
      </Button>
      <InviteContactDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        ownerUserId={ownerUserId}
        initialEmail={email}
        initialName={name || undefined}
      />
    </>
  )
}

