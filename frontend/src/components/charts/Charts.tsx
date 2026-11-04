import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState } from '@/components/ui/Common'
import { BarChart3 } from 'lucide-react'

export const PALETTE = ['var(--chart-series-blue)', 'var(--chart-series-green)', 'var(--chart-series-amber)', 'var(--chart-series-red)', 'var(--chart-series-purple)', 'var(--chart-series-cyan)', 'var(--chart-series-teal)', 'var(--chart-series-orange)', 'var(--chart-series-neutral)']

export interface Series {
  key: string
  label: string
  color?: string
}

const axis = { stroke: 'var(--chart-axis)', fontSize: 11, tickLine: false, axisLine: false } as const
const tooltipStyle = { borderRadius: 8, border: '1px solid var(--chart-tooltip-border)', backgroundColor: 'var(--chart-tooltip-bg)', color: 'var(--chart-tooltip-text)', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.18)' }

function hasValues(data: Record<string, any>[], series: Series[]) {
  return data.some((d) => series.some((s) => Number(d[s.key]) > 0))
}

function Empty({ message }: { message?: string }) {
  return <EmptyState icon={<BarChart3 className="h-6 w-6" />} title={message ?? 'Nothing to chart yet'} hint="Charts appear once you have records in this period." />
}

const shortDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v).slice(5) : String(v))

export function TrendChart({ data, xKey = 'date', series, height = 220, area = true, emptyMessage, target, formatter }: { data: Record<string, any>[]; xKey?: string; series: Series[]; height?: number; area?: boolean; emptyMessage?: string; target?: number; formatter?: (v: number) => string }) {
  if (!data.length || !hasValues(data, series)) return <Empty message={emptyMessage} />
  const Chart = area ? AreaChart : LineChart
  return (
    <div style={{ height }} role="img" aria-label={series.map((s) => s.label).join(', ') + ' trend chart'}>
      <ResponsiveContainer>
        <Chart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" strokeOpacity={0.35} vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={shortDate} {...axis} minTickGap={24} />
          <YAxis {...axis} width={48} tickFormatter={(v) => (formatter ? formatter(v) : String(v))} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => (formatter ? formatter(v) : v)} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: 'var(--chart-tooltip-text)' }} />}
          {target ? <ReferenceLine y={target} stroke="var(--chart-axis)" strokeDasharray="4 4" label={{ value: 'Target', fill: 'var(--chart-axis)', fontSize: 11, position: 'insideTopRight' }} /> : null}
          {series.map((s, i) =>
            area ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? PALETTE[i % PALETTE.length]} fill={s.color ?? PALETTE[i % PALETTE.length]} fillOpacity={0.15} strokeWidth={2} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}

export function BarsChart({ data, xKey = 'date', series, height = 220, stacked, emptyMessage, target, formatter, layout = 'horizontal' }: { data: Record<string, any>[]; xKey?: string; series: Series[]; height?: number; stacked?: boolean; emptyMessage?: string; target?: number; formatter?: (v: number) => string; layout?: 'horizontal' | 'vertical' }) {
  if (!data.length || !hasValues(data, series)) return <Empty message={emptyMessage} />
  const vertical = layout === 'vertical'
  return (
    <div style={{ height }} role="img" aria-label={series.map((s) => s.label).join(', ') + ' bar chart'}>
      <ResponsiveContainer>
        <BarChart data={data} layout={layout} margin={{ top: 8, right: 8, left: vertical ? 24 : -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" strokeOpacity={0.35} vertical={vertical} horizontal={!vertical} />
          {vertical ? (
            <>
              <XAxis type="number" {...axis} tickFormatter={(v) => (formatter ? formatter(v) : String(v))} />
              <YAxis type="category" dataKey={xKey} {...axis} width={90} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tickFormatter={shortDate} {...axis} minTickGap={16} />
              <YAxis {...axis} width={48} tickFormatter={(v) => (formatter ? formatter(v) : String(v))} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--chart-hover)' }} formatter={(v: number) => (formatter ? formatter(v) : v)} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: 'var(--chart-tooltip-text)' }} />}
          {target && !vertical ? <ReferenceLine y={target} stroke="var(--chart-axis)" strokeDasharray="4 4" /> : null}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DonutChart({ data, height = 220, formatter, emptyMessage }: { data: { name: string; value: number }[]; height?: number; formatter?: (v: number) => string; emptyMessage?: string }) {
  const rows = data.filter((d) => d.value > 0)
  if (!rows.length) return <Empty message={emptyMessage} />
  return (
    <div style={{ height }} role="img" aria-label="Breakdown chart">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
            {rows.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => (formatter ? formatter(v) : v)} />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--chart-tooltip-text)' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
