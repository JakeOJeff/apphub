import {
  AppWindow,
  BarChart3,
  Box,
  Database,
  FileText,
  LayoutGrid,
  LayoutPanelLeft,
  MessageSquareText,
  Radio,
  Rocket,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; badge?: number; blurb: string }

export const mainNav: NavItem[] = [
  { to: '/overview', label: 'Overview', icon: LayoutPanelLeft, badge: 5, blurb: 'Everything happening across this app at a glance.' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, blurb: 'Events, retention, cohorts and custom reports.' },
  { to: '/growth', label: 'Growth', icon: Rocket, blurb: 'Links, coupons, referrals and campaigns.' },
  { to: '/revenue', label: 'Revenue', icon: Wallet, blurb: 'Subscriptions, renewals, refunds and MRR.' },
  { to: '/users', label: 'Users', icon: Users, blurb: 'Search users, see their journey and entitlements.' },
  { to: '/feedback', label: 'Feedback', icon: MessageSquareText, badge: 8, blurb: 'Reviews, in-app feedback and feature requests.' },
  { to: '/product', label: 'Product', icon: Box, badge: 4, blurb: 'Releases, flags and experiments.' },
  { to: '/status', label: 'Status', icon: Radio, badge: 2, blurb: 'Uptime, crashes and incident history.' },
  { to: '/database', label: 'Database', icon: Database, blurb: 'Browse this app’s Supabase tables.' },
  { to: '/apps', label: 'Apps', icon: AppWindow, blurb: 'Add apps and manage their Supabase connections.' },
  { to: '/platform', label: 'Platform', icon: SlidersHorizontal, badge: 1, blurb: 'API keys, SDKs, webhooks and team settings.' },
]

export const contentNav: NavItem[] = [
  { to: '/content/blog', label: 'Blog', icon: FileText, blurb: 'Write and publish posts to your app’s site.' },
  { to: '/content/whats-new', label: 'What’s New', icon: Sparkles, blurb: 'Release notes shown in-app after updates.' },
  { to: '/content/widgets', label: 'Widgets', icon: LayoutGrid, blurb: 'Embeddable banners, paywalls and prompts.' },
]

export const allNav = [...mainNav, ...contentNav]
