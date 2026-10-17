import { useRef, useCallback, useEffect } from 'react'

interface HoldButtonProps {
  onHeld: () => void
  durationMs?: number
  disabled?: boolean
  children: React.ReactNode
  className?: string
}

/**
 * Hold-to-approve button.
 *
 * Completion is driven by a setTimeout so it fires exactly durationMs after
 * pointer/key down, regardless of tab throttling or rAF frame rate.
 * requestAnimationFrame is used only to update the visual fill progress.
 *
 * Keyboard: Space or Enter held for durationMs triggers onHeld.
 * prefers-reduced-motion: fill animation is skipped; the hold timer still runs
 * for the full durationMs so accidental taps cannot trigger the action.
 */
export function HoldButton({
  onHeld,
  durationMs = 700,
  disabled,
  children,
  className,
}: HoldButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const rafRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const t0Ref = useRef<number>(0)
  const activeRef = useRef(false)

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Cancel both the visual rAF loop and the completion timer.
  const stop = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    cancelAnimationFrame(rafRef.current)
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    btnRef.current?.classList.remove('is-holding')
    btnRef.current?.style.setProperty('--hold-progress', '0')
  }, [])

  // Stable ref for the rAF loop so it can schedule itself without capturing
  // itself during initialisation (which the React Compiler linter rejects).
  const rafStepRef = useRef<(ts: number) => void>(() => {})

  // rAF loop: only updates the visual fill -- never fires onHeld.
  // Calls itself via rafStepRef to avoid the self-reference lint error.
  const rafStep = useCallback((ts: number) => {
    if (!activeRef.current) return
    if (!t0Ref.current) t0Ref.current = ts
    const p = Math.min(1, (ts - t0Ref.current) / durationMs)
    btnRef.current?.style.setProperty('--hold-progress', String(p))
    if (p < 1) rafRef.current = requestAnimationFrame(rafStepRef.current)
  }, [durationMs])

  useEffect(() => { rafStepRef.current = rafStep })

  const start = useCallback(
    (e: React.PointerEvent | React.KeyboardEvent) => {
      if (disabled || activeRef.current) return
      if ('key' in e) {
        if (e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return
        e.preventDefault()
      }
      activeRef.current = true
      t0Ref.current = 0
      btnRef.current?.classList.add('is-holding')

      // Completion timer: fires exactly durationMs after press, regardless of rAF.
      timerRef.current = setTimeout(() => {
        if (!activeRef.current) return
        activeRef.current = false
        cancelAnimationFrame(rafRef.current)
        timerRef.current = null
        btnRef.current?.classList.remove('is-holding')
        btnRef.current?.style.setProperty('--hold-progress', '0')
        onHeld()
      }, durationMs)

      // Visual fill via rAF (skipped when prefers-reduced-motion).
      if (!reduceMotion) {
        rafRef.current = requestAnimationFrame((ts) => rafStepRef.current(ts))
      }
    },
    [disabled, durationMs, onHeld, reduceMotion],
  )

  // Cleanup on unmount.
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
  }, [])

  return (
    <button
      ref={btnRef}
      type="button"
      disabled={disabled}
      aria-label="Hold to approve"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={start}
      onKeyUp={stop}
      onBlur={stop}
      className={`hold-btn font-body font-semibold text-[13px] px-4 py-[11px] border border-ink rounded bg-plate cursor-pointer select-none touch-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tension disabled:opacity-40 disabled:cursor-not-allowed ${className ?? ''}`}
    >
      <span>{children}</span>
    </button>
  )
}
