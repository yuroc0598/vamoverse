"use client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/useAuth"
import { useState } from "react"
import { toast } from "sonner"

export default function ProfilePage() {
  const { user } = useAuth()
  const [utrSingles, setUtrSingles] = useState("4.5")
  const [utrDoubles, setUtrDoubles] = useState("4.2")
  const [ntrp, setNtrp] = useState("3.5")

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Profile - {user?.display_name || user?.email}</h1>
      
      <Card>
        <CardHeader><CardTitle>Identity</CardTitle><CardDescription>Role: {user?.role} • Manual ratings V1</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">Display Name</label><Input defaultValue={user?.display_name || ''} /></div>
            <div><label className="text-xs font-medium">Email</label><Input defaultValue={user?.email || ''} disabled /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium">UTR Singles (1-10)</label><Input value={utrSingles} onChange={e=>setUtrSingles(e.target.value)} placeholder="4.5" /><div className="text-[10px] text-muted-foreground mt-1">Self-reported • Unverified</div></div>
            <div><label className="text-xs font-medium">UTR Doubles (1-10)</label><Input value={utrDoubles} onChange={e=>setUtrDoubles(e.target.value)} placeholder="4.2" /></div>
            <div><label className="text-xs font-medium">NTRP (1.0-7.0)</label><Input value={ntrp} onChange={e=>setNtrp(e.target.value)} placeholder="3.5" /></div>
          </div>
          <div className="flex gap-2">
            <Badge variant="success">Good Match • You are UTR 4.5 • Event range 4-5</Badge>
            <Badge variant="outline">Rating history saved on update</Badge>
          </div>
          <Button onClick={()=>toast.success(`Saved! UTR Singles ${utrSingles}, Doubles ${utrDoubles}, NTRP ${ntrp} - Unverified badge - V2 will sync with MyUTR`)}>Save Ratings - Vamos!</Button>
        </CardContent>
      </Card>

      {user?.role==='coach' && (
        <Card>
          <CardHeader><CardTitle>Rate Card - Coach Only</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <div><label className="text-xs">Private $/hr</label><Input defaultValue="80" /></div>
            <div><label className="text-xs">Semi-Private $/person</label><Input defaultValue="50" /></div>
            <div><label className="text-xs">Group $/person</label><Input defaultValue="30" /></div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Goals & Availability</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            {['Fun Fitness','League Prep','Tournament','Social'].map(g=>(
              <Badge key={g} variant="outline" className="cursor-pointer">{g}</Badge>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">Availability template: Mon 4-7pm, Sat 8am-12pm - used by Vamos to suggest matches</div>
        </CardContent>
      </Card>
    </div>
  )
}
