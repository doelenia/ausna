import { requireAuth } from '@/lib/auth/requireAuth'
import { Title, Content } from '@/components/ui'
import { CreateActivityForm } from '@/components/portfolio/CreateActivityForm'

export default async function CreateSpacePage() {
  await requireAuth()

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <Title as="h1" className="mb-2">
        Create Space
      </Title>
      <Content className="mb-6">
        This creates the home space for your interest, project, event, or community. You can add posters, links,
        detailed descriptions, and follow-up updates later.
      </Content>
      <CreateActivityForm mode="space" />
    </div>
  )
}
