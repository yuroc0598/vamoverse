"use client"
import { Discipline, DISCIPLINE_LABELS, EventType } from "@/lib/types/enums"
import { cn } from "@/lib/utils"
import { getCapacityForDiscipline, validateDiscipline } from "@/lib/utils/gender"
import { useState } from "react"

interface Props {
  value: Discipline
  onChange: (d: Discipline) => void
  eventType?: EventType
  onValidationChange?: (valid: boolean, error?: string) => void
}

const options: { value: Discipline, label: string, sub: string, genderIcons: string }[] = [
  { value: 'mens_singles', label: "Men's Singles", sub: "2M", genderIcons: "♂ vs ♂" },
  { value: 'womens_singles', label: "Women's Singles", sub: "2F", genderIcons: "♀ vs ♀" },
  { value: 'mens_doubles', label: "Men's Doubles", sub: "4M", genderIcons: "♂♂ vs ♂♂" },
  { value: 'womens_doubles', label: "Women's Doubles", sub: "4F", genderIcons: "♀♀ vs ♀♀" },
  { value: 'mixed_doubles', label: "Mixed Doubles", sub: "2M/2F", genderIcons: "♂♀ vs ♂♀" },
  { value: 'open_singles', label: "Open Singles", sub: "2 Any", genderIcons: "● vs ●" },
  { value: 'open_doubles', label: "Open Doubles", sub: "4 Any", genderIcons: "●● vs ●●" },
]

export function DisciplineSelector({ value, onChange, eventType = 'custom_match', onValidationChange }: Props) {
  const [validationError, setValidationError] = useState<string | undefined>(undefined)

  const handleChange = (d: Discipline) => {
    const result = validateDiscipline(d, [])
    if (!result.valid) {
      setValidationError(result.error)
      onValidationChange?.(false, result.error)
    } else {
      setValidationError(undefined)
      onValidationChange?.(true, undefined)
    }
    onChange(d)
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {options.map(opt => {
          const selected = value === opt.value
          const cap = getCapacityForDiscipline(opt.value, eventType)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleChange(opt.value)}
              className={cn(
                "p-3 border rounded-xl text-left transition-all hover:border-clay-300",
                selected ? "bg-clay-50 border-clay-500 ring-1 ring-clay-500" : "bg-white"
              )}
            >
              <div className="flex justify-between">
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{opt.sub}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{opt.genderIcons} • Capacity {cap}</div>
            </button>
          )
        })}
      </div>
      {validationError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{validationError}</div>
      )}
    </div>
  )
}
