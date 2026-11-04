// Shared TypeScript types for the Lucky Lotto Play frontend

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'AFFILIATE_MANAGER' | 'USER'
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'PENDING_VERIFICATION'
export type KYCStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED'
export type TicketStatus = 'ACTIVE' | 'CHECKED' | 'WON' | 'LOST' | 'CANCELLED' | 'EXPIRED'
export type DrawStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'FAILED'
export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'TICKET_PURCHASE' | 'PRIZE_CREDIT' | 'BONUS_CREDIT' | 'REFUND' | 'REFERRAL_BONUS' | 'AFFILIATE_COMMISSION'
export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REVERSED'
export type PaymentGateway = 'STRIPE' | 'PAYPAL' | 'BANK_TRANSFER' | 'CRYPTO'
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  username: string
  firstName: string
  lastName: string
  dateOfBirth?: string
  phone?: string
  role: UserRole
  status: UserStatus
  emailVerified: boolean
  twoFactorEnabled: boolean
  kycStatus: KYCStatus
  referralCode: string
  country?: string
  state?: string
  city?: string
  address?: string
  postcode?: string
  createdAt: string
  lastLoginAt?: string
  wallet?: WalletSummary
  roles?: any[]
}

export interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

// ── Wallet ────────────────────────────────────────────────────────────────────

export interface WalletSummary {
  balance: number
  bonusBalance: number
}

export interface Wallet {
  id: string
  balance: number
  bonusBalance: number
  pendingBalance: number
  currency: string
  totalDeposited: number
  totalWithdrawn: number
  totalWon: number
  totalSpent: number
}

export interface Transaction {
  id: string
  type: TransactionType
  status: TransactionStatus
  amount: number
  balanceBefore: number
  balanceAfter: number
  currency: string
  reference: string
  description?: string
  createdAt: string
}

export interface Deposit {
  id: string
  amount: number
  currency: string
  gateway: PaymentGateway
  gatewayRef?: string
  status: TransactionStatus
  processedAt?: string
  createdAt: string
}

export interface Withdrawal {
  id: string
  amount: number
  currency: string
  gateway: PaymentGateway
  status: TransactionStatus
  processedAt?: string
  createdAt: string
}

// ── Games ─────────────────────────────────────────────────────────────────────

export interface PrizeDivision {
  id: string
  divisionName: string
  divisionOrder: number
  description: string
  fixedPrize?: number
  isJackpot: boolean
  matchNumbers: number
  matchSupp: number
  matchPB: boolean
}

export interface Draw {
  id: string
  gameId: string
  drawNumber: number
  scheduledAt: string
  drawnAt?: string
  status: DrawStatus
  jackpotAmount: number
  totalSales: number
  totalPrizes: number
  winningNumbers?: number[]
  supplementary?: number[]
  powerball?: number
  isVerified: boolean
  publishedAt?: string
}

export interface Game {
  id: string
  slug: string
  name: string
  description: string
  shortDescription?: string
  rulesJson: Record<string, any>
  drawSchedule: string
  jackpotAmount: number
  minJackpot: number
  ticketPrice: number
  minNumbers: number
  maxNumbers: number
  numberPool: number
  hasSupplementary: boolean
  suppNumbers?: number
  suppPool?: number
  hasPowerball: boolean
  powerballPool?: number
  isActive: boolean
  isFeatured: boolean
  sortOrder: number
  imageUrl?: string
  bannerUrl?: string
  badgeText?: string
  prizeDivisions: PrizeDivision[]
  nextDraw?: Draw | null
  draws?: Draw[]
}

// ── Tickets ───────────────────────────────────────────────────────────────────

export interface TicketLine {
  lineIndex: number
  numbers: number[]
  supplementary?: number[]
  powerball?: number
}

export interface Ticket {
  id: string
  ticketNumber: string
  qrCode?: string
  status: TicketStatus
  isQuickPick: boolean
  isSystemEntry: boolean
  isSyndicate: boolean
  draws: number
  totalCost: number
  prizeAmount?: number
  prizeDivision?: string
  claimedAt?: string
  purchasedAt: string
  game: { name: string; slug: string; imageUrl?: string }
  draw?: Draw
  numbers: TicketLine[]
  winningEntries?: WinningEntry[]
}

export interface WinningEntry {
  divisionName: string
  prizeAmount: number
  isPaid: boolean
  paidAt?: string
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  data?: Record<string, any>
  isRead: boolean
  readAt?: string
  createdAt: string
}

export interface NotificationPreferences {
  emailDeposit: boolean
  emailWithdrawal: boolean
  emailTicket: boolean
  emailDraw: boolean
  emailWinning: boolean
  emailPromo: boolean
  inAppDeposit: boolean
  inAppWithdrawal: boolean
  inAppTicket: boolean
  inAppDraw: boolean
  inAppWinning: boolean
  inAppPromo: boolean
}

// ── Support ───────────────────────────────────────────────────────────────────

export interface SupportMessage {
  id: string
  senderId: string
  message: string
  isInternal: boolean
  createdAt: string
}

export interface SupportTicket {
  id: string
  subject: string
  category: string
  status: SupportTicketStatus
  priority: string
  createdAt: string
  updatedAt: string
  messages?: SupportMessage[]
}

// ── Affiliate ─────────────────────────────────────────────────────────────────

export interface AffiliateAccount {
  id: string
  affiliateCode: string
  commissionRate: number
  totalEarned: number
  totalPaid: number
  pendingAmount: number
  totalClicks: number
  totalSignups: number
  totalDeposits: number
  isActive: boolean
  referralCode: string
  referralLink: string
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number
  activeUsers: number
  pendingKYC: number
  pendingWithdrawals: number
  totalRevenue: number
  todayTickets: number
  activeSessions: number
}

// ── CMS ───────────────────────────────────────────────────────────────────────

export interface Banner {
  id: string
  title: string
  description?: string
  imageUrl: string
  mobileUrl?: string
  linkUrl?: string
  backgroundColor?: string
  position: string
  isActive: boolean
  sortOrder: number
}

export interface CmsPage {
  slug: string
  title: string
  content: string
  metaTitle?: string
  metaDesc?: string
}

export interface FAQ {
  id: string
  question: string
  answer: string
  category: string
  sortOrder: number
  isActive: boolean
}

// ── API Response ──────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  details?: unknown[]
  requiresTOTP?: boolean
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

// ── Purchase Flow ─────────────────────────────────────────────────────────────

export interface PurchasePayload {
  gameId: string
  drawId?: string
  lines: {
    numbers: number[]
    supplementary?: number[]
    powerball?: number
  }[]
  isQuickPick: boolean
  draws: number
  isSyndicate?: boolean
  syndicateId?: string
}
