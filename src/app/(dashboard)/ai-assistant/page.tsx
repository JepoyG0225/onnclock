'use client'
import { useState, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, Send, Loader2, Bot, User as UserIcon, RotateCcw } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

const SUGGESTIONS = [
  'How is 13th month pay computed in the Philippines?',
  'What\'s the minimum notice for resignation?',
  'How does BIR\'s annualized withholding method work?',
  'Explain SSS contribution table for 2024',
  'Can I convert unused leave to cash?',
  'How is night differential pay calculated?',
]

const STORAGE_KEY = 'ai_assistant_history_v1'

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Restore previous conversation from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Message[]
        if (Array.isArray(parsed)) setMessages(parsed)
      }
    } catch { /* ignore */ }
  }, [])

  // Persist conversation
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch { /* ignore */ }
  }, [messages])

  // Auto-scroll on new message
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
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong')
        // Roll back the optimistic user message? Keep it so user sees what they asked.
        return
      }
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, ts: Date.now() }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSending(false)
    }
  }

  function clearConversation() {
    if (!messages.length) return
    if (!confirm('Clear the conversation?')) return
    setMessages([])
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#2E4156' }}>
            <Sparkles className="w-6 h-6" style={{ color: '#fa5e01' }} />
            AI HR Assistant
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Ask anything about Philippine HR, payroll, leave benefits, or your company&apos;s policies.
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearConversation}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            New Chat
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div
          ref={scrollerRef}
          className="overflow-y-auto px-4 py-6 space-y-4"
          style={{ minHeight: '420px', maxHeight: 'calc(100vh - 320px)' }}
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(250,94,1,0.12)' }}>
                <Bot className="w-7 h-7" style={{ color: '#fa5e01' }} />
              </div>
              <h2 className="text-base font-semibold text-gray-800">How can I help?</h2>
              <p className="text-sm text-gray-500 mt-1 mb-6">Try one of these starters:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-xl w-full">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-left text-xs px-3 py-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-orange-200 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(250,94,1,0.12)' }}>
                    <Bot className="w-4 h-4" style={{ color: '#fa5e01' }} />
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === 'user'
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                  style={m.role === 'user' ? { background: '#2E4156' } : undefined}
                >
                  {m.content}
                </div>
                {m.role === 'user' && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-gray-200">
                    <UserIcon className="w-4 h-4 text-gray-600" />
                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(250,94,1,0.12)' }}>
                <Bot className="w-4 h-4" style={{ color: '#fa5e01' }} />
              </div>
              <div className="bg-gray-100 rounded-2xl px-4 py-2.5 text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Thinking…
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 text-xs bg-red-50 text-red-700 border-t border-red-100">{error}</div>
        )}

        <CardContent className="p-3 border-t bg-white">
          <form
            onSubmit={(e) => { e.preventDefault(); send() }}
            className="flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={1}
              placeholder="Ask anything about HR, payroll, leaves, BIR rules…"
              className="flex-1 resize-none border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 max-h-32"
              style={{ '--tw-ring-color': '#fa5e01' } as React.CSSProperties}
              disabled={sending}
            />
            <Button
              type="submit"
              disabled={sending || !input.trim()}
              className="h-10 w-10 p-0 shrink-0"
              style={{ background: '#fa5e01' }}
              title="Send"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            Replies may be inaccurate. Always verify with your HR team for company-specific decisions.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
