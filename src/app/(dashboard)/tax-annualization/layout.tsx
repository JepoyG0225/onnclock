// No Pro gate — Tax Annualization is now part of the BIR Reports page
// (Basic + Pro). This layout is intentionally a passthrough so the
// redirect in page.tsx still runs.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
