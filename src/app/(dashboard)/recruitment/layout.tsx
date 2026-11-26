import styles from '@/components/recruitment/Recruitment.module.css'
import { getHrisProEnabled } from '@/lib/hris-pro-access'
import { HrisProGate } from '@/components/layout/HrisProGate'

export default async function Layout({ children }: { children: React.ReactNode }) {
  const enabled = await getHrisProEnabled()
  return <HrisProGate enabled={enabled} featureName="Recruitment"><div className={styles.recruitment}>{children}</div></HrisProGate>
}
