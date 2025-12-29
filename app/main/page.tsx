// Force dynamic rendering to ensure fresh auth state
export const dynamic = 'force-dynamic'

export default async function MainPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
            Welcome to Ausna
          </h2>
          <p className="mt-4 text-xl text-gray-600">
            A community for creators to mobilize their network for their creative projects.
          </p>
        </div>
      </main>
    </div>
  )
}

