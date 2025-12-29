# Portfolio Routing Architecture

## Overview

The portfolio system uses a **unified route structure** that supports multiple portfolio types while maintaining extensibility for future types and subtypes.

## Route Structure

### Base Routes

- **Index/Search**: `/portfolio` - Browse and search all portfolios
- **Individual Portfolio**: `/portfolio/[type]/[id]` - View a specific portfolio

### Examples

```
/portfolio                          # Browse all portfolios
/portfolio?type=human               # Filter by type
/portfolio?q=designer               # Search portfolios
/portfolio/human/123e4567-e89b...  # View human portfolio by ID
/portfolio/projects/my-project-slug # View project portfolio by slug
/portfolio/discussion/abc123        # View discussion portfolio
```

## Adding New Portfolio Types

### 1. Update Type Definitions

Add the new type to `types/portfolio.ts`:

```typescript
export type PortfolioType = 'human' | 'projects' | 'discussion' | 'newtype'

export interface NewTypePortfolioMetadata {
  // Define type-specific fields
  custom_field?: string
}
```

### 2. Update Database

Add the new type to the enum in Supabase:

```sql
ALTER TYPE portfolio_type ADD VALUE 'newtype';
```

### 3. Update Route Utilities

The route utilities (`lib/portfolio/routes.ts`) will automatically support the new type if you add it to the `PortfolioType` union.

## Future: Supporting Subtypes

For hierarchical types (e.g., `human/designer`, `projects/web`), you can extend the route structure:

### Option 1: Nested Routes
```
/portfolio/[type]/[subtype]/[id]
```

### Option 2: Type in Metadata
Keep current structure and store subtype in metadata:
```typescript
{
  type: 'human',
  metadata: {
    subtype: 'designer',
    // ...
  }
}
```

## Type Safety

All routes use TypeScript type guards and validation:

- `parsePortfolioRoute()` - Validates route parameters
- `isValidPortfolioType()` - Type guard for portfolio types
- Type-specific interfaces ensure compile-time safety

## Database Schema

The `portfolios` table uses:
- **Single table** with `type` discriminator
- **JSONB metadata** for type-specific fields
- **Full-text search** across all fields
- **GIN indexes** for efficient JSONB queries

See `migrations/create_portfolios_table.sql` for the complete schema.

