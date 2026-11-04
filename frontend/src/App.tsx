import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import Header from '@/components/Layout/Header'
import Footer from '@/components/Layout/Footer'
import ProtectedRoute from '@/components/Layout/ProtectedRoute'
import AdminRoute from '@/components/Layout/AdminRoute'
import MaintenanceGuard from '@/components/Layout/MaintenanceGuard'
import LoadingScreen from '@/components/UI/LoadingScreen'
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary'
import FloatingSupport from '@/components/common/FloatingSupport'

// ── Lazy-loaded pages ─────────────────────────────────────────────────────────
const HomePage = lazy(() => import('@/pages/HomePage'))
const GamesPage = lazy(() => import('@/pages/GamesPage'))
const ResultsPage = lazy(() => import('@/pages/ResultsPage'))
const JackpotsPage = lazy(() => import('@/pages/JackpotsPage'))
const PromotionsPage = lazy(() => import('@/pages/PromotionsPage'))

// Auth
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'))

// Games
const GameDetailPage = lazy(() => import('@/pages/games/GameDetailPage'))

// Wallet
const WalletDashboard = lazy(() => import('@/pages/wallet/WalletDashboard'))
const DepositPage = lazy(() => import('@/pages/wallet/DepositPage'))
const WithdrawPage = lazy(() => import('@/pages/wallet/WithdrawPage'))
const TransactionHistoryPage = lazy(() => import('@/pages/wallet/TransactionHistoryPage'))

// Tickets
const MyTicketsPage = lazy(() => import('@/pages/tickets/MyTicketsPage'))
const TicketDetailPage = lazy(() => import('@/pages/tickets/TicketDetailPage'))

// Profile
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'))
const SecurityPage = lazy(() => import('@/pages/profile/SecurityPage'))
const KYCPage = lazy(() => import('@/pages/profile/KYCPage'))
const NotificationSettingsPage = lazy(() => import('@/pages/profile/NotificationSettingsPage'))

// Notifications
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'))

// Affiliate
const AffiliateDashboard = lazy(() => import('@/pages/affiliate/AffiliateDashboard'))

// Support / CMS
const SupportPage = lazy(() => import('@/pages/support/SupportPage'))
const FAQPage = lazy(() => import('@/pages/cms/FAQPage'))
const ContactPage = lazy(() => import('@/pages/cms/ContactPage'))
const TermsPage = lazy(() => import('@/pages/cms/TermsPage'))
const PrivacyPage = lazy(() => import('@/pages/cms/PrivacyPage'))
const ResponsibleGamingPage = lazy(() => import('@/pages/cms/ResponsibleGamingPage'))

// Admin
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const AdminUsersPage = lazy(() => import('@/pages/admin/UsersPage'))
const AdminKYCPage = lazy(() => import('@/pages/admin/KYCPage'))
const AdminDrawsPage = lazy(() => import('@/pages/admin/DrawsAdminPage'))
const AdminWithdrawalsPage = lazy(() => import('@/pages/admin/WithdrawalsAdminPage'))
const AdminGamesPage = lazy(() => import('@/pages/admin/GamesAdminPage'))
const AdminWalletPage = lazy(() => import('@/pages/admin/WalletAdminPage'))
const AdminReportsPage = lazy(() => import('@/pages/admin/ReportsPage'))
const AdminCmsPage = lazy(() => import('@/pages/admin/CmsAdminPage'))
const AdminSupportPage = lazy(() => import('@/pages/admin/SupportAdminPage'))
const AdminAuditPage = lazy(() => import('@/pages/admin/AuditLogsPage'))
const AdminSettingsPage = lazy(() => import('@/pages/admin/SettingsPage'))
const AdminAffiliatesPage = lazy(() => import('@/pages/admin/AffiliatesAdminPage'))
const AdminJackpotPage = lazy(() => import('@/pages/admin/JackpotManagementPage'))

const PageLoader = () => (
  <LoadingScreen message="Loading Lucky Lotto Play..." />
)

export default function App() {
  const { theme } = useThemeStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className="app-root">
      <Header />
      <MaintenanceGuard>
        <GlobalErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
            {/* Public */}
            <Route path="/" element={<HomePage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/games/:slug" element={<GameDetailPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/jackpots" element={<JackpotsPage />} />
            <Route path="/promotions" element={<PromotionsPage />} />

            {/* Auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* CMS */}
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/responsible-gaming" element={<ResponsibleGamingPage />} />

            {/* Protected - User */}
            <Route element={<ProtectedRoute />}>
              <Route path="/wallet" element={<WalletDashboard />} />
              <Route path="/wallet/deposit" element={<DepositPage />} />
              <Route path="/wallet/withdraw" element={<WithdrawPage />} />
              <Route path="/wallet/transactions" element={<TransactionHistoryPage />} />
              <Route path="/tickets" element={<MyTicketsPage />} />
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/security" element={<SecurityPage />} />
              <Route path="/profile/kyc" element={<KYCPage />} />
              <Route path="/profile/notifications" element={<NotificationSettingsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/affiliate" element={<AffiliateDashboard />} />
              <Route path="/support" element={<SupportPage />} />
            </Route>

            {/* Protected - Admin */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/kyc" element={<AdminKYCPage />} />
              <Route path="/admin/draws" element={<AdminDrawsPage />} />
              <Route path="/admin/games" element={<AdminGamesPage />} />
              <Route path="/admin/wallet" element={<AdminWalletPage />} />
              <Route path="/admin/withdrawals" element={<AdminWithdrawalsPage />} />
              <Route path="/admin/reports" element={<AdminReportsPage />} />
              <Route path="/admin/cms" element={<AdminCmsPage />} />
              <Route path="/admin/support" element={<AdminSupportPage />} />
              <Route path="/admin/audit" element={<AdminAuditPage />} />
              <Route path="/admin/settings/*" element={<AdminSettingsPage />} />
              <Route path="/admin/affiliates" element={<AdminAffiliatesPage />} />
              <Route path="/admin/jackpot" element={<AdminJackpotPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </GlobalErrorBoundary>
      </MaintenanceGuard>
      <Footer />
      <FloatingSupport />
    </div>
  )
}
