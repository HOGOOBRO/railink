import { useEffect, useState } from 'react'

/** Returns true only after `active` has stayed true continuously for `delay` ms.
 * Flipping `active` false resets it to false immediately. Used to delay-gate
 * cold-boot loading visuals (splash / sync spinner) so a fast resolve shows
 * nothing instead of flashing the loader.
 *
 * The flag is raised in the timer callback and lowered in the effect cleanup
 * (which runs whenever `active` flips or on unmount) — neither is a synchronous
 * setState in the effect body. */
export function useDelayedFlag(active: boolean, delay = 200): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setShown(true), delay)
    return () => {
      clearTimeout(t)
      setShown(false)
    }
  }, [active, delay])
  return shown
}
