import type { Metadata } from 'next'
import './globals.css'
import { TopNav } from '@/components/main/TopNav'

export const metadata: Metadata = {
  title: 'Ausna - Creative Community',
  description: 'A community for creators to mobilize their network for their creative projects.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body className="light bg-white text-gray-900">
        <TopNav />
        {children}
      </body>
    </html>
  )
}

