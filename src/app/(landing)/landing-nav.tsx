'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

export function LandingNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Image src="/onclock-logo.png" alt="Onclock" width={120} height={40} className="object-contain h-8 w-auto" />
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-teal-700 transition-colors">Features</a>
            <a href="#compliance" className="hover:text-teal-700 transition-colors">Compliance</a>
            <a href="#how-it-works" className="hover:text-teal-700 transition-colors">How It Works</a>
            <a href="#testimonials" className="hover:text-teal-700 transition-colors">Testimonials</a>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-semibold text-slate-700 hover:text-orange-600 transition-colors px-3 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-sm font-bold text-white px-5 py-2.5 rounded-full transition-all hover:shadow-lg hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #fa5e01, #ea580c)' }}
            >
              Get Started Free
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-slate-100 px-4 py-4 space-y-3">
          <a href="#features" onClick={() => setOpen(false)} className="block text-sm font-medium text-slate-700 py-2">Features</a>
          <a href="#compliance" onClick={() => setOpen(false)} className="block text-sm font-medium text-slate-700 py-2">Compliance</a>
          <a href="#how-it-works" onClick={() => setOpen(false)} className="block text-sm font-medium text-slate-700 py-2">How It Works</a>
          <a href="#testimonials" onClick={() => setOpen(false)} className="block text-sm font-medium text-slate-700 py-2">Testimonials</a>
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
            <Link href="/login" className="text-sm font-semibold text-slate-700 py-2 text-center border border-slate-200 rounded-xl">Sign In</Link>
            <Link href="/register" className="text-sm font-bold text-white py-2.5 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, #fa5e01, #ea580c)' }}>Get Started Free</Link>
          </div>
        </div>
      )}
    </header>
  )
}
