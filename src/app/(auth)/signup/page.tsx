"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { createClient, isMockMode, ALLOWED_ROLES } from "@/lib/supabase/client"
import { toast } from "sonner"
import { logger } from "@/lib/logger"

type AllowedRole = typeof ALLOWED_ROLES[number]
const ALLOWED_SET = new Set<string>(ALLOWED_ROLES)

function calcAge(dobStr: string): number | null {
  if (!dobStr) return null
  const d = new Date(dobStr)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

export default function SignupPage() {
  const initialRole: AllowedRole = 'student'
  const [role, setRole] = useState<AllowedRole>(initialRole)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [dob, setDob] = useState("")
  const [parentEmail, setParentEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const age = calcAge(dob)
  const isMinor = age !== null && age < 18

  const handleRoleChange = (r: string) => {
    if (!ALLOWED_SET.has(r)) {
      setRole('student')
      return
    }
    setRole(r as AllowedRole)
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (!ALLOWED_SET.has(role)) {
        toast.error("Invalid role")
        setLoading(false)
        return
      }

      if (role === 'student' && !dob) {
        toast.error("Date of birth required for players (COPPA)")
        setLoading(false)
        return
      }
      if (dob) {
        const parsed = calcAge(dob)
        if (parsed === null) {
          toast.error("Invalid date of birth")
          setLoading(false)
          return
        }
      }
      if (isMinor && !parentEmail) {
        toast.error("Parent email required for minors (under 18)")
        setLoading(false)
        return
      }
      if (parentEmail && !parentEmail.includes('@')) {
        toast.error("Invalid parent email")
        setLoading(false)
        return
      }

      const supabase = createClient()
      const safeRole: AllowedRole = ALLOWED_SET.has(role) ? role : 'student'
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { role: safeRole, display_name: displayName, dob: dob || undefined, parent_email: parentEmail || undefined, parent_id: parentEmail ? `parent_${parentEmail}` : undefined } }
      })

      if (error) {
        toast.error(error.message)
        setLoading(false)
        return
      }

      if (isMockMode()) {
        const mockUser = {
          id: `user_${Date.now()}`,
          email,
          role: safeRole,
          display_name: displayName,
          dob: dob || undefined,
          parent_email: parentEmail || undefined,
          parent_id: parentEmail ? `parent_${parentEmail}` : undefined,
        }
        localStorage.setItem('vamoverse_mock_user', JSON.stringify(mockUser))
        localStorage.setItem('vamoverse_mock_session', JSON.stringify({ user: mockUser }))
        try {
          const payload = encodeURIComponent(JSON.stringify({ id: mockUser.id, role: mockUser.role, email: mockUser.email }))
          document.cookie = `vamoverse_mock_session=${payload}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`
          document.cookie = `vamoverse_mock_user=${payload}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`
        } catch {}
      }

      toast.success(`Account created! Welcome to Vamoverse as ${role}${isMinor ? ' (parent link required)' : ''}${role === 'coach' ? ' - KYC pending' : ''}`)
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Signup failed'
      logger.error('auth.signup_failed', { err })
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-10 h-10 bg-clay-500 rounded-xl mx-auto flex items-center justify-center text-white font-bold mb-2">V</div>
          <CardTitle>Join Vamoverse</CardTitle>
          <CardDescription>Vamos Together - Serious Play, One Crew</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            {(ALLOWED_ROLES as readonly AllowedRole[]).map(r => (
              <button
                key={r}
                onClick={()=>handleRoleChange(r)}
                className={`flex-1 p-3 rounded-xl border text-sm font-medium capitalize transition-all ${role===r ? 'bg-clay-500 text-white border-clay-500' : 'bg-white hover:bg-gray-50'}`}
                type="button"
              >
                {r === 'coach' ? '🎾 Coach' : r === 'student' ? '👟 Player' : '👨‍👩‍👧 Parent'}
              </button>
            ))}
          </div>
          {role === 'coach' && (
            <div className="bg-amber-100 border border-amber-300 p-2 rounded-lg text-xs mb-4">
              Coach role requires KYC verification - will be pending approval.
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Display Name</label>
              <Input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder={role==='coach'?'Coach Alex':'Maya'} required />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" type="email" required />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <Input value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" type="password" required />
            </div>
            <div>
              <label className="text-sm font-medium">Date of Birth {role==='student' ? '*' : ''}</label>
              <Input value={dob} onChange={e=>setDob(e.target.value)} type="date" required={role==='student'} max={new Date().toISOString().split('T')[0]} />
              {age !== null && <div className="text-xs text-muted-foreground mt-1">{isMinor ? `Minor (${age} years) - parent email required` : `${age} years`}</div>}
            </div>
            {(isMinor || role==='student') && (
              <div>
                <label className="text-sm font-medium">Parent Email {isMinor ? '*' : '(required if under 18)'}</label>
                <Input value={parentEmail} onChange={e=>setParentEmail(e.target.value)} placeholder="parent@example.com" type="email" required={isMinor} />
                {isMinor && <div className="text-xs text-amber-600 mt-1">Parental consent required for minors - linkage parent_id stored</div>}
              </div>
            )}

            <div className="bg-amber-50 p-3 rounded-lg text-xs">
              {role==='coach' && 'As coach you will be able to create paid events, set rate card, and be paid via auto-pay. SaaS $49/$99. KYC required.'}
              {role==='student' && 'As player you can find doubles partners, join clinics, and track UTR/NTRP. DOB required COPPA. If under 18 parent link enforced.'}
              {role==='parent' && 'As parent you can manage juniors, see payments, audit chats.'}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Creating...' : `Sign up as ${role} - Vamos!`}</Button>
          </form>

          <div className="mt-6 text-center text-sm">
            Have account? <Link href="/login" className="text-clay-500 font-medium">Log in</Link>
          </div>
          <div className="mt-2 text-center">
            <Badge variant="outline" className="text-xs">Mock mode - no real email needed</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
