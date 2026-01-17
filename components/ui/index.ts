/**
 * UI Components - Reusable design system components
 * 
 * Import these components instead of using inline styles to ensure
 * consistent styling across the application. When you update styles
 * in these components, they automatically apply everywhere.
 * 
 * @example
 * import { Button, Card, Title, Content, UIText } from '@/components/ui'
 * 
 * <Button variant="primary">Click me</Button>
 * <Card variant="default">Content</Card>
 * <Title>Page Title</Title>
 * <Content>Body content</Content>
 * <UIText>UI element text</UIText>
 */

export { Button } from './Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button'

export { Card } from './Card'
export type { CardProps, CardVariant, CardPadding } from './Card'

export { Typography, Title, Subtitle, Content, UIText, UIButtonText } from './Typography'
export type { TypographyProps, TypographyVariant } from './Typography'

export { IconButton } from './IconButton'
export type { IconButtonProps } from './IconButton'

export { UserAvatar } from './UserAvatar'
export type { UserAvatarProps } from './UserAvatar'

export { Dropdown } from './Dropdown'
export type { DropdownProps, DropdownItem } from './Dropdown'

export { Skeleton, SkeletonAvatar, SkeletonText, SkeletonCard, SkeletonBanner } from './Skeleton'
export type { SkeletonProps, SkeletonAvatarProps, SkeletonTextProps, SkeletonCardProps, SkeletonBannerProps } from './Skeleton'

export { LazyLoad } from './LazyLoad'
export type { LazyLoadProps } from './LazyLoad'

