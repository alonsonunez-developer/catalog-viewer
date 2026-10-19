import { describe, expect, it } from 'vitest'
import {
  hasNext,
  hasPrev,
  leftOf,
  nextIndex,
  planFlip,
  prevIndex,
  rightOf,
  spreadStart,
  visiblePages,
} from '../src/lib/spreads'

// Recorre el catálogo hacia adelante y devuelve lo que se ve en cada paso
function walk(total: number, double: boolean): number[][] {
  const out: number[][] = []
  let cur = 0
  for (let guard = 0; guard < 100; guard++) {
    out.push(visiblePages(cur, double, total))
    if (!hasNext(cur, double, total)) break
    cur = nextIndex(cur, double)
  }
  return out
}

describe('pares', () => {
  it('la portada va sola y después van pares', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => spreadStart(i, true))).toEqual([0, 1, 1, 3, 3, 5])
  })

  it('en 1 página no agrupa y nunca da negativos', () => {
    expect([0, 1, 2, 3].map((i) => spreadStart(i, false))).toEqual([0, 1, 2, 3])
    expect(spreadStart(-3, true)).toBe(0)
  })

  it('con total par la última página queda sola; con impar, completa', () => {
    expect(visiblePages(5, true, 6)).toEqual([5])
    expect(visiblePages(5, true, 7)).toEqual([5, 6])
    expect(visiblePages(2, true, 6)).toEqual([1, 2])
  })

  it('izquierda y derecha de cada par', () => {
    expect(leftOf(0)).toBeNull()
    expect(leftOf(3)).toBe(3)
    expect(rightOf(0, 6)).toBe(0)
    expect(rightOf(1, 6)).toBe(2)
    expect(rightOf(5, 6)).toBeNull()
    expect(rightOf(5, 7)).toBe(6)
  })
})

describe('navegación', () => {
  it('avanza y retrocede de par en par', () => {
    expect([0, 1, 3].map((i) => nextIndex(i, true))).toEqual([1, 3, 5])
    expect([5, 3, 1, 0].map((i) => prevIndex(i, true))).toEqual([3, 1, 0, 0])
    expect(nextIndex(2, false)).toBe(3)
    expect(prevIndex(2, false)).toBe(1)
  })

  it('detecta los extremos', () => {
    expect(hasPrev(0, true, 6)).toBe(false)
    expect(hasPrev(1, true, 6)).toBe(true)
    expect(hasNext(3, true, 6)).toBe(true)
    expect(hasNext(5, true, 6)).toBe(false)
    expect(hasNext(5, true, 7)).toBe(false)
    expect(hasNext(4, false, 6)).toBe(true)
    expect(hasNext(5, false, 6)).toBe(false)
  })

  it('recorrer el catálogo muestra cada página exactamente una vez', () => {
    for (const double of [true, false]) {
      for (let total = 1; total <= 12; total++) {
        const seen = walk(total, double).flat()
        expect(seen, `total ${total}, doble ${double}`).toEqual(Array.from({ length: total }, (_, i) => i))
      }
    }
  })

  it('ejemplos de recorrido', () => {
    expect(walk(6, true)).toEqual([[0], [1, 2], [3, 4], [5]])
    expect(walk(7, true)).toEqual([[0], [1, 2], [3, 4], [5, 6]])
  })
})

describe('planFlip', () => {
  it('abrir el libro: la portada gira y su reverso es la página 2', () => {
    expect(planFlip(0, 1, true, 6)).toEqual({ isNext: true, L: null, R: 2, F: 0, B: 1 })
  })

  it('entre pares completos', () => {
    expect(planFlip(1, 3, true, 6)).toEqual({ isNext: true, L: 1, R: 4, F: 2, B: 3 })
  })

  it('hacia la última página sola, con la base derecha vacía', () => {
    expect(planFlip(3, 5, true, 6)).toEqual({ isNext: true, L: 3, R: null, F: 4, B: 5 })
  })

  it('con total impar, el último par está completo', () => {
    expect(planFlip(3, 5, true, 7)).toEqual({ isNext: true, L: 3, R: 6, F: 4, B: 5 })
  })

  it('retroceder es la misma hoja en sentido inverso', () => {
    expect(planFlip(5, 3, true, 6)).toEqual({ isNext: false, L: 3, R: null, F: 4, B: 5 })
    expect(planFlip(1, 0, true, 6)).toEqual({ isNext: false, L: null, R: 2, F: 0, B: 1 })
  })

  it('las cuatro caras cubren exactamente las páginas de los dos pares', () => {
    for (let total = 2; total <= 12; total++) {
      let cur = 0
      while (hasNext(cur, true, total)) {
        const to = nextIndex(cur, true)
        const plan = planFlip(cur, to, true, total)!
        const shown = [plan.L, plan.R, plan.F, plan.B].filter((p): p is number => p !== null).sort((a, b) => a - b)
        const expected = [...new Set([...visiblePages(cur, true, total), ...visiblePages(to, true, total)])].sort(
          (a, b) => a - b,
        )
        expect(shown, `total ${total}, de ${cur} a ${to}`).toEqual(expected)
        cur = to
      }
    }
  })

  it('no voltea en 1 página, con saltos, sin cambio ni más allá de los extremos', () => {
    expect(planFlip(0, 1, false, 6)).toBeNull()
    expect(planFlip(1, 5, true, 6)).toBeNull()
    expect(planFlip(3, 3, true, 6)).toBeNull()
    expect(planFlip(5, 7, true, 6)).toBeNull()
    expect(planFlip(0, 0, true, 6)).toBeNull()
  })
})