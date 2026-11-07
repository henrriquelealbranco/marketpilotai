'use client';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Dashboard } from '@marketpilot/contracts';
import { money } from '@/lib/utils';
export function RevenueChart({ data }: { data: Dashboard['chart'] }) {
  return (
    <div
      className="revenue-chart"
      role="img"
      aria-label="Evolução do faturamento e lucro estimado no período. Totais disponíveis nos indicadores acima."
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={data} margin={{ top: 15, right: 8, bottom: 0, left: -15 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-secondary)" stopOpacity={0.08} />
              <stop offset="100%" stopColor="var(--chart-secondary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5" />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            minTickGap={40}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            tickMargin={15}
            tickFormatter={(v) => `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}`}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            tickFormatter={(v) =>
              new Intl.NumberFormat('pt-BR', {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(Number(v) / 100)
            }
            width={65}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border-strong)',
              borderRadius: 10,
              color: 'var(--foreground)',
              fontSize: 12,
            }}
            labelFormatter={(label) =>
              `Dia ${String(label).slice(8, 10)}/${String(label).slice(5, 7)}`
            }
            formatter={(value, name) => [
              money(Number(value)),
              name === 'revenueCents' ? 'Faturamento' : 'Lucro estimado',
            ]}
          />
          <Area
            type="monotone"
            dataKey="revenueCents"
            stroke="var(--chart-primary)"
            strokeWidth={2.3}
            fill="url(#revenueFill)"
            animationDuration={500}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="profitCents"
            stroke="var(--chart-secondary)"
            strokeWidth={1.8}
            fill="url(#profitFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
