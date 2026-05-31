/* Shimmer skeleton block — design_handoff_loading_states §3.
 * The `.rl-skel` class (globals.css) carries the moving-gradient animation;
 * size/shape come from `className` (Tailwind) so callers stay declarative.
 * e.g. <Skeleton className="w-13 h-3 rounded-md" /> */
interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className, style }: SkeletonProps) {
  return <div aria-hidden className={`rl-skel${className ? ` ${className}` : ''}`} style={style} />
}
