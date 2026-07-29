"use client"
import { useAuth } from "@/hooks/useAuth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, DollarSign, Users, Trophy, MessageCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function DashboardPage() {
  const { user, isMock } = useAuth()
  const router = useRouter()
  const stats = { sessions: 3, revenue: 420, pending: 2, students: 12 }

  if (!isMock) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Vamoverse</h1><p className="text-muted-foreground">Live summary cards are not connected yet; no demo revenue, sessions, or family data is shown in production.</p></div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/events"><Button>View live events</Button></Link>
          {user?.role === 'coach' && <Link href="/payments"><Button variant="outline">View payments</Button></Link>}
        </div>
      </div>
    )
  }

  if (user?.role === 'coach') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <h1 className="text-2xl font-bold">Vamos, {user.display_name || 'Coach'}! 🎾</h1>
            <p className="text-muted-foreground">Demo dashboard — all summary cards below are sample data</p>
          </div>
          <Link href="/events" className="shrink-0"><Button className="w-full sm:w-auto">Create Clinic - Vamos!</Button></Link>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <Card><CardHeader className="pb-2"><CardDescription>Today's Sessions</CardDescription><CardTitle className="text-2xl">{stats.sessions}</CardTitle></CardHeader><CardContent><Badge>2 private, 1 group</Badge></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Revenue This Week</CardDescription><CardTitle className="text-2xl">${stats.revenue}</CardTitle></CardHeader><CardContent><Badge variant="success">+12% vs last week</Badge></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Pending Payments</CardDescription><CardTitle className="text-2xl">{stats.pending}</CardTitle></CardHeader><CardContent><Badge variant="warning">2 requires capture</Badge></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Active Students</CardDescription><CardTitle className="text-2xl">{stats.students}</CardTitle></CardHeader><CardContent><Badge variant="secondary">3 juniors</Badge></CardContent></Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> Upcoming Today</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 border rounded-xl flex justify-between">
                <div><div className="font-medium">Private - Leo (Junior)</div><div className="text-xs text-muted-foreground">3:00 PM • Fremont HS Court 3</div></div>
                <Badge>Private</Badge>
              </div>
              <div className="p-3 border rounded-xl flex justify-between">
                <div><div className="font-medium">Adult 3.5 Doubles Clinic</div><div className="text-xs text-muted-foreground">5:30 PM • 6/8 spots • $40</div></div>
                <Badge variant="secondary">Group</Badge>
              </div>
              <div className="p-3 border rounded-xl">
                <div className="font-medium">Custom Match Needs You</div>
                <div className="text-xs text-muted-foreground">Mixed Doubles needs 1M UTR 4-5 • Thu 7pm • Fremont</div>
                <Link href="/events/evt_2"><Button size="sm" className="mt-2" variant="outline">View sample event</Button></Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5" /> Payments - Action Needed</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                <div className="flex justify-between"><span className="font-medium">Leo - Private Lesson</span><Badge variant="warning">Requires capture in 1m</Badge></div>
                <div className="text-sm">$80 • Auto-pay in 1h 45m • 2hr dispute window</div>
                <Link href="/payments"><Button size="sm" className="mt-2">Open demo ledger</Button></Link>
              </div>
              <div className="p-3 border rounded-xl flex justify-between">
                <div><div className="font-medium">Maya - Group Clinic</div><div className="text-xs">Sat 9am • $40 captured</div></div>
                <Badge variant="success">Captured</Badge>
              </div>
              <Link href="/payments"><Button variant="outline" size="sm" className="w-full">View All Payments</Button></Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Ask Vamos - Your Captain</CardTitle><CardDescription>Try these - Vamos does it with confirmation</CardDescription></CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="whitespace-normal h-auto text-left max-w-full" onClick={()=>router.push('/vamos')}>Find me 2 players for mixed doubles Thu 7pm UTR 4-5</Button>
            <Button variant="outline" size="sm" className="whitespace-normal h-auto text-left max-w-full" onClick={()=>router.push('/vamos')}>Who owes me this week?</Button>
            <Button variant="outline" size="sm" className="whitespace-normal h-auto text-left max-w-full" onClick={()=>router.push('/vamos')}>Reschedule Mon clinics due to rain</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (user?.role === 'parent') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Family dashboard</h1>
          <p className="text-muted-foreground">Demo family data only — no production relationship access is implied</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { name: 'Leo', rating: 'UTR 4.5', next: 'Private lesson — today 3:00 PM' },
            { name: 'Emma', rating: 'UTR 4.2', next: 'No upcoming sessions' },
          ].map((child) => (
            <Card key={child.name}>
              <CardHeader><CardTitle>{child.name}</CardTitle><CardDescription>{child.rating}</CardDescription></CardHeader>
              <CardContent>{child.next}</CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm">This local demo contains no real junior messages or payment data. Production parent access must be relationship-scoped by the server.</CardContent>
        </Card>
      </div>
    )
  }

  // Student view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vamos, {user?.display_name || 'Maya'}! 👋</h1>
        <p className="text-muted-foreground">Demo dashboard — events, ratings, and feed items below are samples</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Next Session</CardDescription><CardTitle className="text-lg">Thu 3pm Private</CardTitle></CardHeader><CardContent><div className="text-xs">with Coach Alex • Fremont HS</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>UTR Singles</CardDescription><CardTitle className="text-lg">4.5 • Provisional</CardTitle></CardHeader><CardContent><Badge variant="success">Good Match range 4-5</Badge></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Hitting Partners</CardDescription><CardTitle className="text-lg">5 partners</CardTitle></CardHeader><CardContent><div className="text-xs">2 online now</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="w-5 h-5" /> Matches Need You • Doubles First</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="border rounded-xl p-4">
            <div className="flex justify-between mb-2"><Badge>Mixed Doubles • Needs 1M</Badge><Badge variant="outline">Free sample</Badge></div>
            <div className="font-medium">Thu 7pm • Fremont Tennis Center • Court 2</div>
            <div className="text-sm text-muted-foreground">UTR 4-5 • Format: Best of 3 • No-Ad • 3/4 joined</div>
            <div className="flex -space-x-2 mt-2">
              <div className="w-8 h-8 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center text-white text-xs">M</div>
              <div className="w-8 h-8 bg-pink-500 rounded-full border-2 border-white flex items-center justify-center text-white text-xs">S</div>
              <div className="w-8 h-8 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center text-white text-xs">L</div>
              <div className="w-8 h-8 border-2 border-dashed rounded-full flex items-center justify-center">+</div>
            </div>
            <div className="text-xs mt-2 text-green-700">Balanced Δ0.2 • Great match!</div>
            <Link href="/events/evt_2"><Button size="sm" className="mt-3 w-full">View sample event</Button></Link>
          </div>

          <div className="border rounded-xl p-4">
            <div className="flex justify-between mb-2"><Badge variant="secondary">Womens Doubles Clinic</Badge><Badge>$40</Badge></div>
            <div className="font-medium">Sat 9am • 6/8 spots • UTR 4-5</div>
            <div className="text-sm text-muted-foreground">Coach Alex • Fremont HS • 90min</div>
            <div className="mt-2"><Badge variant="success">Good Match • Δ0.3</Badge></div>
            <Link href="/events/evt_1"><Button size="sm" variant="outline" className="mt-3 w-full">View paid-event limitation</Button></Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Your Schedule</CardTitle></CardHeader><CardContent className="space-y-2">
          <div className="p-2 border rounded-lg text-sm">Thu 3pm - Private with Alex</div>
          <div className="p-2 border rounded-lg text-sm">Sat 9am - Group Clinic (registered, paid)</div>
          <Link href="/schedule"><Button variant="ghost" size="sm">View Calendar</Button></Link>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Feed</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
          <div>🎉 Maya + Sarah beat Leo+Emma 6-4 6-3 • Mixed Doubles • Verified for UTR</div>
          <div>📈 Coach Alex posted: "Tip - No-Ad: At deuce, decide serve location before point"</div>
          <div>💰 Payment captured $40 for Sat clinic</div>
        </CardContent></Card>
      </div>
    </div>
  )
}
