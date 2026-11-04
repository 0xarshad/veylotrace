import { BarsChart, TrendChart } from '@/components/charts/Charts'
import { Card, StatCard } from '@/components/ui/Common'
import { num } from '@/lib/format'
import { BarList, Delta, grid, NoRecords, Section, type SectionProps } from './shared'

const NUTRIENTS = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g' },
  { key: 'fat_g', label: 'Fat', unit: 'g' },
  { key: 'fibre_g', label: 'Fibre', unit: 'g' },
  { key: 'water_ml', label: 'Water', unit: 'ml' },
]

export function NutritionSection({ r, daily }: SectionProps) {
  const n = r.nutrition
  const c = r.comparison
  const avg = n.daily_average
  const t = n.targets
  const logged: number = n.days_logged
  const scope = daily ? 'for the day' : 'avg per logged day'
  const met = n.target_days_met
  return (
    <Section title="Nutrition" subtitle="Meals and water from your stored food and water logs">
      {logged > 0 ? (
        <>
          <div className={grid(4)}>
            <StatCard label={`Calories (${scope})`} value={`${num(avg.calories)} kcal`} hint={<><div>target {num(t.calories)} kcal</div><Delta d={c.calories_avg} good="neutral" /></>} />
            <StatCard label={`Protein (${scope})`} value={`${num(avg.protein_g)} g`} hint={<><div>target {num(t.protein_g)} g</div><Delta d={c.protein_avg} good="up" /></>} tone={avg.protein_g >= t.protein_g ? 'good' : 'default'} />
            <StatCard label={`Water (${scope})`} value={`${num(avg.water_ml)} ml`} hint={`target ${num(t.water_ml)} ml`} tone={avg.water_ml >= t.water_ml ? 'good' : 'default'} />
            <StatCard label="Days logged" value={logged} hint={`Calorie target met ${met.calories}, protein ${met.protein}, water ${met.water} day${met.water === 1 ? '' : 's'}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`Daily averages vs targets (${scope})`}>
              <BarList
                empty=""
                rows={NUTRIENTS.map((x) => ({
                  label: x.label,
                  value: avg[x.key],
                  max: t[x.key],
                  tone: avg[x.key] >= t[x.key] ? 'good' : 'brand',
                  text: `${num(avg[x.key])} / ${num(t[x.key])} ${x.unit}`,
                }))}
              />
            </Card>
            <Card title="Target days met">
              <BarList
                empty=""
                rows={[
                  { label: 'Calories within target', value: met.calories, max: logged, text: `${met.calories} of ${logged} days` },
                  { label: 'Protein target reached', value: met.protein, max: logged, text: `${met.protein} of ${logged} days` },
                  { label: 'Water target reached', value: met.water, max: logged, text: `${met.water} of ${logged} days` },
                ]}
              />
            </Card>
            {!daily && (
              <>
                <Card title="Calories per day"><TrendChart data={n.daily} series={[{ key: 'calories', label: 'Calories', color: 'var(--chart-series-orange)' }]} target={t.calories} emptyMessage="No meals logged in this period" /></Card>
                <Card title="Protein per day (g)"><TrendChart data={n.daily} series={[{ key: 'protein_g', label: 'Protein', color: 'var(--chart-series-green)' }]} target={t.protein_g} emptyMessage="No meals logged in this period" /></Card>
                <Card title="Carbs per day (g)"><TrendChart data={n.daily} series={[{ key: 'carbs_g', label: 'Carbs', color: 'var(--chart-series-purple)' }]} emptyMessage="No meals logged in this period" /></Card>
                <Card title="Water per day (ml)"><BarsChart data={n.daily} series={[{ key: 'water_ml', label: 'Water', color: 'var(--chart-series-cyan)' }]} target={t.water_ml} emptyMessage="No water logged in this period" /></Card>
              </>
            )}
          </div>
        </>
      ) : (
        <NoRecords what="nutrition" />
      )}
    </Section>
  )
}
