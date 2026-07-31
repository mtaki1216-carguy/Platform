import { useState } from 'react'
import type { MonthlyPoint } from '../lib/finance'
import { formatMonth, formatMonthAxis, formatYen, formatYenCompact } from '../lib/format'
import { Empty } from '../components/ui'
import { linePath, niceTicks, useMeasuredWidth } from './chartUtils'

const SURFACE = '#ffffff'
const SERIES = '#5b5bd6'
const GRID = '#eff0f3'
const BASELINE = '#dcdee3'
const MUTED = '#6f747e'

const H = 232
const PAD = { top: 18, right: 62, bottom: 28, left: 58 }

/**
 * チーム残高の推移。単一系列なので凡例は置かない（見出しが何のグラフか言っている）。
 */
export function BalanceChart({ data }: { data: MonthlyPoint[] }) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  if (data.length === 0) {
    return <Empty title="まだ記録がありません">収入か支出を登録すると残高の推移が表示されます。</Empty>
  }

  const plotW = Math.max(width - PAD.left - PAD.right, 60)
  const plotH = H - PAD.top - PAD.bottom

  const values = data.map((d) => d.balance)
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values))
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]
  const span = yMax - yMin || 1

  const x = (i: number) => (data.length === 1 ? plotW / 2 : (plotW * i) / (data.length - 1))
  const y = (v: number) => plotH - ((v - yMin) / span) * plotH

  const points = data.map((d, i) => ({ x: x(i), y: y(d.balance) }))
  const line = linePath(points)
  const area = `${line} L${points[points.length - 1].x},${plotH} L${points[0].x},${plotH} Z`

  const last = data[data.length - 1]
  const lastPoint = points[points.length - 1]
  const active = hover === null ? null : data[hover]

  // 月ラベルは詰まりすぎないよう間引く
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 46))))

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${width} ${H}`} height={H} role="img" aria-label="チーム残高の推移">
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* 目盛りとグリッド（ハイライトは 0 のみ） */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={0}
                x2={plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? BASELINE : GRID}
                strokeWidth={1}
              />
              <text className="chart__tick" x={-10} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {formatYenCompact(t)}
              </text>
            </g>
          ))}

          <path d={area} fill={SERIES} opacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke={SERIES}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* 末尾の値だけ直接ラベル。全点に数字は置かない */}
          <circle cx={lastPoint.x} cy={lastPoint.y} r={4} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
          <text
            className="chart__label"
            x={lastPoint.x + 10}
            y={lastPoint.y}
            dominantBaseline="middle"
          >
            {formatYenCompact(last.balance)}
          </text>

          {/* ホバー中のクロスヘア */}
          {active ? (
            <g pointerEvents="none">
              <line
                x1={x(hover as number)}
                x2={x(hover as number)}
                y1={0}
                y2={plotH}
                stroke={BASELINE}
                strokeWidth={1}
              />
              <circle
                cx={x(hover as number)}
                cy={y(active.balance)}
                r={4.5}
                fill={SERIES}
                stroke={SURFACE}
                strokeWidth={2}
              />
            </g>
          ) : null}

          {/* X 軸 */}
          <line x1={0} x2={plotW} y1={plotH} y2={plotH} stroke={BASELINE} strokeWidth={1} />
          {data.map((d, i) =>
            i % labelEvery === 0 || i === data.length - 1 ? (
              <text
                key={d.month}
                className="chart__tick"
                x={x(i)}
                y={plotH + 16}
                textAnchor="middle"
                fill={MUTED}
              >
                {formatMonthAxis(d.month)}
              </text>
            ) : null,
          )}

          {/* 当たり判定（マークより広く取る） */}
          <rect
            x={0}
            y={0}
            width={plotW}
            height={plotH}
            fill="transparent"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const box = (e.target as SVGRectElement).getBoundingClientRect()
              const ratio = (e.clientX - box.left) / (box.width || 1)
              setHover(Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1)))))
            }}
          />
        </g>
      </svg>

      {active ? (
        <div
          className="chart__tooltip"
          style={{
            left: clamp(PAD.left + x(hover as number), 90, Math.max(90, width - 90)),
            top: PAD.top + y(active.balance) - 12,
          }}
        >
          <div className="chart__tooltip-title">{formatMonth(active.month)}</div>
          <div className="chart__tooltip-row">
            <span className="chart__tooltip-key">
              <span className="dot" style={{ background: SERIES }} />
              月末残高
            </span>
            <b>{formatYen(active.balance)}</b>
          </div>
          <div className="chart__tooltip-row">
            <span>収入</span>
            <b>{formatYen(active.income)}</b>
          </div>
          <div className="chart__tooltip-row">
            <span>支出（口座から）</span>
            <b>{formatYen(active.cashOut)}</b>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
