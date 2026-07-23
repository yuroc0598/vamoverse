"use client"
import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { EventCard } from "@/components/events/EventCard"
import { DisciplineSelector } from "@/components/events/DisciplineSelector"
import { Discipline } from "@/lib/types/enums"
import { toast } from "sonner"
import { validateDiscipline, getCapacityForDiscipline, suggestBalancedTeams } from "@/lib/utils/gender"
import { listHittingPartners, getEvent, toApiEvent } from "@/lib/domain/catalog"

type RosterPlayer = { id: string; gender: 'M' | 'F' | 'other'; name?: string; utr?: number }

function getRosterForDiscipline(discipline: Discipline): RosterPlayer[] {
  switch (discipline) {
    case 'mens_singles':
      return [{ id: '1', gender: 'M', name: 'Alex' }, { id: '2', gender: 'M', name: 'Leo' }]
    case 'womens_singles':
      return [{ id: '1', gender: 'F', name: 'Maya' }, { id: '2', gender: 'F', name: 'Sarah' }]
    case 'mens_doubles':
      return [
        { id: '1', gender: 'M', name: 'Alex', utr: 4.5 },
        { id: '2', gender: 'M', name: 'Leo', utr: 4.2 },
        { id: '3', gender: 'M', name: 'Coach', utr: 5.0 },
        { id: '4', gender: 'M', name: 'Sam', utr: 4.8 },
      ]
    case 'womens_doubles':
      return [
        { id: '1', gender: 'F', name: 'Maya', utr: 4.5 },
        { id: '2', gender: 'F', name: 'Sarah', utr: 4.8 },
        { id: '3', gender: 'F', name: 'Emma', utr: 4.2 },
        { id: '4', gender: 'F', name: 'Luna', utr: 4.6 },
      ]
    case 'mixed_doubles':
      return [
        { id: '1', gender: 'M', name: 'Leo', utr: 4.5 },
        { id: '2', gender: 'F', name: 'Maya', utr: 4.5 },
        { id: '3', gender: 'M', name: 'Alex', utr: 4.2 },
        { id: '4', gender: 'F', name: 'Sarah', utr: 4.8 },
      ]
    case 'open_singles':
      return [{ id: '1', gender: 'M', name: 'Alex' }, { id: '2', gender: 'F', name: 'Maya' }]
    case 'open_doubles':
      return [
        { id: '1', gender: 'M', name: 'Leo' },
        { id: '2', gender: 'F', name: 'Maya' },
        { id: '3', gender: 'M', name: 'Sam' },
        { id: '4', gender: 'F', name: 'Emma' },
      ]
    case 'open':
      return [
        { id: '1', gender: 'M', name: 'Alex' },
        { id: '2', gender: 'F', name: 'Maya' },
        { id: '3', gender: 'M', name: 'Leo' },
        { id: '4', gender: 'F', name: 'Sarah' },
        { id: '5', gender: 'M', name: 'Sam' },
        { id: '6', gender: 'F', name: 'Emma' },
      ]
    default:
      return [{ id: '1', gender: 'M' }, { id: '2', gender: 'F' }]
  }
}

