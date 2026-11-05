import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { setCurrency } from '@/lib/format'

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  currency: string
  week_starts_monday: boolean
  dashboard_widgets: string[]
  available_widgets: string[]
  targets: Record<string, number>
  ai_enabled: boolean
  ai_modules: string[]
  available_ai_modules: string[]
  auto_backup_hours: number
  height_cm: number | null
  starting_weight_kg: number | null
  body_fat_percent: number | null
  target_weight_kg: number | null
  sex_for_estimates: 'female' | 'male' | null
  age_years: number | null
  activity_level: 'sedentary' | 'light' | 'moderate' | 'very_active' | null
  suggested_nutrition_targets: Record<string, number> | null
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const s = await api<Settings>('/settings')
      setCurrency(s.currency)
      return s
    },
    staleTime: 60_000,
  })
}
