import { cn } from '@/lib/utils'

type ChipColor =
  | 'brand' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'
  | 'c6' | 'c7' | 'c8' | 'c9' | 'c10'

interface ChipProps {
  label: string
  color?: ChipColor
  className?: string
}

const colorClasses: Record<ChipColor, string> = {
  brand: 'bg-brand-050 text-brand border-brand-100',
  c1:    'bg-c1-soft text-c1 border-c1',
  c2:    'bg-c2-soft text-c2 border-c2',
  c3:    'bg-c3-soft text-c3 border-c3',
  c4:    'bg-c4-soft text-c4 border-c4',
  c5:    'bg-c5-soft text-c5 border-c5',
  c6:    'bg-c6-soft text-c6 border-c6',
  c7:    'bg-c7-soft text-c7 border-c7',
  c8:    'bg-c8-soft text-c8 border-c8',
  c9:    'bg-c9-soft text-c9 border-c9',
  c10:   'bg-c10-soft text-c10 border-c10',
}

export function Chip({ label, color = 'brand', className }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1 py-0.5 rounded-pill text-caption font-semibold tracking-wide border',
        colorClasses[color],
        className,
      )}
    >
      {label}
    </span>
  )
}
