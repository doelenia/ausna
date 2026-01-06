import { getActiveLegalDocument } from '@/lib/legal/documents'
import { Title, Content, UIText } from '@/components/ui'

export default async function PrivacyPage() {
  const privacy = await getActiveLegalDocument('privacy')

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <Title as="h1">Privacy Policy</Title>
      {privacy ? (
        <>
          <UIText as="p" className="mt-2">
            Version {privacy.version} &middot; Effective{' '}
            {new Date(privacy.effective_date).toLocaleDateString()}
          </UIText>
          <div className="mt-6 space-y-4">
            {privacy.content.split(/\n{2,}/).map((block, index) => (
              <Content as="p" key={index}>
                {block}
              </Content>
            ))}
          </div>
        </>
      ) : (
        <UIText as="p" className="mt-4">
          The Privacy Policy is currently unavailable.
        </UIText>
      )}
    </div>
  )
}


