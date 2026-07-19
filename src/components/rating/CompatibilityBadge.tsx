"use client"
import { Badge } from "@/components/ui/badge"
import { getCompatibility, getCompatibilityColor } from "@/lib/utils/rating"

export function CompatibilityBadge({ playerUTR, minUTR, maxUTR }: { playerUTR?: number, minUTR?: number, maxUTR?: number }) {
  const { status, label } = getCompatibility(playerUTR, minUTR, maxUTR)
  
  if (status === 'unknown') return <Badge variant="muted" className="text-[10px]">{label}</Badge>
  
  return <Badge className={`${getCompatibilityColor(status)} text-[10px] border`}>{label}</Badge>
}
