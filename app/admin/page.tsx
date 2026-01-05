import { requireAdmin } from '@/lib/auth/requireAdmin'
import { AdminTabs } from '@/components/admin/AdminTabs'
import { Title, UIText } from '@/components/ui'

export default async function AdminPage() {
  await requireAdmin()

  return (
    <>
      <div className="mb-8">
            <Title as="h1">Admin Console</Title>
            <UIText as="p" className="mt-2">
              Manage users, waitlist, notes, projects, and communities
            </UIText>
      </div>
      <AdminTabs />
    </>
  )
}

