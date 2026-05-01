'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { SettingsTabs } from '@/components/settings/SettingsTabs'

type ProfileData = {
  user: { id: string; name: string | null; email: string; createdAt: string }
  company: { id: string; name: string; logoUrl: string | null } | null
  role: string
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/users/me')
        const data = await res.json().catch(() => ({}))
        if (active) setProfile(data)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!form.currentPassword || !form.newPassword) {
      toast.error('Please fill in all password fields')
      return
    }
    if (form.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    if (form.newPassword !== form.confirmPassword) {
      toast.error('New password and confirmation do not match')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to update password')
        return
      }
      toast.success('Password updated')
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <SettingsTabs />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-gray-500 text-sm mt-1">Account details and security</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !profile ? (
            <div className="text-sm text-gray-400">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Full Name</label>
                <Input value={profile.user.name ?? ''} disabled />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                <Input value={profile.user.email} disabled />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Role</label>
                <Input value={profile.role.replace('_', ' ')} disabled />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Company</label>
                <Input value={profile.company?.name ?? ''} disabled />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Current Password</label>
              <Input
                type="password"
                value={form.currentPassword}
                onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
                placeholder="Current password"
              />
            </div>
            <div />
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">New Password</label>
              <Input
                type="password"
                value={form.newPassword}
                onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
                placeholder="New password"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Confirm New Password</label>
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Confirm new password"
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={saving} style={{ background: '#fa5e01' }} className="text-white">
                {saving ? 'Saving...' : 'Update Password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
