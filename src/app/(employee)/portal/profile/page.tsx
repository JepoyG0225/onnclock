'use client'

import { useEffect, useState, FormEvent, ChangeEvent } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import { format } from 'date-fns'
import { User, Mail, Building, Briefcase, CreditCard, KeyRound, Camera, Fingerprint, ShieldCheck, ShieldOff, Loader2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { DatePicker } from '@/components/ui/date-picker'

interface EmployeeProfile {
  id: string
  employeeNo: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  gender: string
  birthDate: string
  civilStatus: string
  nationality: string
  personalEmail: string | null
  workEmail: string | null
  mobileNo: string | null
  employmentStatus: string
  employmentType: string
  hireDate: string
  rateType: string
  basicSalary: number
  payFrequency: string
  sssNo: string | null
  philhealthNo: string | null
  pagibigNo: string | null
  tinNo: string | null
  bankName: string | null
  bankAccountNo: string | null
  photoUrl: string | null
  department: { name: string } | null
  position: { title: string } | null
}

function mask(value: string | null | undefined, show = 4) {
  if (!value) return '-'
  if (value.length <= show) return value
  return '*'.repeat(value.length - show) + value.slice(-show)
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [biometricEnrolled, setBiometricEnrolled] = useState(false)
  const [biometricRequired, setBiometricRequired] = useState(true)
  const [biometricLoading, setBiometricLoading] = useState(true)
  const [biometricEnrolling, setBiometricEnrolling] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [editingPersonal, setEditingPersonal] = useState(false)
  const [editingContact, setEditingContact] = useState(false)
  const [editingGov, setEditingGov] = useState(false)
  const [personalForm, setPersonalForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    gender: 'MALE',
    birthDate: '',
    civilStatus: 'SINGLE',
    nationality: '',
  })
  const [contactForm, setContactForm] = useState({
    personalEmail: '',
    mobileNo: '',
  })
  const [govForm, setGovForm] = useState({
    sssNo: '',
    philhealthNo: '',
    pagibigNo: '',
    tinNo: '',
  })

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/employees/me')
        const data = await res.json()
        setProfile(data.employee)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    async function loadBiometricStatus() {
      setBiometricLoading(true)
      try {
        const res = await fetch('/api/biometric/status', { cache: 'no-store' })
        const data = await res.json()
        setBiometricEnrolled(!!data.enrolled)
        setBiometricRequired(data.required !== false)
      } catch {
        setBiometricEnrolled(false)
        setBiometricRequired(true)
      } finally {
        setBiometricLoading(false)
      }
    }
    loadBiometricStatus()
  }, [])

  useEffect(() => {
    if (!profile) return
    setPersonalForm({
      firstName: profile.firstName ?? '',
      middleName: profile.middleName ?? '',
      lastName: profile.lastName ?? '',
      suffix: profile.suffix ?? '',
      gender: profile.gender ?? 'MALE',
      birthDate: profile.birthDate ? profile.birthDate.split('T')[0] : '',
      civilStatus: profile.civilStatus ?? 'SINGLE',
      nationality: profile.nationality ?? '',
    })
    setContactForm({
      personalEmail: profile.personalEmail ?? '',
      mobileNo: profile.mobileNo ?? '',
    })
    setGovForm({
      sssNo: profile.sssNo ?? '',
      philhealthNo: profile.philhealthNo ?? '',
      pagibigNo: profile.pagibigNo ?? '',
      tinNo: profile.tinNo ?? '',
    })
  }, [profile])

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 text-gray-400 text-center mt-20">
        <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Profile not found</p>
      </div>
    )
  }

  const fullName = [profile.firstName, profile.middleName, profile.lastName, profile.suffix]
    .filter(Boolean).join(' ')
  const initials = `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase()
  const positionLabel = profile.position?.title ?? '-'
  const departmentLabel = profile.department?.name ?? '-'
  const safeDate = (value: string | null | undefined) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return format(d, 'MMMM d, yyyy')
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault()
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill out all password fields')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setSavingPassword(true)
    try {
      const res = await fetch('/api/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to update password')
        return
      }
      toast.success('Password updated')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleBiometricEnroll() {
    setBiometricEnrolling(true)
    try {
      const optRes = await fetch('/api/biometric/register/options', { method: 'POST' })
      if (!optRes.ok) {
        const d = await optRes.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to start fingerprint enrollment')
      }
      const options = await optRes.json()
      const attResp = await startRegistration({ optionsJSON: options })

      const verRes = await fetch('/api/biometric/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attResp),
      })
      const verData = await verRes.json().catch(() => ({}))
      if (!verRes.ok) throw new Error(verData.error ?? 'Enrollment verification failed')

      setBiometricEnrolled(true)
      toast.success('Fingerprint enrolled successfully')
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'NotAllowedError') {
        toast.error('Fingerprint authentication was cancelled.')
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to enroll fingerprint')
      }
    } finally {
      setBiometricEnrolling(false)
    }
  }


  async function saveProfileSection(payload: Record<string, unknown>, onDone: () => void) {
    try {
      const res = await fetch('/api/employees/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update profile')
      setProfile(data.employee)
      toast.success('Profile updated')
      onDone()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile')
    }
  }

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Image must be 50MB or less')
      return
    }
    setUploadingPhoto(true)
    try {
      const res = await fetch('/api/employees/me/photo', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to upload photo')
      setProfile(prev => prev ? { ...prev, photoUrl: data.photoUrl ?? prev.photoUrl } : prev)
      toast.success('Profile photo updated')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="portal">Portal Access</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-5">
          {/* Identity */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex flex-col items-center text-center gap-3 mb-4">
              <div className="relative">
                {profile.photoUrl ? (
                  <img
                    src={profile.photoUrl}
                    alt={fullName}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow"
                  />
                ) : (
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-2xl shadow"
                    style={{ background: 'rgba(46,65,86,0.12)', color: '#2E4156' }}
                  >
                    {initials}
                  </div>
                )}
                <label
                  className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-white shadow flex items-center justify-center cursor-pointer border border-gray-200"
                  title="Upload photo"
                >
                  <Camera className="w-4 h-4 text-gray-600" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    disabled={uploadingPhoto}
                  />
                </label>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{fullName}</h2>
                <p className="text-sm text-gray-500">{profile.employeeNo || '-'}</p>
                <p className="text-sm text-gray-500">{positionLabel} / {departmentLabel}</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Personal Info</p>
              <button
                type="button"
                onClick={() => setEditingPersonal(v => !v)}
                className="text-xs font-semibold"
                style={{ color: '#2E4156' }}
              >
                {editingPersonal ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editingPersonal ? (
              <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                <div>
                  <Label>First Name</Label>
                  <Input value={personalForm.firstName} onChange={e => setPersonalForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input value={personalForm.lastName} onChange={e => setPersonalForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
                <div>
                  <Label>Middle Name</Label>
                  <Input value={personalForm.middleName} onChange={e => setPersonalForm(f => ({ ...f, middleName: e.target.value }))} />
                </div>
                <div>
                  <Label>Suffix</Label>
                  <Input value={personalForm.suffix} onChange={e => setPersonalForm(f => ({ ...f, suffix: e.target.value }))} />
                </div>
                <div>
                  <Label>Gender</Label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={personalForm.gender}
                    onChange={e => setPersonalForm(f => ({ ...f, gender: e.target.value }))}
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <Label>Civil Status</Label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={personalForm.civilStatus}
                    onChange={e => setPersonalForm(f => ({ ...f, civilStatus: e.target.value }))}
                  >
                    <option value="SINGLE">Single</option>
                    <option value="MARRIED">Married</option>
                    <option value="WIDOWED">Widowed</option>
                    <option value="LEGALLY_SEPARATED">Legally Separated</option>
                  </select>
                </div>
                <div>
                  <Label>Nationality</Label>
                  <Input value={personalForm.nationality} onChange={e => setPersonalForm(f => ({ ...f, nationality: e.target.value }))} />
                </div>
                <div>
                  <Label>Birthdate</Label>
                  <DatePicker
                    value={personalForm.birthDate}
                    onChange={(v) => setPersonalForm(f => ({ ...f, birthDate: v }))}
                  />
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button
                    onClick={() =>
                      saveProfileSection(
                        {
                          ...personalForm,
                          middleName: personalForm.middleName || null,
                          suffix: personalForm.suffix || null,
                          nationality: personalForm.nationality || null,
                        },
                        () => setEditingPersonal(false)
                      )
                    }
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                <InfoRow label="Gender" value={profile.gender} />
                <InfoRow label="Civil Status" value={profile.civilStatus} />
                <InfoRow label="Nationality" value={profile.nationality} />
                <InfoRow label="Birthdate" value={safeDate(profile.birthDate)} />
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <Mail className="w-4 h-4" /> Contact Information
              </h3>
              <button
                type="button"
                onClick={() => setEditingContact(v => !v)}
                className="text-xs font-semibold"
                style={{ color: '#2E4156' }}
              >
                {editingContact ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editingContact ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="sm:col-span-2">
                  <Label>Work Email</Label>
                  <Input value={profile.workEmail ?? ''} disabled />
                </div>
                <div>
                  <Label>Personal Email</Label>
                  <Input value={contactForm.personalEmail} onChange={e => setContactForm(f => ({ ...f, personalEmail: e.target.value }))} />
                </div>
                <div>
                  <Label>Mobile</Label>
                  <Input value={contactForm.mobileNo} onChange={e => setContactForm(f => ({ ...f, mobileNo: e.target.value }))} />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button
                    onClick={() =>
                      saveProfileSection(
                        { personalEmail: contactForm.personalEmail || null, mobileNo: contactForm.mobileNo || null },
                        () => setEditingContact(false)
                      )
                    }
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <InfoRow label="Work Email" value={profile.workEmail} />
                <InfoRow label="Personal Email" value={profile.personalEmail} />
                <InfoRow label="Mobile" value={profile.mobileNo} />
              </div>
            )}
          </div>

          {/* Employment */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> Employment Details
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Status" value={profile.employmentStatus?.replace('_', ' ')} />
              <InfoRow label="Type" value={profile.employmentType?.replace('_', ' ')} />
              <InfoRow label="Pay Frequency" value={profile.payFrequency?.replace('_', ' ')} />
              <InfoRow label="Rate Type" value={profile.rateType} />
              <InfoRow label="Hire Date" value={safeDate(profile.hireDate)} />
            </div>
          </div>

          {/* Government IDs (masked) */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Government IDs
              </h3>
              <button
                type="button"
                onClick={() => setEditingGov(v => !v)}
                className="text-xs font-semibold"
                style={{ color: '#2E4156' }}
              >
                {editingGov ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editingGov ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label>SSS No.</Label>
                  <Input value={govForm.sssNo} onChange={e => setGovForm(f => ({ ...f, sssNo: e.target.value }))} />
                </div>
                <div>
                  <Label>PhilHealth No.</Label>
                  <Input value={govForm.philhealthNo} onChange={e => setGovForm(f => ({ ...f, philhealthNo: e.target.value }))} />
                </div>
                <div>
                  <Label>Pag-IBIG No.</Label>
                  <Input value={govForm.pagibigNo} onChange={e => setGovForm(f => ({ ...f, pagibigNo: e.target.value }))} />
                </div>
                <div>
                  <Label>TIN No.</Label>
                  <Input value={govForm.tinNo} onChange={e => setGovForm(f => ({ ...f, tinNo: e.target.value }))} />
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button
                    onClick={() =>
                      saveProfileSection(
                        {
                          sssNo: govForm.sssNo || null,
                          philhealthNo: govForm.philhealthNo || null,
                          pagibigNo: govForm.pagibigNo || null,
                          tinNo: govForm.tinNo || null,
                        },
                        () => setEditingGov(false)
                      )
                    }
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="SSS No." value={mask(profile.sssNo)} />
                <InfoRow label="PhilHealth No." value={mask(profile.philhealthNo)} />
                <InfoRow label="Pag-IBIG No." value={mask(profile.pagibigNo)} />
                <InfoRow label="TIN No." value={mask(profile.tinNo)} />
              </div>
            )}
          </div>

          {/* Bank */}
          {(profile.bankName || profile.bankAccountNo) && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Building className="w-4 h-4" /> Bank Information
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Bank" value={profile.bankName} />
                <InfoRow label="Account No." value={mask(profile.bankAccountNo)} />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="portal">
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <KeyRound className="w-4 h-4" /> Portal Password
              </h3>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Current Password</Label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>New Password</Label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Confirm New Password</Label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingPassword}>
                    {savingPassword ? 'Updating...' : 'Update Password'}
                  </Button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Fingerprint className="w-4 h-4" /> Fingerprint Access
              </h3>

              {biometricLoading ? (
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking fingerprint status...
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm flex items-center gap-2">
                    {biometricEnrolled ? (
                      <>
                        <ShieldCheck className="w-4 h-4" style={{ color: '#2E4156' }} />
                        <span className="font-medium" style={{ color: '#1A2D42' }}>Fingerprint enrolled</span>
                      </>
                    ) : (
                      <>
                        <ShieldOff className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600 font-medium">No fingerprint enrolled</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Policy: {biometricRequired ? 'Required for clock in/out' : 'Optional'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {biometricEnrolled
                      ? 'Re-enroll if you changed device security settings or fingerprint data.'
                      : biometricRequired
                        ? 'Your company requires fingerprint before clocking in/out on the Attendance page.'
                        : 'Fingerprint is optional for your company, but you may still enroll for added security.'}
                  </p>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={handleBiometricEnroll}
                      disabled={biometricEnrolling}
                      className="flex items-center gap-2"
                    >
                      {biometricEnrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                      {biometricEnrolled ? 'Re-enroll Fingerprint' : 'Enroll Fingerprint'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-gray-900 font-medium">{value ?? '-'}</p>
    </div>
  )
}
