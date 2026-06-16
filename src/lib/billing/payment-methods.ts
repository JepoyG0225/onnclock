import { prisma } from '@/lib/prisma'
import { PaymentMethodType } from '@prisma/client'

const DEFAULT_PAYMENT_METHODS: Array<{
  code: string
  label: string
  type: PaymentMethodType
  bankName?: string
  accountName?: string
  accountNumber?: string
  instructions?: string
  qrImageUrl?: string
  sortOrder: number
}> = [
  {
    code: 'GCASH_MAIN',
    label: 'GCash',
    type: 'GCASH',
    qrImageUrl: '/Gcash.jpeg',
    sortOrder: 10,
  },
  {
    code: 'MARIBANK_MAIN',
    label: 'Maribank',
    type: 'BANK_TRANSFER',
    qrImageUrl: '/Maribank.jpeg',
    sortOrder: 20,
  },
]

export async function ensureDefaultPaymentMethods() {
  await Promise.all(
    DEFAULT_PAYMENT_METHODS.map((method) =>
      prisma.paymentMethod.upsert({
        where: { code: method.code },
        update: {
          label: method.label,
          type: method.type,
          qrImageUrl: method.qrImageUrl,
          sortOrder: method.sortOrder,
          isActive: true,
        },
        create: method,
      })
    )
  )

  await prisma.paymentMethod.updateMany({
    where: { code: 'BANK_BDO_MAIN' },
    data: { isActive: false },
  })
}
