/** チェッカーフラッグ風のマーク。外部アセットを持たないため SVG を直接描く */
export function TeamMark({ size = 22 }: { size?: number }) {
  const cell = size / 4
  const filled: Array<[number, number]> = [
    [0, 0],
    [2, 0],
    [1, 1],
    [3, 1],
    [0, 2],
    [2, 2],
    [1, 3],
    [3, 3],
  ]
  return (
    <svg
      className="brand__mark"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <rect width={size} height={size} rx={size / 6} fill="#23252b" />
      {filled.map(([cx, cy]) => (
        <rect key={`${cx}-${cy}`} x={cx * cell} y={cy * cell} width={cell} height={cell} fill="#ffffff" />
      ))}
    </svg>
  )
}
