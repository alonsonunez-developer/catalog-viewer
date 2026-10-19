// En modo doble la portada va sola (a la derecha) y después van pares: [0], [1,2], [3,4]…
// Si el total es par, la última página queda sola (a la izquierda).

export function spreadStart(i: number, double: boolean): number {
  if (!double || i <= 0) return Math.max(0, i)
  return i % 2 === 1 ? i : i - 1
}

// Página izquierda y derecha de un par (null = hueco vacío)
export const leftOf = (s: number): number | null => (s === 0 ? null : s)
export const rightOf = (s: number, total: number): number | null => (s === 0 ? 0 : s + 1 < total ? s + 1 : null)

export function visiblePages(current: number, double: boolean, total: number): number[] {
  const s = spreadStart(current, double)
  if (!double || s === 0) return [s]
  return [s, s + 1].filter((i) => i < total)
}

export function nextIndex(current: number, double: boolean): number {
  const s = spreadStart(current, double)
  if (!double) return s + 1
  return s === 0 ? 1 : s + 2
}

export function prevIndex(current: number, double: boolean): number {
  const s = spreadStart(current, double)
  if (!double) return s - 1
  return s <= 1 ? 0 : s - 2
}

export function hasPrev(current: number, double: boolean, total: number): boolean {
  return visiblePages(current, double, total)[0] > 0
}

export function hasNext(current: number, double: boolean, total: number): boolean {
  const v = visiblePages(current, double, total)
  return v[v.length - 1] < total - 1
}

export interface FlipPlan {
  isNext: boolean
  L: number | null // base izquierda
  R: number | null // base derecha
  F: number // frente de la hoja que gira
  B: number // reverso de la hoja que gira
}

// Plan del volteo entre dos pares contiguos, o null si no aplica (modo de 1 página, saltos, extremos)
export function planFlip(from: number, to: number, double: boolean, total: number): FlipPlan | null {
  if (!double) return null
  const s = spreadStart(from, double)
  const isNext = to === nextIndex(from, double) && hasNext(from, double, total)
  const isPrev = to === prevIndex(from, double) && hasPrev(from, double, total)
  if (!isNext && !isPrev) return null

  const F = isNext ? rightOf(s, total) : rightOf(to, total)
  const B = isNext ? leftOf(to) : leftOf(s)
  if (F === null || B === null) return null

  return {
    isNext,
    L: isNext ? leftOf(s) : leftOf(to),
    R: isNext ? rightOf(to, total) : rightOf(s, total),
    F,
    B,
  }
}