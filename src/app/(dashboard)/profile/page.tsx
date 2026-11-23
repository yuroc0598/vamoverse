"use client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/useAuth"
import { useState } from "react"
import { useEffect } from "react"
import { toast } from "sonner"
import { apiUrl } from "@/lib/api"

interface UtrLink {
  id: string
  name: string
  claimed: boolean
  checkedAt: string | null
}

const DEMO_UTR_LINK_KEY = 'vamoverse_demo_utr_link'

function ratingInputValue(value: unknown): string {
  return value == null ? "" : String(Number(value))
}

export default function ProfilePage() {
  const { user, isMock } = useAuth()
  const [utrSingles, setUtrSingles] = useState("4.5")
  const [utrDoubles, setUtrDoubles] = useState("4.2")
  const [ntrp, setNtrp] = useState("3.5")
  const [utrLink, setUtrLink] = useState<UtrLink | null>(null)
  const [utrIdInput, setUtrIdInput] = useState("")
  const [utrNameInput, setUtrNameInput] = useState("")
  const [checkingUtr, setCheckingUtr] = useState(false)

  useEffect(() => {
    const displayName = user?.display_name
    if (displayName) setUtrNameInput((current) => current || displayName)
  }, [user?.display_name])

  useEffect(() => {
    if (isMock) {
      try {
        const saved = JSON.parse(localStorage.getItem('vamoverse_demo_ratings') || 'null')
        if (saved) {
          setUtrSingles(String(saved.utrSingles))
          setUtrDoubles(String(saved.utrDoubles))
          setNtrp(String(saved.ntrp))
        }
        const savedLink = JSON.parse(localStorage.getItem(DEMO_UTR_LINK_KEY) || 'null')
        if (savedLink?.id) setUtrLink(savedLink)
      } catch {}
      return
    }
    if (!user) return
    let cancelled = false
    fetch(apiUrl('/api/profile'))
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok || cancelled || !payload.profile) return
        const profile = payload.profile
        setUtrSingles(ratingInputValue(profile.utr_singles))
        setUtrDoubles(ratingInputValue(profile.utr_doubles))
        setNtrp(ratingInputValue(profile.ntrp))
        setUtrLink(profile.utr_player_id ? {
          id: profile.utr_player_id,
          name: profile.utr_account_name || '',
          claimed: Boolean(profile.utr_account_claimed),
          checkedAt: profile.utr_account_checked_at || null,
        } : null)
      })
      .catch(() => { /* keep defaults; saving still reports errors */ })
    return () => { cancelled = true }
  }, [isMock, user])

  const linkUtrAccount = async () => {
    if (!utrIdInput.trim() || utrNameInput.trim().length < 2) {
      toast.error('Enter your UTR ID or profile link, and your name as shown on UTR.')
      return
    }
    setCheckingUtr(true)
    try {
      const response = await fetch(apiUrl('/api/profile/utr'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utrId: utrIdInput, name: utrNameInput }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'UTR lookup failed')
      const link: UtrLink = {
        id: payload.account.id,
        name: payload.account.displayName,
        claimed: Boolean(payload.account.claimed),
        checkedAt: new Date().toISOString(),
      }
      setUtrLink(link)
      setUtrIdInput("")
      if (isMock) {
        localStorage.setItem(DEMO_UTR_LINK_KEY, JSON.stringify(link))
        toast.info('UTR account found. Demo link saved on this device only.')
      } else {
        toast.success('UTR account found and linked to your profile.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'UTR lookup failed')
    } finally {
      setCheckingUtr(false)
    }
  }

  const unlinkUtrAccount = async () => {
    if (isMock) {
      localStorage.removeItem(DEMO_UTR_LINK_KEY)
      setUtrLink(null)
      return
    }
    try {
      const response = await fetch(apiUrl('/api/profile/utr'), { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unlink failed')
      setUtrLink(null)
      toast.success('UTR account unlinked.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unlink failed')
    }
  }

  const saveRatings = async () => {
    const singles = Number(utrSingles)
    const doubles = Number(utrDoubles)
    const parsedNtrp = Number(ntrp)
    if (!Number.isFinite(singles) || singles < 1 || singles > 16.5 || !Number.isFinite(doubles) || doubles < 1 || doubles > 16.5 || !Number.isFinite(parsedNtrp) || parsedNtrp < 1 || parsedNtrp > 7) {
      toast.error('Enter valid UTR (1–16.5) and NTRP (1–7) ratings.')
      return
    }
    if (isMock) {
      localStorage.setItem('vamoverse_demo_ratings', JSON.stringify({ utrSingles: singles, utrDoubles: doubles, ntrp: parsedNtrp }))
      toast.info('Demo ratings saved on this device only.')
      return
    }
    try {
      const response = await fetch(apiUrl('/api/profile'), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utrSingles: singles, utrDoubles: doubles, ntrp: parsedNtrp }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Profile update failed')
      toast.success('Ratings saved to your profile.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Profile update failed')
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Profile - {user?.display_name || user?.email}</h1>
      
      <Card>
        <CardHeader><CardTitle>Identity</CardTitle><CardDescription>Role: {user?.role} • Manual ratings V1</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">Display Name</label><Input defaultValue={user?.display_name || ''} disabled /><div className="text-[10px] text-muted-foreground mt-1">Display-name editing is not enabled.</div></div>
            <div><label className="text-xs font-medium">Email</label><Input defaultValue={user?.email || ''} disabled /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium">UTR Singles (1-16.5)</label><Input value={utrSingles} onChange={e=>setUtrSingles(e.target.value)} placeholder="4.5" /><div className="text-[10px] text-muted-foreground mt-1">Self-reported • Unverified</div></div>
            <div><label className="text-xs font-medium">UTR Doubles (1-16.5)</label><Input value={utrDoubles} onChange={e=>setUtrDoubles(e.target.value)} placeholder="4.2" /></div>
            <div><label className="text-xs font-medium">NTRP (1.0-7.0)</label><Input value={ntrp} onChange={e=>setNtrp(e.target.value)} placeholder="3.5" /></div>
          </div>
          <div className="flex gap-2">
            <Badge variant="success">Good Match • You are UTR 4.5 • Event range 4-5</Badge>
            <Badge variant="outline">Self-reported, current values only</Badge>
          </div>
          <Button onClick={saveRatings}>{isMock ? 'Save Ratings on This Device' : 'Save Ratings'}</Button>

          <div className="border-t pt-4 space-y-3">
            <div>
              <div className="text-sm font-medium">UTR account</div>
              <div className="text-xs text-muted-foreground">
                We check that a UTR account with this ID and name exists. This does not confirm your rating, which stays self-reported.
              </div>
            </div>
            {utrLink ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">UTR account found</Badge>
                <a
                  className="text-sm underline"
                  href={`https://app.utrsports.net/profiles/${utrLink.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {utrLink.name || 'UTR profile'} • ID {utrLink.id}
                </a>
                {!utrLink.claimed && <Badge variant="warning">Profile not claimed on UTR</Badge>}
                <Button variant="outline" size="sm" onClick={unlinkUtrAccount}>Unlink</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <div>
                  <label className="text-xs font-medium">UTR ID or profile link</label>
                  <Input value={utrIdInput} onChange={e=>setUtrIdInput(e.target.value)} placeholder="https://app.utrsports.net/profiles/1234567" />
                </div>
                <div>
                  <label className="text-xs font-medium">Name on UTR</label>
                  <Input value={utrNameInput} onChange={e=>setUtrNameInput(e.target.value)} placeholder="First Last" />
                </div>
                <Button onClick={linkUtrAccount} disabled={checkingUtr}>{checkingUtr ? 'Checking…' : 'Check UTR Account'}</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {user?.role==='coach' && (
        <Card>
          <CardHeader><CardTitle>Rate Card - Coach Only</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <div><label className="text-xs">Private $/hr</label><Input defaultValue="80" disabled /></div>
            <div><label className="text-xs">Semi-Private $/person</label><Input defaultValue="50" disabled /></div>
            <div><label className="text-xs">Group $/person</label><Input defaultValue="30" disabled /></div>
            <div className="col-span-3 text-xs text-muted-foreground">Sample rate card only; editing is not enabled.</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Goals & Availability</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            {['Fun Fitness','League Prep','Tournament','Social'].map(g=>(
              <Badge key={g} variant="outline">{g}</Badge>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">Sample availability only; editing and production Vamos scheduling are not enabled.</div>
        </CardContent>
      </Card>
    </div>
  )
}
