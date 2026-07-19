"use client"
import { useAuth } from "@/hooks/useAuth"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, Users, DollarSign, MessageCircle, LayoutDashboard, Trophy, Search, Bell, LogOut } from "lucide-react"
import { useEffect, useState } from "react"
import { VamosWidget } from "@/components/vamos/VamosWidget"

const coachNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/events", label: "Events", icon: Trophy },
  { href: "/community", label: "Community", icon: Users },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/payments", label: "Payments", icon: DollarSign },
]

const studentNav = [
  { href: "/dashboard", label: "Feed", icon: LayoutDashboard },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/play", label: "Play", icon: Search },
  { href: "/events", label: "Events", icon: Trophy },
  { href: "/messages", label: "Messages", icon: MessageCircle },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(()=>setMounted(true),[])

  if (!mounted) return null

  const navItems = user?.role === 'coach' ? coachNav : studentNav

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 border-r bg-white flex-col">
        <div className="p-6 border-b flex items-center gap-2">
          <div className="w-8 h-8 bg-clay-500 rounded-lg flex items-center justify-center text-white font-bold">V</div>
          <div>
            <div className="font-bold">Vamoverse</div>
            <div className="text-xs text-muted-foreground">Vamos Together</div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-clay-500 text-white' : 'hover:bg-gray-50 text-muted-foreground hover:text-foreground'}`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}
          <Link href="/vamos" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${pathname==='/vamos' ? 'bg-court-500 text-white' : 'hover:bg-gray-50 text-muted-foreground'}`}>
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-clay-500 to-court-500" />
            Vamos AI
            <Badge variant="secondary" className="ml-auto text-[10px]">AI</Badge>
          </Link>
        </nav>
        <div className="p-4 border-t">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-court-500 rounded-full flex items-center justify-center text-white text-sm">{user?.display_name?.[0] || user?.email?.[0] || 'U'}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.display_name || user?.email}</div>
              <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={logout}><LogOut className="w-4 h-4 mr-2"/> Log out</Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden border-b bg-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-clay-500 rounded-lg flex items-center justify-center text-white font-bold">V</div>
            <span className="font-bold">Vamoverse</span>
          </div>
          <div className="flex gap-2">
            <Link href="/vamos"><Button size="icon" variant="outline"><div className="w-4 h-4 bg-gradient-to-br from-clay-500 to-court-500 rounded-full" /></Button></Link>
            <Button size="icon" variant="ghost"><Bell className="w-4 h-4" /></Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">
          {children}
        </main>

        {/* Bottom Nav Mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around p-2">
          {navItems.slice(0,5).map(item => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center p-2 rounded-xl ${active ? 'text-clay-500 bg-clay-50' : 'text-muted-foreground'}`}>
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] mt-1">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <VamosWidget />
    </div>
  )
}
