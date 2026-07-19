"use client"
import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { createClient, isMockMode } from "@/lib/supabase/client"
import { toast } from "sonner"

function SignupContent() {
  const search = useSearchParams()
  const initialRole = (search.get('role') as any) || 'student'
  const [role, setRole] = useState<'coach'|'student'|'parent'>(initialRole)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const supabase = createClient()
      const { error, data } = await supabase.auth.signUp({
        email, password,
        options: { data: { role, display_name: displayName } }
      })
      
      if (error) {
        toast.error(error.message)
        setLoading(false)
        return
      }

      if (isMockMode()) {
        const mockUser = { id: `user_${Date.now()}`, email, role, display_name: displayName }
        localStorage.setItem('vamoverse_mock_user', JSON.stringify(mockUser))
        localStorage.setItem('vamoverse_mock_session', JSON.stringify({ user: mockUser }))
      }

      toast.success(`Account created! Welcome to Vamoverse as ${role}`)
      router.push('/dashboard')
    } catch (err: any) {
      toast.error(err.message)
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
            {(['coach','student','parent'] as const).map(r => (
              <button
                key={r}
                onClick={()=>setRole(r)}
                className={`flex-1 p-3 rounded-xl border text-sm font-medium capitalize transition-all ${role===r ? 'bg-clay-500 text-white border-clay-500' : 'bg-white hover:bg-gray-50'}`}
              >
                {r === 'coach' ? '🎾 Coach' : r === 'student' ? '👟 Player' : '👨‍👩‍👧 Parent'}
              </button>
            ))}
          </div>

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

            <div className="bg-amber-50 p-3 rounded-lg text-xs">
              {role==='coach' && 'As coach you will be able to create paid events, set rate card, and be paid via auto-pay. SaaS $49/$99.'}
              {role==='student' && 'As player you can find doubles partners, join clinics, and track UTR/NTRP.'}
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

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading Vamos...</div>}>
      <SignupContent />
    </Suspense>
  )
}
