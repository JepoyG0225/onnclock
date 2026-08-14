'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, Loader2, RotateCcw, Send, Sparkles, User as UserIcon, X } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

const SUGGESTIONS = [
  'How is 13th month pay computed?',
  "What's the minimum notice for resignation?",
  'How does BIR withholding tax work?',
  'Explain SSS contribution table 2024',
]

const STORAGE_KEY = 'nexa_chat_history_v1'

export function NexaChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [showGreeting, setShowGreeting] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Message[]
        if (Array.isArray(parsed)) setMessages(parsed)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (open) {
      // Brief delay so the panel animates in before greeting appears
      const t = setTimeout(() => setShowGreeting(true), 100)
      return () => clearTimeout(t)
    } else {
      setShowGreeting(false)
    }
  }, [open])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch { /* ignore */ }
  }, [messages])

  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if (!text || sending) return
    setError(null)
    const next: Message[] = [...messages, { role: 'user', content: text, ts: Date.now() }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error ?? 'Something went wrong'); return }
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, ts: Date.now() }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSending(false)
    }
  }

  function clearChat() {
    setMessages([])
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  if (!mounted) return null

  const panel = open ? (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 pointer-events-auto"
        style={{ background: 'rgba(0,0,0,0.25)' }}
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div
        className="absolute right-4 top-4 bottom-4 w-full max-w-sm pointer-events-auto flex flex-col rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.2)', animation: 'slideInRight 0.2s ease' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 shrink-0" style={{ background: 'var(--brand-highlight)' }}>
          <div className="w-10 h-10 rounded-full overflow-hidden bg-white/20 shrink-0 flex items-center justify-center">
            <img src="/nexa.png" alt="Nexa" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-tight">Nexa</p>
            <p className="text-[11px] text-white/70 leading-tight">AI HR Assistant · Online</p>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/70 hover:text-white transition-colors"
                title="New chat"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/15 text-white/70 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-white"
        >
          {/* Greeting bubble — always shown */}
          <div className="flex gap-2.5 justify-start">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,89,0,0.1)' }}>
              <Bot className="w-4 h-4" style={{ color: 'var(--brand-highlight)' }} />
            </div>
            <div
              className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-gray-800 max-w-[80%]"
              style={{
                background: '#f7f7f7',
                border: '1px solid #d4d4d4',
                opacity: showGreeting ? 1 : 0,
                transform: showGreeting ? 'translateY(0)' : 'translateY(6px)',
                transition: 'opacity 0.3s ease, transform 0.3s ease',
              }}
            >
              <span className="font-semibold" style={{ color: 'var(--brand-highlight)' }}>Hi, I&apos;m Nexa!</span>
              {' '}Your AI HR assistant. Ask me anything about Philippine HR, payroll, or labor law. 👋
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="pt-2 space-y-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="w-full text-left text-xs px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50 transition-colors text-gray-600"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,89,0,0.1)' }}>
                    <Bot className="w-4 h-4" style={{ color: 'var(--brand-highlight)' }} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === 'user' ? 'text-white rounded-tr-sm' : 'text-gray-800 rounded-tl-sm'
                  }`}
                  style={
                    m.role === 'user'
                      ? { background: '#000000' }
                      : { background: '#f7f7f7', border: '1px solid #d4d4d4' }
                  }
                >
                  {m.content}
                </div>
                {m.role === 'user' && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-gray-100">
                    <UserIcon className="w-4 h-4 text-gray-500" />
                  </div>
                )}
              </div>
            ))
          )}

          {sending && (
            <div className="flex gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-full overflow-hidden shrink-0" style={{ background: 'rgba(255,89,0,0.1)' }}>
                <img src="/nexa.png" alt="Nexa" className="w-full h-full object-cover" onError={e => { const el = e.target as HTMLImageElement; el.style.display='none'; el.parentElement!.innerHTML='<svg class=\'w-4 h-4 m-1.5\' style=\'color:var(--brand-highlight)\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\'><path d=\'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z\'/></svg>' }} />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Thinking…
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 text-xs bg-red-50 text-red-600 border-t border-red-100 shrink-0">{error}</div>
        )}

        {/* Input */}
        <div className="px-3 py-3 border-t bg-white shrink-0" style={{ borderColor: '#d4d4d4' }}>
          <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              rows={1}
              placeholder="Ask Nexa anything…"
              disabled={sending}
              className="flex-1 resize-none border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 max-h-28"
              style={{ borderColor: '#d4d4d4', '--tw-ring-color': 'var(--brand-highlight)' } as React.CSSProperties}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-white disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--brand-highlight)' }}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            Always verify important decisions with your HR team.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(24px); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>
    </div>
  ) : null

  return (
    <>
      {/* Header trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-xs font-semibold transition-all hover:opacity-90"
        style={{ background: 'var(--brand-highlight)', color: '#fff' }}
        title="Chat with Nexa"
      >
        <div className="w-6 h-6 rounded-full overflow-hidden bg-white/20 shrink-0">
          <img src="/nexa.png" alt="Nexa" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
        </div>
        <span className="hidden sm:inline">Ask Nexa</span>
      </button>

      {/* Portal panel */}
      {createPortal(panel, document.body)}
    </>
  )
}