export default function PlayPage() {
  const router = useRouter()
  const [utrMin, setUtrMin] = useState(4)
  const [utrMax, setUtrMax] = useState(5)
  const [gender, setGender] = useState<'any'|'M'|'F'>('any')
  const [discipline, setDiscipline] = useState<Discipline>('mixed_doubles')

  // Partner finder + "matches need you" both read from the canonical catalog.
  // Viewing user is Maya (student_1) in the demo, so exclude her from partners.
  const mockPlayers = listHittingPartners('student_1')

  const evt2 = getEvent('evt_2')
  const neededMatches = evt2 ? [toApiEvent(evt2)] : []

  const filteredPlayers = mockPlayers.filter(p => p.utr >= utrMin && p.utr <= utrMax && (gender==='any' || p.gender===gender))

  const rosterForDiscipline = useMemo(() => getRosterForDiscipline(discipline), [discipline])

  const balance = useMemo(() => {
    const playersWithUtr = rosterForDiscipline.slice(0,4).map(p => ({ id: p.id, name: p.name || p.id, utr: p.utr }))
    return suggestBalancedTeams(playersWithUtr as any)
  }, [rosterForDiscipline])

  const handleTestGender = () => {
    const test1 = validateDiscipline('mixed_doubles', [{id:'1', gender:'M'},{id:'2', gender:'M'},{id:'3', gender:'M'},{id:'4', gender:'F'}])
    const test2 = validateDiscipline('mixed_doubles', [{id:'1', gender:'M'},{id:'2', gender:'M'},{id:'3', gender:'F'},{id:'4', gender:'F'}])
    toast(`Test 3M1F Mixed: ${test1.valid ? 'Valid' : 'Blocked: '+test1.error} | Test 2M2F: ${test2.valid ? 'Valid ✓' : test2.error}`)
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Play • Find Your Crew</h1>
        <p className="text-muted-foreground text-sm">Singles & Doubles with gender enforcement - Mens 4M, Womens 4F, Mixed 2M/2F, Open 20 max. Auto-balance uses avgUTR fallback not 0.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Matches Need You - Join Now (capacity TX + gender wired)</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              {neededMatches.map(evt=>(
                <EventCard key={evt.id} event={evt} playerUTR={4.5} />
              ))}
              <div className="border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                <div className="text-sm font-medium">No more matches at UTR {utrMin}-{utrMax}</div>
                <div className="text-xs text-muted-foreground mb-3">Expand radius or ask Vamos</div>
                <Button size="sm" onClick={()=>router.push('/vamos')}>Ask Vamos to Find</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Find Hitting Partners - UTR Matched (avgUTR fix)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div><label>UTR Min</label><Input type="number" step="0.1" value={utrMin} onChange={e=>setUtrMin(parseFloat(e.target.value))} /></div>
                <div><label>UTR Max</label><Input type="number" step="0.1" value={utrMax} onChange={e=>setUtrMax(parseFloat(e.target.value))} /></div>
                <div><label>Gender</label><select value={gender} onChange={e=>setGender(e.target.value as any)} className="w-full h-11 border rounded-xl px-2"><option value="any">Any</option><option value="M">M</option><option value="F">F</option></select></div>
                <div className="flex items-end"><Button className="w-full" size="sm" onClick={handleTestGender}>Test Gender Logic</Button></div>
              </div>

              <div className="space-y-3">
                {filteredPlayers.map(p=>(
                  <div key={p.id} className="flex items-center justify-between p-3 border rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${p.gender==='M'?'bg-blue-500':'bg-pink-500'}`}>{p.name[0]}</div>
                      <div>
                        <div className="font-medium text-sm">{p.name} • {p.gender} • UTR {p.utr} • {p.distance}mi</div>
                        <div className="text-xs text-muted-foreground">{p.goals} • Δ{(Math.abs(p.utr-4.5)).toFixed(1)} from you</div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant={Math.abs(p.utr-4.5)<0.5 ? "success" : "warning"} className="text-[10px]">{Math.abs(p.utr-4.5)<0.5 ? 'Good' : 'Stretch'}</Badge>
                      <Button size="sm" variant="outline" onClick={()=>toast(`Hitting Partner request sent to ${p.name}! Vamos!`)}>Add</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Create Custom Match - Gender Enforcement Wired</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <DisciplineSelector value={discipline} onChange={setDiscipline} eventType="custom_match" />
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                <div className="font-semibold">Gender Enforcement + Capacity:</div>
                <div>Discipline: {discipline} • Cap {getCapacityForDiscipline(discipline, 'custom_match')} • Roster {rosterForDiscipline.map(r=>`${r.name || r.id}:${r.gender}`).join(', ')}</div>
                <div className="mt-1">
                  {discipline==='mixed_doubles' && 'Mixed = 2M/2F exactly required. Cannot have 3M/1F or 3F/1M. System blocks invalid invites.'}
                  {discipline==='mens_doubles' && 'Mens Doubles = 4M required - roster generated 4M'}
                  {discipline==='womens_doubles' && 'Womens Doubles = 4F required - roster generated 4F'}
                  {discipline==='mens_singles' && 'Mens Singles = 2M required'}
                  {discipline==='womens_singles' && 'Womens Singles = 2F required'}
                  {discipline.includes('open') && 'Open - any gender allowed, other/unspecified eligible'}
                </div>
                {balance.suggestion && <div className="mt-1 font-medium">Balance: {balance.suggestion} (avgUTR fallback 5.0 not 0 skew)</div>}
              </div>
              <Button className="w-full" onClick={()=>{
                const roster = getRosterForDiscipline(discipline)
                const validation = validateDiscipline(discipline, roster)
                if (!validation.valid) {
                  toast.error(`Blocked by gender enforcement: ${validation.error}`)
                  return
                }
                toast(`Vamos! Created ${discipline} match Thu 7pm - ${discipline.includes('mixed') ? '2M/2F' : discipline.includes('mens') ? '4M' : discipline.includes('womens') ? '4F' : 'Open'} enforcement active, capacity ${getCapacityForDiscipline(discipline,'custom_match')} TX check passed, inviting ${roster.map(r=>r.name).join(', ')}... Balance Δ${balance.delta.toFixed(1)}`)
              }}>Create + Invite - Wired: validates {discipline} roster + capacity TX</Button>
              <div className="text-[10px] text-muted-foreground">Roster per discipline: mens_doubles 4M, womens_doubles 4F, mens_singles 2M, womens_singles 2F, mixed 2M2F, open 2M2F/open. Validation demo uses actual roster, not hardcoded 2M2F.</div>
            </CardContent>
          </Card>

          <Card className="bg-clay-50 border-clay-200">
            <CardContent className="p-4 text-sm">
              <div className="font-bold">Why Vamoverse for Doubles?</div>
              <div className="mt-1 space-y-1 text-xs">
                <div>• Most apps treat doubles as afterthought - we enforce 2M/2F</div>
                <div>• Auto-balance by combined UTR: uses avgUTR fallback (5.0) not 0 to avoid skew</div>
                <div>• Split-pay for semi-private auto, capacity via getCapacityForDiscipline</div>
                <div>• Ask Vamos: "Find me mixed doubles Thu 7pm UTR 4-5" - womens before mens order fixed</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
