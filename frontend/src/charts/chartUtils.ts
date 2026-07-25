import { useEffect, useRef, useState } from 'react'

/** 描画領域の実測幅。SVG を親幅に追従させるために使う */
export function useMeasuredWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (next && next > 0) setWidth(next)
    })
    observer.observe(el)
    setWidth(el.clientWidth || fallback)
    return () => observer.disconnect()
  }, [fallback])

  return { ref, width }
}

/**
 * 目盛りをきりのいい数字に丸める（0 / 5万 / 10万 …）。
 * 軸ラベルは直接ラベルを付けなかった値を担保するので、桁は必ず揃える。
 */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0]
  if (min === max) return [min]

  const step = niceStep((max - min) / target)
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step

  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) {
    // 浮動小数の誤差で -0 や 49999.999 が出ないよう丸める
    ticks.push(Math.round(v))
  }
  return ticks
}

function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rough) || 1))
  const normalized = Math.abs(rough) / magnitude
  const snapped =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return snapped * magnitude
}

/** データ端を 4px だけ丸め、ベースライン側は角のまま残す縦棒のパス */
export function columnPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0 || w <= 0) return ''
  const radius = Math.min(r, w / 2, h)
  return [
    `M${x},${y + h}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ')
}

/** 折れ線のパス（直線補間。データ点を捏造しないため曲線は使わない） */
export function linePath(points: Array<{ x: number; y: number }>): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
}
