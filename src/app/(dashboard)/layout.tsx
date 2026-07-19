"use client"
import { AppShell } from "@/components/layout/AppShell"
import { useAuth } from "@/hooks/useAuth"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading Vamoverse...</div>
  }

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">Redirecting to login...</div>
  }

  return <AppShell>{children}</AppShell>
}
