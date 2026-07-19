import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, Users, DollarSign, MessageCircle, Trophy, Zap } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-clay-500 rounded-lg flex items-center justify-center text-white font-bold">V</div>
            <span className="text-xl font-bold">Vamoverse</span>
            <Badge variant="secondary" className="ml-2">+ Vamos AI</Badge>
          </div>
          <div className="flex gap-3">
            <Link href="/login"><Button variant="ghost">Log in</Button></Link>
            <Link href="/signup"><Button>Start Coaching</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <Badge variant="outline" className="mb-4">Built for Independent Coaches • US Only • Serious Amateurs</Badge>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
          Serious Play.<br />
          <span className="text-clay-500">One Crew.</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          The OS for independent tennis coaches. Schedule sessions, organize paid events, auto-collect payments, and let <span className="font-semibold text-foreground">Vamos AI</span> find your players a doubles partner at 7pm.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/signup?role=coach"><Button size="lg" className="text-base">I am a Coach →</Button></Link>
          <Link href="/signup?role=student"><Button size="lg" variant="outline" className="text-base">I am a Player</Button></Link>
        </div>
        
        <div className="mt-12 grid grid-cols-3 gap-4 max-w-lg mx-auto text-sm">
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <div className="font-bold text-2xl">40+</div>
            <div className="text-muted-foreground">Coaches in Beta</div>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <div className="font-bold text-2xl">2,100+</div>
            <div className="text-muted-foreground">Matches Matched</div>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <div className="font-bold text-2xl">$52k</div>
            <div className="text-muted-foreground">Collected via Auto-Pay</div>
          </div>
        </div>
      </section>

      {/* Features - Product Focused */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Everything you need to run your crew</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <Calendar className="w-8 h-8 text-clay-500 mb-2" />
              <CardTitle>Scheduling That Gets Doubles</CardTitle>
              <CardDescription>Private, semi-private, group clinics, custom matches. Mens Doubles = 4M enforced. Mixed = 2M/2F. No more WhatsApp chaos.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xs bg-gray-50 p-3 rounded-lg font-mono">Mixed Doubles: 2M/2F required • 8-game pro-set • No-Ad • UTR 4-5 • $40</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <DollarSign className="w-8 h-8 text-green-600 mb-2" />
              <CardTitle>Paid Events + Auto-Pay</CardTitle>
              <CardDescription>Toggle Free/Paid when creating event. Student pays at registration. Lessons auto-pay after completion with 2hr dispute window.</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="success">Auto-pay in 1h 45m • $80</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Zap className="w-8 h-8 text-court-500 mb-2" />
              <CardTitle>Vamos AI - Your Captain</CardTitle>
              <CardDescription>Ask Vamos: "Find me mixed doubles Thu 7pm UTR 4-5 near Fremont" or "Who owes me?" - it does it, with confirmation.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-court-50 p-3 rounded-lg text-sm">Vamos: Found 3 players at UTR 4-5. Create match and invite? [Yes] [No]</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Users className="w-8 h-8 text-purple-600 mb-2" />
              <CardTitle>Social, But Safe</CardTitle>
              <CardDescription>Coach broadcast, coach-student DM, student-student only after Hitting Partner accepted. Parent audit for juniors. No random DMs.</CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Trophy className="w-8 h-8 text-yellow-600 mb-2" />
              <CardTitle>UTR / NTRP Manual V1</CardTitle>
              <CardDescription>Players self-report UTR Singles/Doubles, NTRP, WTN. See Good Match / Stretch / Mismatch badges. Auto-balance doubles teams by combined UTR.</CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <MessageCircle className="w-8 h-8 text-blue-600 mb-2" />
              <CardTitle>Location, No Court Booking</CardTitle>
              <CardDescription>Google Places pin for every event. Court booking out of scope V1 - you handle court, we handle crew.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Demo Accounts */}
      <section className="max-w-4xl mx-auto px-6 py-12">
        <Card className="bg-court-500 text-white border-0">
          <CardHeader>
            <CardTitle className="text-white">Try Demo - No Setup</CardTitle>
            <CardDescription className="text-blue-100">Mock Supabase + Mock Payments - use these accounts</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4 font-mono text-sm">
            <div className="bg-white/10 p-3 rounded-lg">
              <div className="font-bold">Coach</div>
              <div>coach@demo.com</div>
              <div>demo1234</div>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <div className="font-bold">Student</div>
              <div>maya@demo.com</div>
              <div>demo1234</div>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <div className="font-bold">Parent</div>
              <div>dave@demo.com</div>
              <div>demo1234</div>
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <div className="max-w-6xl mx-auto px-6">© 2026 Vamoverse • Vamos Together • Built for US independent coaches • Not affiliated with USTA/UTR</div>
      </footer>
    </div>
  )
}
