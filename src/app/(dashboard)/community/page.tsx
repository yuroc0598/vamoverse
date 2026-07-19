"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default function CommunityPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Community - Your Crew</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { name: 'Maya', utr: '4.5', gender: 'F', role: 'Student', status: 'Good Match Δ0.3' },
          { name: 'Sarah', utr: '4.8', gender: 'F', role: 'Student', status: 'Good Match Δ0.1' },
          { name: 'Leo (Junior)', utr: '4.5', gender: 'M', role: 'Junior', status: 'Stretch Δ0.7', parent: 'Dave' },
          { name: 'Emma (Junior)', utr: '4.2', gender: 'F', role: 'Junior', status: 'Good Match Δ0.2', parent: 'Dave' },
        ].map(s=>(
          <Card key={s.name}>
            <CardContent className="p-4 flex justify-between items-center">
              <div className="flex gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${s.gender==='M'?'bg-blue-500':'bg-pink-500'}`}>{s.name[0]}</div>
                <div>
                  <div className="font-medium text-sm">{s.name} • UTR {s.utr} • {s.gender}</div>
                  <div className="text-xs text-muted-foreground">{s.role} {s.parent ? `• Parent: ${s.parent}` : ''}</div>
                </div>
              </div>
              <div className="text-right">
                <Badge variant={s.status.includes('Good')?'success':'warning'} className="text-[10px]">{s.status}</Badge>
                <div><Button size="sm" variant="outline" className="mt-2 h-7 text-xs">Add Partner</Button></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-blue-50"><CardContent className="p-4 text-sm">Parent audit: Dave sees Leo+Emma messages read-only. Junior &lt;13 cannot DM without parent approval. Coach sees all linked students.</CardContent></Card>
    </div>
  )
}
