import { SystemSettings, GeneralSettings, LotterySettings, UserSettings, WalletSettings, SecuritySettings } from '../types/settings';
import { api } from './api';

const DEFAULT_SETTINGS: SystemSettings = {
  general: {
    platformName: 'Lucky Lotto Play',
    companyName: 'Lucky Lotto Play',
    supportEmail: 'support@luckylottoplay.live',
    supportPhone: '+1 (555) 123-4567',
    websiteUrl: 'https://luckylottoplay.live',
    copyright: '© 2026 Lucky Lotto Play All rights reserved.',
    timezone: 'UTC',
    language: 'en',
    currency: 'Coins',
    dateFormat: 'YYYY-MM-DD',
    numberFormat: 'en-US',
    maintenanceMode: false,
    maintenanceMessage: 'System is under maintenance. We will be right back.',
  },
  lottery: {
    defaultCurrency: 'USD',
    ticketPurchaseLimit: 100,
    minTicketPrice: 2.00,
    maxTicketPrice: 100.00,
    jackpotRollOver: true,
    autoDraw: true,
    drawTimezone: 'UTC',
    resultPublishDelay: 15,
    winnerVerification: true,
    claimExpiryDays: 180,
    autoPrizeDistribution: false,
  },
  user: {
    registrationEnabled: true,
    emailVerification: true,
    phoneVerification: false,
    kycRequired: true,
    minimumAge: 18,
    referralSystem: true,
    affiliateProgram: true,
    vipProgram: true,
  },
  wallet: {
    minDeposit: 10.00,
    maxDeposit: 10000.00,
    minWithdrawal: 50.00,
    maxWithdrawal: 50000.00,
    dailyDepositLimit: 20000.00,
    dailyWithdrawalLimit: 100000.00,
    bonusWalletEnabled: true,
  },
  security: {
    jwtExpiryHours: 2,
    refreshTokenExpiryDays: 7,
    sessionTimeoutMinutes: 60,
    twoFactorAuth: true,
    deviceVerification: true,
    loginAlerts: true,
    rateLimiting: true,
    bruteForceProtection: true,
  },
};

// ── Service ────────────────────────────────────────────────────────────

export const settingsService = {
  async getSettings<K extends keyof SystemSettings>(category: K) {
    try {
      const response = await api.get<{ success: boolean; data: SystemSettings[K] }>(`/settings/${category}`);
      const serverData = response.data?.data;
      if (!serverData) {
        throw new Error(`Invalid settings payload received for ${category}`);
      }
      const defaultData = DEFAULT_SETTINGS[category];

      return {
        success: true,
        data: { ...defaultData, ...serverData } as SystemSettings[K]
      };
    } catch (error) {
      console.error(`Failed to load settings for ${category}:`, error);
      // F-02 Remediation: Distinguish loaded settings from fallback values;
      // Never mask errors with success: true and hardcoded security defaults.
      throw error;
    }
  },

  async updateSettings<K extends keyof SystemSettings>(category: K, data: SystemSettings[K]) {
    const response = await api.put<{ success: boolean; message: string; data: SystemSettings[K] }>(`/settings/${category}`, data);
    return response.data;
  },
};
