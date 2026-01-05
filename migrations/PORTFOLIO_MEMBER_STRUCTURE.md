# Portfolio Member Structure Documentation

## Overview

This document describes the role-based member structure for project and community portfolios. This structure was implemented to provide clear permissions and responsibilities for different types of users.

## Role Structure

### Roles

1. **Creator** (`portfolio.user_id`)
   - The user who created the portfolio
   - Can delete the portfolio
   - Can perform all actions (edit, manage pinned items, assign managers, etc.)
   - Automatically assigned as a manager when the portfolio is created

2. **Manager** (`metadata.managers` array)
   - Users assigned to manage the portfolio
   - Can change pinned items
   - Can edit basic info (name, description, avatar)
   - Can assign other managers (future feature)
   - Can invite or remove accounts (future feature)
   - Can perform all actions **except delete**
   - Must be account user IDs (not portfolio IDs)

3. **Member** (`metadata.members` array)
   - Users who are members of the portfolio
   - Can only post notes
   - Must be account user IDs (not portfolio IDs)

## Metadata Structure

### Project Portfolio Metadata

```typescript
interface ProjectPortfolioMetadata extends PortfolioMetadata {
  members: string[]      // Array of user IDs (includes creator)
  managers: string[]     // Array of user IDs (creator is automatically included)
  // ... other fields
}
```

### Community Portfolio Metadata

```typescript
interface CommunityPortfolioMetadata extends PortfolioMetadata {
  members: string[]      // Array of user IDs (includes creator)
  managers: string[]     // Array of user IDs (creator is automatically included)
  // ... other fields
}
```

## Initial Assignment

When a project or community portfolio is created:
- Creator is automatically added to `metadata.members` array
- Creator is automatically added to `metadata.managers` array
- Creator remains as `portfolio.user_id` (the creator)

## Permissions

### Permission Helpers

The following helper functions are available in `lib/portfolio/helpers.ts`:

- `isPortfolioCreator(portfolioId, userId)` - Checks if user is the creator
- `isPortfolioManager(portfolioId, userId)` - Checks if user is in managers array
- `isPortfolioMember(portfolioId, userId)` - Checks if user is in members array
- `canEditPortfolio(portfolioId, userId)` - Returns true if creator or manager
- `canDeletePortfolio(portfolioId, userId)` - Returns true only if creator
- `canManagePinned(portfolioId, userId)` - Returns true if creator or manager

### Permission Matrix

| Action | Creator | Manager | Member |
|--------|---------|---------|--------|
| Delete Portfolio | ✅ | ❌ | ❌ |
| Edit Portfolio | ✅ | ✅ | ❌ |
| Manage Pinned Items | ✅ | ✅ | ❌ |
| Assign Managers | ✅ | ✅ (future) | ❌ |
| Invite/Remove Accounts | ✅ | ✅ (future) | ❌ |
| Post Notes | ✅ | ✅ | ✅ |

## Changes from Previous Structure

### Removed Features

1. **Hosts Field**: The `hosts` field has been completely removed from project and community portfolios
   - Previously: `metadata.hosts` contained an array of portfolio IDs
   - Now: No hosts concept exists

2. **Navigation Tab**: Projects and communities no longer show a "Navigations" tab in the "View All" page
   - Only human portfolios show the "Involvement" tab

3. **Create Buttons**: Projects and communities can no longer create sub-portfolios
   - Only human portfolios can create projects and communities

### Updated Features

1. **Pinned Items Selection**:
   - For projects/communities: Managers can select notes assigned to the portfolio
   - For human portfolios: Can select portfolios where user is manager or member

2. **Involvement Display**:
   - Human portfolios show projects and communities where the user is a manager or member
   - Role badges (Manager/Member) are displayed for each portfolio

3. **Members Display**:
   - Shows Creator, Managers, and Members separately
   - Role badges indicate the role of each user

## Migration

The migration `add_managers_to_portfolios.sql`:
1. Adds `managers` array to existing project/community portfolios (initialized with creator's user_id)
2. Removes `hosts` field from all project/community portfolios
3. Updates metadata structure comments

## Examples

### Checking Permissions

```typescript
import { canEditPortfolio, canDeletePortfolio, canManagePinned } from '@/lib/portfolio/helpers'

// Check if user can edit
const canEdit = await canEditPortfolio(portfolioId, userId)

// Check if user can delete (only creator)
const canDelete = await canDeletePortfolio(portfolioId, userId)

// Check if user can manage pinned items
const canManage = await canManagePinned(portfolioId, userId)
```

### Getting User's Role

```typescript
import { isPortfolioCreator, isPortfolioManager, isPortfolioMember } from '@/lib/portfolio/helpers'

const isCreator = await isPortfolioCreator(portfolioId, userId)
const isManager = await isPortfolioManager(portfolioId, userId)
const isMember = await isPortfolioMember(portfolioId, userId)
```

## Future Features

The following features are planned but not yet implemented:
- Assign managers (managers can assign other managers)
- Invite accounts (managers can invite users to become members)
- Remove accounts (managers can remove members)

## Notes

- All managers and members must be account user IDs (not portfolio IDs)
- The hosts field concept is completely removed
- Navigation section (sub-portfolios tab) is removed for projects/communities
- Only human portfolios show the "Involvement" tab
- Managers are assigned automatically to creator when portfolio is created


