import { stat, readdir } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { PLAN_PRICE } from '@/lib/feature-gates'

const MB = 1024 * 1024
const GB = 1024 * MB

// ─── Plan storage tiers ────────────────────────────────────────────────────────
//
//  Trial                (₱0)  → 200 MB
//  Basic (₱50/employee)      → 5 GB
//  Pro   (₱70/employee)      → 10 GB
//
// Optional flat-rate add-ons (any plan):
//  +50 GB  → ₱500/month
//  +100 GB → ₱900/month
//  +500 GB → ₱3,500/month
//
// These limits apply to ALL locally-stored files (employee documents +
// recruitment resumes). Supabase-hosted assets (logos, banners, onboarding
// proof uploads) are excluded — they live in a separate bucket.

export type StorageAddOnTier = {
  gb: number
  label: string
  monthlyPrice: number
  priceLabel: string
}

export const STORAGE_ADDON_TIERS: StorageAddOnTier[] = [
  { gb: 50,  label: '50 GB',  monthlyPrice: 500,   priceLabel: '₱500/mo'   },
  { gb: 100, label: '100 GB', monthlyPrice: 900,   priceLabel: '₱900/mo'   },
  { gb: 500, label: '500 GB', monthlyPrice: 3_500, priceLabel: '₱3,500/mo' },
]

export type StoragePlanInfo = {
  planName: string           // e.g. "Basic" | "Pro" | "Trial"
  baseLimitBytes: number     // base limit from plan tier
  baseLimitLabel: string     // e.g. "5 GB"
  addOnGb: number            // current add-on (0 = none)
  addOnPrice: number         // current add-on monthly price
  addOnLabel: string | null  // e.g. "+50 GB" or null
  limitBytes: number         // total effective limit (base + add-on)
  limitLabel: string         // e.g. "55 GB"
  isTopTier: boolean         // true when already on the highest base plan
  upgradePricePerSeat: number | null
}

export function getStoragePlanInfo(
  pricePerSeat: number,
  addOnGb = 0,
  addOnPrice = 0,
): StoragePlanInfo {
  const addOnBytes = addOnGb * GB

  let planName: string
  let baseLimitBytes: number
  let baseLimitLabel: string
  let isTopTier: boolean
  let upgradePricePerSeat: number | null

  if (pricePerSeat >= PLAN_PRICE.HRIS_PRO) {
    planName = 'Pro'
    baseLimitBytes = 20 * GB
    baseLimitLabel = '20 GB'
    isTopTier = true
    upgradePricePerSeat = null
  } else if (pricePerSeat >= PLAN_PRICE.BASE) {
    planName = 'Basic'
    baseLimitBytes = 5 * GB
    baseLimitLabel = '5 GB'
    isTopTier = false
    upgradePricePerSeat = PLAN_PRICE.HRIS_PRO
  } else {
    // Trial or no subscription
    planName = 'Trial'
    baseLimitBytes = 200 * MB
    baseLimitLabel = '200 MB'
    isTopTier = false
    upgradePricePerSeat = PLAN_PRICE.HRIS_PRO
  }

  const limitBytes = baseLimitBytes + addOnBytes
  const limitLabel = addOnGb > 0
    ? formatStorage(limitBytes)
    : baseLimitLabel

  const addOnLabel = addOnGb > 0 ? `+${addOnGb} GB` : null

  return {
    planName,
    baseLimitBytes,
    baseLimitLabel,
    addOnGb,
    addOnPrice,
    addOnLabel,
    limitBytes,
    limitLabel,
    isTopTier,
    upgradePricePerSeat,
  }
}

// Keep the old function name for existing quota-enforcement callers
export function getCompanyDocumentStorageLimitBytes(pricePerSeat: number): number {
  return getStoragePlanInfo(pricePerSeat).limitBytes
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalManagedPath(fileUrl: string): string | null {
  if (!fileUrl.startsWith('/uploads/employee-docs/')) return null
  return path.join(process.cwd(), 'public', fileUrl.replace(/^\/+/, ''))
}

/** Recursively sum the sizes of all files under a directory.
 *  Returns 0 if the directory does not exist. */
async function dirSizeBytes(dirPath: string): Promise<number> {
  let total = 0
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          total += await dirSizeBytes(full)
        } else if (entry.isFile()) {
          try {
            const info = await stat(full)
            total += info.size
          } catch {
            // file deleted between readdir and stat — skip
          }
        }
      })
    )
  } catch {
    // directory doesn't exist yet — treat as 0
  }
  return total
}

// ─── Per-category usage ────────────────────────────────────────────────────────

/** Employee 201 documents — measured via DB records (existing approach). */
export async function getCompanyDocumentStorageUsedBytes(companyId: string): Promise<number> {
  const docs = await prisma.employeeDocument.findMany({
    where: { employee: { companyId } },
    select: { fileUrl: true },
  })

  const sizes = await Promise.all(
    docs.map(async (doc) => {
      const localPath = toLocalManagedPath(doc.fileUrl)
      if (!localPath) return 0
      try {
        const info = await stat(localPath)
        return info.isFile() ? info.size : 0
      } catch {
        return 0
      }
    })
  )
  return sizes.reduce((sum, s) => sum + s, 0)
}

/** Recruitment resumes — measured by scanning the company's resume directory. */
export async function getCompanyResumeStorageUsedBytes(companyId: string): Promise<number> {
  const dir = path.join(process.cwd(), 'public', 'uploads', 'recruitment-resumes', companyId)
  return dirSizeBytes(dir)
}

/** Total local storage usage across all tracked categories. */
export async function getAllLocalStorageUsedBytes(
  companyId: string
): Promise<{ docs: number; resumes: number; total: number }> {
  const [docs, resumes] = await Promise.all([
    getCompanyDocumentStorageUsedBytes(companyId),
    getCompanyResumeStorageUsedBytes(companyId),
  ])
  return { docs, resumes, total: docs + resumes }
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatStorage(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2).replace(/\.00$/, '')} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}
