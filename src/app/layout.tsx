import type { Metadata } from "next"
import { Montserrat } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { PortalPwaRegister } from "@/components/employee/PortalPwaRegister"

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Onclock - Philippine HR & Payroll",
  description: "Onclock - Philippine HR & Payroll Management System - DOLE & BIR compliant",
  manifest: "/manifest.webmanifest",
  applicationName: "Onclock Portal",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Onclock",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${montserrat.variable} font-sans antialiased`}>
        <PortalPwaRegister />
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
