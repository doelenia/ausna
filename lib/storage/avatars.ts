// Server-side avatar functions have been moved to avatars-server.ts
// Client-side helpers have been moved to avatars-client.ts
// Import from the appropriate file based on your context:
// - Server components/actions: import from '@/lib/storage/avatars-server'
// - Client components: import from '@/lib/storage/avatars-client'

// Re-export for backward compatibility (but prefer importing from specific files)
export * from './avatars-server'
export * from './avatars-client'

