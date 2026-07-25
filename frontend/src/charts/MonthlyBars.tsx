import { useState } from 'react'
import type { MonthlyPoint } from '../lib/finance'
import { formatMonth, formatMonthAxis, formatYen, formatYenCompact } from '../lib/format'
import { Empty } from '../components/ui'
import { columnPath, niceTicks, useMeasuredWidth } from './chartUtils'

const INCOME = '#2a78d6'
const EXPENSE = '#eb6834'
const GRID = '#e1e0d9'
const BASELINE = '#c3c2b7'
const MUTED = '#898781'

const H = 212
const PAD = { top: 16, right: 14, bottom: 28, left: 58 }
const MAX_BAR = 24
const GAP = 2 // 隣り合う棒を分けるのは白い隙間。枠線は引かない

/** 月ごとの収入と支出（チーム口座から出た現金ベース） */
export function MonthlyBars({ data }: { data: MonthlyPoint[] }) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  if (data.length === 0) {
    return <Empty title="まだ記録がありません">収入か支出を登録すると月次の収支が表示されます。</Empty>
  }

  const plotW = Math.max(width - PAD.left - PAD.right, 60)
  const plotH = H - PAD.top - PAD.bottom

  const ticks = niceTicks(0, Math.max(1, ...data.map((d) => Math.max(d.income, d.cashOut))))
  const yMax = ticks[ticks.length - 1] || 1
  const y = (v: number) => plotH - (v / yMax) * plotH

  const band = plotW / data.length
  const barW = Math.min(MAX_BAR, Math.max(3, (band * 0.62 - GAP) / 2))
  const groupW = barW * 2 + GAP
  const active = hover === null ? null : data[hover]
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 46))))

  return (
    <div className="chart" ref={ref}>
      <div className="chart__legend">
        <span>
          <span className="dot" style={{ background: INCOME }} />
          収入
        </span>
        <span>
          <span className="dot" style={{ background: EXPENSE }} />
          支出（チーム口座から出た額）
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${H}`} height={H} role="img" aria-label="月ごとの収入と支出">
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text className="chart__tick" x={-10} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {formatYenCompact(t)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const left = i * band + (band - groupW) / 2
            return (
              <g
                key={d.month}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((current) => (current === i ? null : current))}
              >
                {/* 帯全体を当たり判定にする（細い棒を狙わせない） */}
                <rect x={i * band} y={0} width={band} height={plotH} fill="transparent" />
                {hover === i ? (
                  <rect x={i * band} y={0} width={band} height={plotH} fill="#0b0b0b" opacity={0.03} />
                ) : null}
                <path d={columnPath(left, y(d.income), barW, plotH - y(d.income))} fill={INCOME} />
                <path
                  d={columnPath(left + barW + GAP, y(d.cashOut), barW, plotH - y(d.cashOut))}
                  fill={EXPENSE}
                />
              </g>
            )
          })}

          <line x1={0} x2={plotW} y1={plotH} y2={plotH} stroke={BASELINE} strokeWidth={1} />
          {data.map((d, i) =>
            i % labelEvery === 0 || i === data.length - 1 ? (
              <text
                key={d.month}
                className="chart__tick"
                x={i * band + band / 2}
                y={plotH + 16}
                textAnchor="middle"
                fill={MUTED}
              >
                {formatMonthAxis(d.month)}
              </text>
            ) : null,
          )}
        </g>
      </svg>

      {active ? (
        <div
          className="chart__tooltip"
          style={{
            left: clamp(
              PAD.left + (hover as number) * band + band / 2,
              90,
              Math.max(90, width - 90),
            ),
            top: PAD.top + Math.min(y(active.income), y(active.cashOut)) - 10,
          }}
        >
          <div className="chart__tooltip-title">{formatMonth(active.month)}</div>
          <div className="chart__tooltip-row">
            <span className="chart__tooltip-key">
              <span className="dot" style={{ background: INCOME }} />
              収入
            </span>
            <b>{formatYen(active.income)}</b>
          </div>
          <div className="chart__tooltip-row">
            <span className="chart__tooltip-key">
              <span className="dot" style={{ background: EXPENSE }} />
              支出
            </span>
            <b>{formatYen(active.cashOut)}</b>
          </div>
          <div className="chart__tooltip-row">
            <span>収支</span>
            <b>{formatYen(active.net)}</b>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
