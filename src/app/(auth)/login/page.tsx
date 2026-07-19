"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient, isMockMode } from "@/lib/supabase/client"
import { toast } from "sonner"

export default function LoginPage() {
  const [email, setEmail] = useState("coach@demo.com")
  const [password, setPassword] = useState("demo1234")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const supabase = createClient()
      const { error, data } = await supabase.auth.signInWithPassword({ email, password })
      
      if (error) {
        toast.error(error.message)
        setLoading(false)
        return
      }

      // Mock mode: store user in localStorage
      if (isMockMode()) {
        localStorage.setItem('vamoverse_mock_user', JSON.stringify(data.user))
        localStorage.setItem('vamoverse_mock_session', JSON.stringify(data.session))
      }

      toast.success(`Vamos! Welcome ${email}`)
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
          <CardTitle>Welcome back to Vamoverse</CardTitle>
          <CardDescription>Log in as Coach, Student, or Parent</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="coach@demo.com" type="email" required />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <Input value={password} onChange={e=>setPassword(e.target.value)} placeholder="demo1234" type="password" required />
            </div>
            
            <div className="bg-blue-50 p-3 rounded-lg text-xs space-y-1">
              <div className="font-semibold">Demo Accounts (password: demo1234):</div>
              <div>coach@demo.com - Independent Coach</div>
              <div>maya@demo.com - Student UTR 4.5F</div>
              <div>sarah@demo.com - Student UTR 4.8F</div>
              <div>dave@demo.com - Parent of juniors</div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Logging in...' : 'Log in - Vamos!'}</Button>
          </form>
          <div className="mt-6 text-center text-sm">
            No account? <Link href="/signup" className="text-clay-500 font-medium">Sign up</Link> • <Link href="/" className="text-muted-foreground">Home</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
