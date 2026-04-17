'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, ShieldOff, Trash2, Fingerprint } from 'lucide-react'

interface BiometricStatus {
  enrolled: boolean
}

export function EmployeePortalAccess({
  employeeId,
  workEmail,
  personalEmail,
  hasUser,
  editable = false,
}: {
  employeeId: string
  workEmail: string | null
  personalEmail: string | null
  hasUser: boolean
  editable?: boolean
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus | null>(null)
  const [biometricLoading, setBiometricLoading] = useState(true)
  const [biometricResetting, setBiometricResetting] = useState(false)

  const loginEmail = workEmail || personalEmail || ''

  useEffect(() => {
    setBiometricLoading(true)
    fetch(`/api/employees/${employeeId}/biometric`)
      .then(r => r.json())
      .then(d => setBiometricStatus(d))
      .catch(() => setBiometricStatus(null))
      .finally(() => setBiometricLoading(false))
  }, [employeeId])

  async function save() {
    if (!loginEmail) {
      toast.error('Employee has no email on file. Add a Work or Personal Email first.')
      return
    }
    if (!password || !confirm) {
      toast.error('Please enter and confirm the password.')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      toast.error('Passwords do not match.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/portal-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to update portal access')
      toast.success(hasUser ? 'Portal password updated.' : 'Portal access created.')
      setPassword('')
      setConfirm('')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update portal access')
    } finally {
      setSaving(false)
    }
  }

  async function resetBiometric() {
    if (!editable) return
    if (!window.confirm(`Reset fingerprint credential for this employee? They will need to re-enroll.`)) return
    setBiometricResetting(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/biometric`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to reset biometric data')
      toast.success('Fingerprint credential cleared. Employee must re-enroll.')
      setBiometricStatus({ enrolled: false })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset biometric data')
    } finally {
      setBiometricResetting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Fingerprint / Biometric Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            {biometricStatus?.enrolled
              ? <Fingerprint className="w-4 h-4 text-[#2E4156]" />
              : <Fingerprint className="w-4 h-4 text-gray-400" />}
            Fingerprint Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          {biometricLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading status...
            </div>
          ) : biometricStatus?.enrolled ? (
            <div className="flex items-start gap-4">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium text-[#1A2D42]">Fingerprint enrolled</p>
                <p className="text-xs text-gray-400 mt-1">
                  Employee can use their device&apos;s fingerprint sensor or PIN to clock in and out.
                </p>
                <div className="pt-2">
                  {editable && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetBiometric}
                      disabled={biometricResetting}
                      className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
                    >
                      {biometricResetting
                        ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Resetting...</>
                        : <><Trash2 className="w-3 h-3 mr-1" />Reset Credential</>}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <ShieldOff className="w-5 h-5 text-gray-300 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-600">No fingerprint enrolled</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Employee must enroll their fingerprint from the Employee Portal clock page before clocking in.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Portal Access Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Portal Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-600">
            Employee Portal login uses the employee&apos;s email address.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Login Email</label>
              <Input value={loginEmail} readOnly placeholder="No email on file" />
              {!loginEmail && (
                <p className="text-xs text-red-600 mt-1">Add Work or Personal Email to enable portal login.</p>
              )}
            </div>
            <div />
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">New Password</label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                disabled={!editable}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Confirm Password</label>
              <Input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-type password"
                autoComplete="new-password"
                disabled={!editable}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={!editable || saving || !loginEmail}>
              {saving ? 'Saving...' : hasUser ? 'Update Password' : 'Create Portal Access'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

