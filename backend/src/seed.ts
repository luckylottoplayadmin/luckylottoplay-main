/**
 * Database Seed Script
 * Seeds all 9 global lottery games with rules, prize divisions,
 * upcoming draws, admin user, settings, FAQs, and CMS pages
 */

import { PrismaClient, UserRole } from '@prisma/client'
import argon2 from 'argon2'
import * as dotenv from 'dotenv'
import * as path from 'path'
import crypto from 'crypto'

dotenv.config({ path: path.resolve(__dirname, '.env') })

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // ── Admin User ───────────────────────────────────────────────────────────────
  const adminPassword = process.env.ADMIN_SEED_PASSWORD
  if (!adminPassword || adminPassword.length < 16 || adminPassword === 'Admin@123456') {
    throw new Error('ADMIN_SEED_PASSWORD must be explicitly set to a strong password of at least 16 characters')
  }
  

  const adminPasswordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
  })

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { email: 'admin@megadraw.com' },
    create: {
      email: 'admin@megadraw.com',
      username: 'admin',
      passwordHash: adminPasswordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      kycStatus: 'APPROVED',
      wallet: { create: { balance: 0 } },
      notificationPrefs: { create: {} },
    },
  })
  console.log('✅ Admin user created:', admin.email)

  // ── Games ───────────────────────────────────────────────────────────────────
  const gamesData = [
    {
      slug: 'megadraw',
      name: 'MegaDraw',
      description: 'The world\'s biggest national Tuesday night lottery. Pick 7 numbers from 1–47.',
      shortDescription: 'Pick 7 numbers for a chance to win Tuesday\'s jackpot!',
      drawSchedule: '0 20 * * 2', // Tuesday 8pm
      jackpotAmount: 5_000_000,
      minJackpot: 2_000_000,
      ticketPrice: 1.35,
      minNumbers: 7,
      maxNumbers: 7,
      numberPool: 47,
      hasSupplementary: true,
      suppNumbers: 2,
      suppPool: 47,
      hasPowerball: false,
      isFeatured: true,
      sortOrder: 1,
      badgeText: 'TUESDAY NIGHT',
      rulesJson: {
        minAge: 18,
        maxLines: 50,
        maxDraws: 10,
        systemEntries: true,
        description: 'Select 7 numbers from 1 to 47. The draw produces 7 winning numbers and 2 supplementary numbers.',
      },
      prizeDivisions: [
        { divisionName: 'Division 1', divisionOrder: 1, description: 'Match 7', fixedPrize: null, isJackpot: true, matchNumbers: 7, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 2', divisionOrder: 2, description: 'Match 6 + 1 Supp', fixedPrize: null, isJackpot: false, matchNumbers: 6, matchSupp: 1, matchPB: false },
        { divisionName: 'Division 3', divisionOrder: 3, description: 'Match 6', fixedPrize: null, isJackpot: false, matchNumbers: 6, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 4', divisionOrder: 4, description: 'Match 5 + 1 Supp', fixedPrize: null, isJackpot: false, matchNumbers: 5, matchSupp: 1, matchPB: false },
        { divisionName: 'Division 5', divisionOrder: 5, description: 'Match 5', fixedPrize: null, isJackpot: false, matchNumbers: 5, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 6', divisionOrder: 6, description: 'Match 4', fixedPrize: null, isJackpot: false, matchNumbers: 4, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 7', divisionOrder: 7, description: 'Match 3 + 1 Supp', fixedPrize: 5.05, isJackpot: false, matchNumbers: 3, matchSupp: 1, matchPB: false },
      ],
    },
    {
      slug: 'powerball',
      name: 'Powerball',
      description: 'The world\'s most popular lottery! Pick 7 numbers from 1–35 and a Powerball from 1–20.',
      shortDescription: 'Match 7 + Powerball to win Thursday\'s massive jackpot!',
      drawSchedule: '0 20 * * 4', // Thursday 8pm
      jackpotAmount: 20_000_000,
      minJackpot: 3_000_000,
      ticketPrice: 1.35,
      minNumbers: 7,
      maxNumbers: 7,
      numberPool: 35,
      hasSupplementary: false,
      hasPowerball: true,
      powerballPool: 20,
      isFeatured: true,
      sortOrder: 2,
      badgeText: 'THURSDAY NIGHT',
      rulesJson: {
        minAge: 18,
        maxLines: 50,
        maxDraws: 10,
        systemEntries: true,
        description: 'Select 7 numbers from 1 to 35, and 1 Powerball from 1 to 20.',
      },
      prizeDivisions: [
        { divisionName: 'Division 1', divisionOrder: 1, description: 'Match 7 + PB', fixedPrize: null, isJackpot: true, matchNumbers: 7, matchSupp: 0, matchPB: true },
        { divisionName: 'Division 2', divisionOrder: 2, description: 'Match 7', fixedPrize: null, isJackpot: false, matchNumbers: 7, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 3', divisionOrder: 3, description: 'Match 6 + PB', fixedPrize: null, isJackpot: false, matchNumbers: 6, matchSupp: 0, matchPB: true },
        { divisionName: 'Division 4', divisionOrder: 4, description: 'Match 6', fixedPrize: null, isJackpot: false, matchNumbers: 6, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 5', divisionOrder: 5, description: 'Match 5 + PB', fixedPrize: null, isJackpot: false, matchNumbers: 5, matchSupp: 0, matchPB: true },
        { divisionName: 'Division 6', divisionOrder: 6, description: 'Match 4 + PB', fixedPrize: 184.40, isJackpot: false, matchNumbers: 4, matchSupp: 0, matchPB: true },
        { divisionName: 'Division 7', divisionOrder: 7, description: 'Match 5', fixedPrize: 105.95, isJackpot: false, matchNumbers: 5, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 8', divisionOrder: 8, description: 'Match 3 + PB', fixedPrize: 27.35, isJackpot: false, matchNumbers: 3, matchSupp: 0, matchPB: true },
        { divisionName: 'Division 9', divisionOrder: 9, description: 'Match 2 + PB', fixedPrize: 10.85, isJackpot: false, matchNumbers: 2, matchSupp: 0, matchPB: true },
      ],
    },
    {
      slug: 'saturday-lotto',
      name: 'Saturday Lotto',
      description: 'The original global lottery. Pick 6 numbers from 1–45 on Saturday night.',
      shortDescription: 'The world\'s classic Saturday night lottery!',
      drawSchedule: '0 19 * * 6', // Saturday 7pm
      jackpotAmount: 4_000_000,
      minJackpot: 4_000_000,
      ticketPrice: 1.35,
      minNumbers: 6,
      maxNumbers: 6,
      numberPool: 45,
      hasSupplementary: true,
      suppNumbers: 2,
      suppPool: 45,
      hasPowerball: false,
      isFeatured: true,
      sortOrder: 3,
      badgeText: 'SATURDAY NIGHT',
      rulesJson: {
        minAge: 18,
        maxLines: 50,
        maxDraws: 10,
        systemEntries: true,
        description: 'Select 6 numbers from 1 to 45. The draw produces 6 winning + 2 supplementary numbers.',
      },
      prizeDivisions: [
        { divisionName: 'Division 1', divisionOrder: 1, description: 'Match 6', fixedPrize: null, isJackpot: true, matchNumbers: 6, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 2', divisionOrder: 2, description: 'Match 5 + 1 Supp', fixedPrize: null, isJackpot: false, matchNumbers: 5, matchSupp: 1, matchPB: false },
        { divisionName: 'Division 3', divisionOrder: 3, description: 'Match 5', fixedPrize: null, isJackpot: false, matchNumbers: 5, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 4', divisionOrder: 4, description: 'Match 4', fixedPrize: null, isJackpot: false, matchNumbers: 4, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 5', divisionOrder: 5, description: 'Match 3 + 1 Supp', fixedPrize: null, isJackpot: false, matchNumbers: 3, matchSupp: 1, matchPB: false },
        { divisionName: 'Division 6', divisionOrder: 6, description: 'Match 1 + 2 Supp', fixedPrize: null, isJackpot: false, matchNumbers: 1, matchSupp: 2, matchPB: false },
      ],
    },
    {
      slug: 'weekday-windfall',
      name: 'Weekday Windfall',
      description: 'Guaranteed Division 1 prize every weekday! Pick 6 numbers from 1–45.',
      shortDescription: 'Guaranteed prizes every weekday Monday–Friday!',
      drawSchedule: '0 20 * * 1-5', // Weekdays 8pm
      jackpotAmount: 1_000_000,
      minJackpot: 1_000_000,
      ticketPrice: 1.35,
      minNumbers: 6,
      maxNumbers: 6,
      numberPool: 45,
      hasSupplementary: true,
      suppNumbers: 2,
      suppPool: 45,
      hasPowerball: false,
      isFeatured: false,
      sortOrder: 4,
      badgeText: 'WEEKDAYS',
      rulesJson: {
        minAge: 18,
        maxLines: 50,
        maxDraws: 10,
        systemEntries: true,
        description: 'Select 6 numbers from 1 to 45. Guaranteed prize pool every weekday.',
      },
      prizeDivisions: [
        { divisionName: 'Division 1', divisionOrder: 1, description: 'Match 6', fixedPrize: null, isJackpot: true, matchNumbers: 6, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 2', divisionOrder: 2, description: 'Match 5 + 1 Supp', fixedPrize: null, isJackpot: false, matchNumbers: 5, matchSupp: 1, matchPB: false },
        { divisionName: 'Division 3', divisionOrder: 3, description: 'Match 5', fixedPrize: null, isJackpot: false, matchNumbers: 5, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 4', divisionOrder: 4, description: 'Match 4', fixedPrize: null, isJackpot: false, matchNumbers: 4, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 5', divisionOrder: 5, description: 'Match 3 + 1 Supp', fixedPrize: null, isJackpot: false, matchNumbers: 3, matchSupp: 1, matchPB: false },
      ],
    },
    {
      slug: 'set-for-life',
      name: 'Set for Life',
      description: 'Win $20,000 a month for 20 years! Pick 8 numbers from 1–37 and 1 from 1–37.',
      shortDescription: 'Win $20,000/month for 20 years — be Set for Life!',
      drawSchedule: '0 20 * * 1', // Monday 8pm
      jackpotAmount: 4_800_000, // $20k x 240 months
      minJackpot: 4_800_000,
      ticketPrice: 1.35,
      minNumbers: 8,
      maxNumbers: 8,
      numberPool: 37,
      hasSupplementary: false,
      hasPowerball: false,
      isFeatured: true,
      sortOrder: 5,
      badgeText: '$20K/MONTH',
      rulesJson: {
        minAge: 18,
        maxLines: 50,
        maxDraws: 10,
        systemEntries: true,
        description: 'Select 8 numbers from 1 to 37. Match all 8 to win $20,000 per month for 20 years.',
      },
      prizeDivisions: [
        { divisionName: 'Division 1', divisionOrder: 1, description: 'Match 8', fixedPrize: null, isJackpot: true, matchNumbers: 8, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 2', divisionOrder: 2, description: 'Match 7', fixedPrize: 5000, isJackpot: false, matchNumbers: 7, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 3', divisionOrder: 3, description: 'Match 6', fixedPrize: 500, isJackpot: false, matchNumbers: 6, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 4', divisionOrder: 4, description: 'Match 5', fixedPrize: 50, isJackpot: false, matchNumbers: 5, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 5', divisionOrder: 5, description: 'Match 4', fixedPrize: 20, isJackpot: false, matchNumbers: 4, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 6', divisionOrder: 6, description: 'Match 3', fixedPrize: 10, isJackpot: false, matchNumbers: 3, matchSupp: 0, matchPB: false },
      ],
    },
    {
      slug: 'lucky-lotteries-mega-jackpot',
      name: 'Lucky Lotteries Mega Jackpot',
      description: 'Instant ticket with guaranteed Division 1 prize every draw. No number selection needed!',
      shortDescription: 'A new Division 1 prize guaranteed every draw!',
      drawSchedule: '0 20 * * 0', // Sunday 8pm
      jackpotAmount: 200_000,
      minJackpot: 200_000,
      ticketPrice: 2.00,
      minNumbers: 1,
      maxNumbers: 1,
      numberPool: 999999,
      hasSupplementary: false,
      hasPowerball: false,
      isFeatured: false,
      sortOrder: 6,
      badgeText: 'GUARANTEED WIN',
      rulesJson: {
        minAge: 18,
        maxLines: 1,
        maxDraws: 1,
        systemEntries: false,
        description: 'Your unique ticket number is your entry. New Division 1 prize guaranteed every draw.',
      },
      prizeDivisions: [
        { divisionName: 'Division 1', divisionOrder: 1, description: 'First Prize', fixedPrize: 200000, isJackpot: true, matchNumbers: 1, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 2', divisionOrder: 2, description: 'Second Prize', fixedPrize: 50000, isJackpot: false, matchNumbers: 1, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 3', divisionOrder: 3, description: 'Third Prize', fixedPrize: 10000, isJackpot: false, matchNumbers: 1, matchSupp: 0, matchPB: false },
      ],
    },
    {
      slug: 'lucky-lotteries-super-jackpot',
      name: 'Lucky Lotteries Super Jackpot',
      description: 'Jackpot grows until won! Pick your ticket number for a chance at the super jackpot.',
      shortDescription: 'Jackpot grows and grows until one lucky winner takes it all!',
      drawSchedule: '0 20 * * 5', // Friday 8pm
      jackpotAmount: 1_000_000,
      minJackpot: 1_000_000,
      ticketPrice: 5.00,
      minNumbers: 1,
      maxNumbers: 1,
      numberPool: 999999,
      hasSupplementary: false,
      hasPowerball: false,
      isFeatured: false,
      sortOrder: 7,
      badgeText: 'GROWING JACKPOT',
      rulesJson: {
        minAge: 18,
        maxLines: 1,
        maxDraws: 1,
        systemEntries: false,
        description: 'Unique ticket numbers are entered. Jackpot keeps growing until it\'s won!',
      },
      prizeDivisions: [
        { divisionName: 'Division 1', divisionOrder: 1, description: 'Jackpot', fixedPrize: null, isJackpot: true, matchNumbers: 1, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 2', divisionOrder: 2, description: 'Second Prize', fixedPrize: 100000, isJackpot: false, matchNumbers: 1, matchSupp: 0, matchPB: false },
      ],
    },
    {
      slug: 'lotto-strike',
      name: 'Lotto Strike',
      description: 'Pick 4 numbers in the exact order they are drawn! Played alongside Saturday Lotto.',
      shortDescription: 'Pick 4 numbers in exact order to strike it rich!',
      drawSchedule: '0 19 * * 6', // Saturday 7pm (with Saturday Lotto)
      jackpotAmount: 1_000_000,
      minJackpot: 500_000,
      ticketPrice: 0.75,
      minNumbers: 4,
      maxNumbers: 4,
      numberPool: 45,
      hasSupplementary: false,
      hasPowerball: false,
      isFeatured: false,
      sortOrder: 8,
      badgeText: 'EXACT ORDER',
      rulesJson: {
        minAge: 18,
        maxLines: 50,
        maxDraws: 10,
        systemEntries: false,
        description: 'Choose 4 numbers from 1 to 45. You win if your numbers match the first 4 drawn, in exact order.',
      },
      prizeDivisions: [
        { divisionName: 'Strike 4', divisionOrder: 1, description: 'Match 4 in order', fixedPrize: null, isJackpot: true, matchNumbers: 4, matchSupp: 0, matchPB: false },
        { divisionName: 'Strike 3', divisionOrder: 2, description: 'Match first 3 in order', fixedPrize: null, isJackpot: false, matchNumbers: 3, matchSupp: 0, matchPB: false },
        { divisionName: 'Strike 2', divisionOrder: 3, description: 'Match first 2 in order', fixedPrize: null, isJackpot: false, matchNumbers: 2, matchSupp: 0, matchPB: false },
        { divisionName: 'Strike 1', divisionOrder: 4, description: 'Match first number', fixedPrize: 5.00, isJackpot: false, matchNumbers: 1, matchSupp: 0, matchPB: false },
      ],
    },
    {
      slug: 'super66',
      name: 'Super 66',
      description: 'A 6-digit game played alongside Saturday Lotto. Match all or part of the Saturday Lotto draw number!',
      shortDescription: 'Match the 6-digit draw number to win up to $100,000!',
      drawSchedule: '0 19 * * 6', // Saturday 7pm
      jackpotAmount: 100_000,
      minJackpot: 100_000,
      ticketPrice: 0.50,
      minNumbers: 6,
      maxNumbers: 6,
      numberPool: 9, // digits 0-9
      hasSupplementary: false,
      hasPowerball: false,
      isFeatured: false,
      sortOrder: 9,
      badgeText: '6-DIGIT GAME',
      rulesJson: {
        minAge: 18,
        maxLines: 50,
        maxDraws: 10,
        systemEntries: false,
        description: 'A 6-digit number is randomly assigned. Prize depends on how many consecutive digits match from the right.',
      },
      prizeDivisions: [
        { divisionName: 'Division 1', divisionOrder: 1, description: 'Match all 6', fixedPrize: 100000, isJackpot: true, matchNumbers: 6, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 2', divisionOrder: 2, description: 'Match last 5', fixedPrize: 5000, isJackpot: false, matchNumbers: 5, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 3', divisionOrder: 3, description: 'Match last 4', fixedPrize: 500, isJackpot: false, matchNumbers: 4, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 4', divisionOrder: 4, description: 'Match last 3', fixedPrize: 50, isJackpot: false, matchNumbers: 3, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 5', divisionOrder: 5, description: 'Match last 2', fixedPrize: 10, isJackpot: false, matchNumbers: 2, matchSupp: 0, matchPB: false },
        { divisionName: 'Division 6', divisionOrder: 6, description: 'Match last 1', fixedPrize: 2, isJackpot: false, matchNumbers: 1, matchSupp: 0, matchPB: false },
      ],
    },
  ]

  for (const gameData of gamesData) {
    const { prizeDivisions, ...game } = gameData

    const createdGame = await prisma.game.upsert({
      where: { slug: game.slug },
      update: {
        jackpotAmount: game.jackpotAmount,
      },
      create: {
        ...game,
        rulesJson: game.rulesJson,
      },
    })

    // Ensure jackpot pool exists
    await prisma.jackpotPool.upsert({
      where: { gameId: createdGame.id },
      update: {
        currentJackpot: game.jackpotAmount,
        baseJackpot: game.minJackpot,
      },
      create: {
        gameId: createdGame.id,
        currentJackpot: game.jackpotAmount,
        baseJackpot: game.minJackpot,
        rolloverAmount: 0,
      },
    })

    // Delete old prize divisions and recreate
    await prisma.prizeDivision.deleteMany({ where: { gameId: createdGame.id } })
    await prisma.prizeDivision.createMany({
      data: prizeDivisions.map((div) => ({
        id: crypto.randomUUID(),
        ...div,
        gameId: createdGame.id,
      })),
    })

    // Create upcoming draws (next 4 weeks)
    const now = new Date()
    for (let week = 0; week < 4; week++) {
      const drawDate = new Date(now)
      drawDate.setDate(drawDate.getDate() + week * 7 + 1)
      drawDate.setHours(20, 0, 0, 0)

      const drawNumber = 1000 + week + gamesData.indexOf(gameData) * 100

      await prisma.draw.upsert({
        where: {
          id: `seed-draw-${createdGame.slug}-${drawNumber}`,
        },
        update: {},
        create: {
          id: `seed-draw-${createdGame.slug}-${drawNumber}`,
          gameId: createdGame.id,
          drawNumber,
          scheduledAt: drawDate,
          jackpotAmount: game.jackpotAmount,
        },
      })
    }

    console.log(`✅ Game created: ${game.name}`)
  }

  // ── Settings ────────────────────────────────────────────────────────────────
  const settings = [
    { key: 'site_name', value: 'Lucky Lotto Play', group: 'GENERAL', label: 'Site Name', isPublic: true },
    { key: 'site_tagline', value: 'The world\'s Online Lottery Platform', group: 'GENERAL', label: 'Tagline', isPublic: true },
    { key: 'contact_email', value: 'support@luckylottoplay.live', group: 'GENERAL', label: 'Contact Email', isPublic: true },
    { key: 'contact_phone', value: '', group: 'GENERAL', label: 'Contact Phone', isPublic: true },
    { key: 'min_deposit', value: '10', group: 'PAYMENTS', label: 'Minimum Deposit (USD)', isPublic: true },
    { key: 'max_deposit', value: '10000', group: 'PAYMENTS', label: 'Maximum Deposit (USD)', isPublic: true },
    { key: 'min_withdrawal', value: '20', group: 'PAYMENTS', label: 'Minimum Withdrawal (USD)', isPublic: true },
    { key: 'max_withdrawal', value: '50000', group: 'PAYMENTS', label: 'Maximum Withdrawal (USD)', isPublic: true },
    { key: 'maintenance_mode', value: 'false', group: 'SYSTEM', label: 'Maintenance Mode', isPublic: false },
    { key: 'registration_enabled', value: 'true', group: 'SYSTEM', label: 'Registration Enabled', isPublic: true },
    { key: 'kyc_required_withdrawal', value: 'true', group: 'COMPLIANCE', label: 'KYC Required for Withdrawal', isPublic: true },
    { key: 'min_age', value: '18', group: 'COMPLIANCE', label: 'Minimum Age', isPublic: true },
    { key: 'default_currency', value: 'USD', group: 'GENERAL', label: 'Default Currency', isPublic: true },
    { key: 'referral_bonus_amount', value: '10', group: 'AFFILIATE', label: 'Referral Bonus Amount', isPublic: false },
    { key: 'affiliate_commission_rate', value: '10', group: 'AFFILIATE', label: 'Default Commission Rate (%)', isPublic: false },
  ]

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    })
  }
  console.log('✅ Settings seeded')

  // ── Payment Methods ─────────────────────────────────────────────────────────
  const paymentMethods = [
    {
      gateway: 'STRIPE' as const,
      name: 'Credit / Debit Card',
      description: 'Visa, Mastercard, Amex',
      minAmount: 10,
      maxAmount: 5000,
      fees: 1.5,
      config: { publicKey: process.env.STRIPE_PUBLIC_KEY || '' },
    },
    {
      gateway: 'PAYPAL' as const,
      name: 'PayPal',
      description: 'Pay securely with PayPal',
      minAmount: 10,
      maxAmount: 5000,
      fees: 2.5,
      config: { clientId: process.env.PAYPAL_CLIENT_ID || '' },
    },
    {
      gateway: 'BANK_TRANSFER' as const,
      name: 'Bank Transfer',
      description: 'Direct bank deposit (1-2 business days)',
      minAmount: 50,
      maxAmount: 50000,
      fees: 0,
      config: { bsb: '123-456', accountNumber: '123456789', accountName: 'MegaDraw Pty Ltd' },
    },
  ]

  for (const pm of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { id: `seed-pm-${pm.gateway}` },
      update: {},
      create: { id: `seed-pm-${pm.gateway}`, ...pm },
    })
  }
  console.log('✅ Payment methods seeded')

  // ── FAQs ────────────────────────────────────────────────────────────────────
  const faqs = [
    { question: 'How do I register?', answer: 'Click "Register" in the top right corner, fill in your details and verify your email address.', category: 'Getting Started', sortOrder: 1 },
    { question: 'How old do I need to be?', answer: 'You must be 18 years or older to purchase lottery tickets.', category: 'Getting Started', sortOrder: 2 },
    { question: 'How do I deposit funds?', answer: 'Go to Wallet > Deposit. We accept Credit/Debit cards via Stripe, PayPal, and Bank Transfer.', category: 'Deposits', sortOrder: 1 },
    { question: 'How long do deposits take?', answer: 'Card and PayPal deposits are instant. Bank transfers take 1-2 business days.', category: 'Deposits', sortOrder: 2 },
    { question: 'How do I withdraw my winnings?', answer: 'Go to Wallet > Withdraw. You must complete identity verification (KYC) before your first withdrawal.', category: 'Withdrawals', sortOrder: 1 },
    { question: 'What is KYC verification?', answer: 'KYC (Know Your Customer) is an identity verification process required by law. You\'ll need to submit a photo ID and proof of address.', category: 'Verification', sortOrder: 1 },
    { question: 'What is Quick Pick?', answer: 'Quick Pick automatically selects random numbers for you, making it faster to purchase tickets.', category: 'Playing', sortOrder: 1 },
    { question: 'What are System Entries?', answer: 'System entries allow you to select more numbers than a standard game requires, covering multiple combinations and increasing your chances of winning.', category: 'Playing', sortOrder: 2 },
    { question: 'How are prizes paid?', answer: 'Prizes are automatically credited to your wallet after a draw is completed. You can then withdraw to your bank account.', category: 'Prizes', sortOrder: 1 },
    { question: 'Is my information secure?', answer: 'Yes. We use industry-standard encryption (SSL/TLS), two-factor authentication, and are fully compliant with global privacy laws.', category: 'Security', sortOrder: 1 },
  ]

  await prisma.fAQ.createMany({
    data: faqs.map(faq => ({ ...faq, id: crypto.randomUUID() })),
    skipDuplicates: true
  })
  console.log('✅ FAQs seeded')

  // ── CMS Pages ───────────────────────────────────────────────────────────────
  const pages = [
    {
      slug: 'terms-and-conditions',
      title: 'Terms and Conditions',
      content: '# Terms and Conditions\n\nLast updated: July 2025\n\n## 1. Acceptance of Terms\n\nBy using Lucky Lotto Play, you agree to these terms...\n\n## 2. Eligibility\n\nYou must be 18 years or older and located in an eligible jurisdiction.\n\n## 3. Account Responsibilities\n\nYou are responsible for maintaining the security of your account.\n\n## 4. Responsible Gaming\n\nWe are committed to responsible gambling practices.',
      metaTitle: 'Terms and Conditions | Lucky Lotto Play',
      metaDesc: 'Read Lucky Lotto Play\'s terms and conditions for using our online lottery platform.',
    },
    {
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      content: '# Privacy Policy\n\nLast updated: July 2025\n\n## 1. Information We Collect\n\nWe collect information you provide directly to us...\n\n## 2. How We Use Your Information\n\nWe use your information to provide and improve our services.\n\n## 3. Data Security\n\nWe implement appropriate security measures to protect your information.',
      metaTitle: 'Privacy Policy | Lucky Lotto Play',
      metaDesc: 'Learn how Lucky Lotto Play collects, uses, and protects your personal information.',
    },
    {
      slug: 'responsible-gaming',
      title: 'Responsible Gaming',
      content: '# Responsible Gaming\n\nLucky Lotto Play is committed to responsible gambling...\n\n## Setting Limits\n\nYou can set daily, weekly, or monthly deposit and spending limits.\n\n## Self-Exclusion\n\nIf you need a break, contact us to self-exclude.',
      metaTitle: 'Responsible Gaming | Lucky Lotto Play',
      metaDesc: 'Lucky Lotto Play\'s commitment to responsible gambling and available support resources.',
    },
    {
      slug: 'about-us',
      title: 'About Lucky Lotto Play',
      content: '# About Lucky Lotto Play\n\nLucky Lotto Play is The world\'s premier online lottery platform, offering all major global lottery games in one convenient place.\n\n## Our Mission\n\nTo provide globals with a safe, fair, and entertaining lottery experience online.\n\n## Licensed & Regulated\n\nLucky Lotto Play operates under appropriate gambling licenses and adheres to all relevant global regulations.',
      metaTitle: 'About Us | Lucky Lotto Play',
      metaDesc: 'Learn about Lucky Lotto Play - The world\'s trusted online lottery platform.',
    },
  ]

  for (const page of pages) {
    await prisma.cmsPage.upsert({
      where: { slug: page.slug },
      update: {},
      create: page,
    })
  }
  console.log('✅ CMS pages seeded')

  // ── Sample Banner ───────────────────────────────────────────────────────────
  await prisma.banner.upsert({
    where: { id: 'seed-banner-1' },
    update: {},
    create: {
      id: 'seed-banner-1',
      title: 'Powerball $20 Million!',
      description: 'This Thursday\'s Powerball jackpot has grown to an incredible $20 million!',
      imageUrl: '/images/banners/powerball-banner.jpg',
      linkUrl: '/games/powerball',
      position: 'HOME',
      sortOrder: 1,
    },
  })
  console.log('✅ Sample banner seeded')

  console.log('\n🎉 Seed completed successfully!')
  console.log('📧 Admin login: admin@megadraw.com')
  console.log('Admin password configured through ADMIN_SEED_PASSWORD')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
