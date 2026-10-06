import { useState } from 'preact/hooks'

const compact = value => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
export const formatBalance = value => value == null ? 'Unavailable' : Intl.NumberFormat('en', { maximumFractionDigits: 6 }).format(Number(value))
export const formatTime = value => value ? new Date(value).toLocaleString('en', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC' : 'Unavailable'

export default function Chart ({ points, selected, onSelect, symbol }) {
  const [hover, setHover] = useState(null)
  const start = points[0].slot
  const end = points.at(-1).slot
  const max = Math.max(1, ...points.filter(p => p.balance !== null).map(p => Number(p.balance)), selected?.slot >= start && selected?.slot <= end ? Number(selected.balance) : 0) * 1.12
  const span = Math.max(1, points.at(-1).slot - start)
  const x = p => 72 + Math.max(0, Math.min(1, (p.slot - start) / span)) * 850
  const y = p => 280 - Number(p.balance) / max * 230
  const active = hover === null ? selected : points[hover]
  const segments = []
  let segment = []
  for (const p of points) {
    if (p.balance === null) { if (segment.length) segments.push(segment); segment = [] } else segment.push(p)
  }
  if (segment.length) segments.push(segment)
  function nearest (event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const pos = (event.clientX - rect.left) / rect.width * 960
    let closest = 0
    points.forEach((p, i) => { if (Math.abs(x(p) - pos) < Math.abs(x(points[closest]) - pos)) closest = i })
    return closest
  }
  return (
    <div className='chart-wrap'>
      <svg viewBox='0 0 960 340' className='curve' role='img' aria-label={`${symbol} sampled balance history. Use the slot slider or sample table to select a point.`} onPointerMove={event => setHover(nearest(event))} onPointerLeave={() => setHover(null)} onClick={event => onSelect(points[nearest(event)])}>
        <defs><linearGradient id='curve-fill' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='var(--chart)' stop-opacity='.28' /><stop offset='100%' stop-color='var(--chart)' stop-opacity='.015' /></linearGradient></defs>
        {Array.from({ length: 5 }, (_, i) => <g key={i}><line x1='72' x2='922' y1={50 + i * 57.5} y2={50 + i * 57.5} className='grid-line' /><text x='58' y={54 + i * 57.5} text-anchor='end'>{compact(max * (1 - i / 4))}</text></g>)}
        {segments.map((segment, i) => {
          const line = segment.map((p, i) => `${i ? 'L' : 'M'}${x(p)},${y(p)}`).join(' ')
          return <g key={i}><path d={`${line} L${x(segment.at(-1))},280 L${x(segment[0])},280 Z`} fill='url(#curve-fill)' /><path d={line} className='curve-line' />{segment.length === 1 && <circle cx={x(segment[0])} cy={y(segment[0])} r='4' fill='var(--chart)' />}</g>
        })}
        {points.filter((_, i) => i % 6 === 0).map(p => <g key={p.slot}><line x1={x(p)} x2={x(p)} y1='50' y2='280' className='grid-line vertical' /><text x={x(p)} y='314' text-anchor='middle'>{p.timestamp ? new Date(p.timestamp).toLocaleDateString('en', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : `Slot ${compact(p.slot)}`}</text></g>)}
        {active && active.balance !== null && active.slot >= start && active.slot <= end && <g><line x1={x(active)} x2={x(active)} y1='38' y2='280' className='crosshair' /><circle cx={x(active)} cy={y(active)} r='6' className='selected-dot' /></g>}
      </svg>
      {active && <div className='chart-tooltip' aria-live='polite'><span>{hover !== null ? 'HOVERING' : 'SELECTED SLOT'}</span><strong>{formatBalance(active.balance)} {symbol}</strong><small>Slot {active.slot.toLocaleString()} · {formatTime(active.timestamp)}{active.resolution === 'previous-block' ? ` (previous block ${active.timestampSlot.toLocaleString()})` : ''}</small></div>}
    </div>
  )
}
