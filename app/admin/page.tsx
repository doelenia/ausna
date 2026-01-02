import { requireAdmin } from '@/lib/auth/requireAdmin'
import { AdminTabs } from '@/components/admin/AdminTabs'

export default async function AdminPage() {
  await requireAdmin()

  return (
    <>
      <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Admin Console</h1>
            <p className="mt-2 text-sm text-gray-600">
              Manage users, waitlist, notes, projects, and communities
            </p>
      </div>
      <AdminTabs />
    </>
  )
}

