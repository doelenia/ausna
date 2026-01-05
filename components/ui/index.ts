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

