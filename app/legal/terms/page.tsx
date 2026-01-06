import { getActiveLegalDocument } from '@/lib/legal/documents'
import { Title, Content, UIText } from '@/components/ui'

export default async function TermsPage() {
  const terms = await getActiveLegalDocument('terms')

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <Title as="h1">Terms &amp; Conditions</Title>
      {terms ? (
        <>
          <UIText as="p" className="mt-2">
            Version {terms.version} &middot; Effective{' '}
            {new Date(terms.effective_date).toLocaleDateString()}
          </UIText>
          <div className="mt-6 space-y-4">
            {terms.content.split(/\n{2,}/).map((block, index) => (
              <Content as="p" key={index}>
                {block}
              </Content>
            ))}
          </div>
        </>
      ) : (
        <UIText as="p" className="mt-4">
          The Terms &amp; Conditions are currently unavailable.
        </UIText>
      )}
    </div>
  )
}


