/**
 * Task Management is an HRIS-Pro feature.
 *
 * The API has always enforced this (src/lib/tasks/guard.ts calls
 * requireHrisProOrTrialApi), but the page itself had no gate — it did not need
 * one while the module was restricted to a beta allow-list, because the
 * dashboard layout stripped tasks:* from everyone else and the sidebar entry
 * never rendered.
 *
 * With the allow-list gone, every role carries tasks:read, so a company on the
 * Php 50 plan now sees the Tasks nav item. Without this gate they would land on
 * a page whose every request 403s. Wrapping the route mirrors what
 * /recruitment, /assets, /analytics and the other Pro modules already do, so
 * they get the upgrade prompt instead of a broken board.
 */
import { getHrisProEnabled } from '@/lib/hris-pro-access'
import { HrisProGate } from '@/components/layout/HrisProGate'

export default async function Layout({ children }: { children: React.ReactNode }) {
  const enabled = await getHrisProEnabled()
  return <HrisProGate enabled={enabled} featureName="Task Management">{children}</HrisProGate>
}
