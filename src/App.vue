<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { PageRenderer, PageSchema } from 'catalog-kit'
import { supabase } from './lib/supabase'

// URLs: /<slug> y /<slug>/<número de página>, por ejemplo /dulce-hogar/3
const segments = () => location.pathname.split('/').filter(Boolean)
const slug = segments()[0] ?? ''

const state = ref<'loading' | 'notfound' | 'error' | 'ready'>('loading')
const catalog = ref<{ name: string; page: unknown; data: any } | null>(null)
const current = ref(0) // índice de la página (en modo doble, de la primera del par visible)

// ===== Datos del catálogo =====
const parsed = computed(() => PageSchema.safeParse(catalog.value?.page))
const total = computed(() => (parsed.value.success && parsed.value.data.version === 2 ? parsed.value.data.pages.length : 0))
const paged = computed(() => total.value > 0)
const authorMode = computed<'single' | 'double'>(() =>
  parsed.value.success && parsed.value.data.version === 2 && parsed.value.data.display === 'double' ? 'double' : 'single',
)

// ===== Modo 1 o 2 páginas =====
// Dos páginas solo caben en pantallas anchas (2 × 560 px)
const WIDE_QUERY = '(min-width: 1180px)'
const wide = ref(false)
let mql: MediaQueryList | null = null

const PREF_KEY = 'ck-view-mode'
const userMode = ref<'single' | 'double' | null>(null)
function loadPref() {
  try {
    const v = localStorage.getItem(PREF_KEY)
    userMode.value = v === 'single' || v === 'double' ? v : null
  } catch {
    userMode.value = null
  }
}
function savePref(v: 'single' | 'double') {
  userMode.value = v
  try {
    localStorage.setItem(PREF_KEY, v)
  } catch {
    /* sin almacenamiento: la elección vale solo en esta visita */
  }
}

const double = computed(() => paged.value && wide.value && (userMode.value ?? authorMode.value) === 'double')

// En modo doble la portada va sola (a la derecha) y después van pares: [0], [1,2], [3,4]…
// Si el total es par, la última página queda sola (a la izquierda).
function spreadStart(i: number): number {
  if (!double.value || i <= 0) return Math.max(0, i)
  return i % 2 === 1 ? i : i - 1
}
// Página de la izquierda y de la derecha de un par (null = hueco vacío)
const leftOf = (s: number): number | null => (s === 0 ? null : s)
const rightOf = (s: number): number | null => (s === 0 ? 0 : s + 1 < total.value ? s + 1 : null)

const visible = computed(() => {
  const s = spreadStart(current.value)
  if (!double.value || s === 0) return [s]
  return [s, s + 1].filter((i) => i < total.value)
})
const leftPage = computed(() => leftOf(spreadStart(current.value)))
const rightPage = computed(() => rightOf(spreadStart(current.value)))

const nextIndex = computed(() => {
  const s = spreadStart(current.value)
  if (!double.value) return s + 1
  return s === 0 ? 1 : s + 2
})
const prevIndex = computed(() => {
  const s = spreadStart(current.value)
  if (!double.value) return s - 1
  return s <= 1 ? 0 : s - 2
})
const hasPrev = computed(() => visible.value[0] > 0)
const hasNext = computed(() => visible.value[visible.value.length - 1] < total.value - 1)
const counter = computed(() => {
  const v = visible.value
  const range = v.length > 1 ? `${v[0] + 1}-${v[v.length - 1] + 1}` : `${v[0] + 1}`
  return `${range} / ${total.value}`
})

// ===== Volteo de hoja (modo doble) =====
// La hoja que gira tiene un frente (F) y un reverso (B). Debajo quedan la base izquierda (L)
// y la derecha (R). Cualquiera puede estar vacía (null): portada y última página sola.
//   Avanzar: F = derecha del par actual, B = izquierda del par nuevo, L = izquierda actual, R = derecha nueva.
//   Retroceder: la misma hoja en sentido inverso.
interface Flip {
  L: number | null
  R: number | null
  F: number
  B: number
  angle: number
}
const flip = ref<Flip | null>(null)
let flipTimer: ReturnType<typeof setTimeout> | null = null

function clearFlip() {
  if (flipTimer) clearTimeout(flipTimer)
  flipTimer = null
  flip.value = null
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Devuelve true si inició el volteo (solo entre pares contiguos, en modo doble)
function tryFlip(from: number, to: number): boolean {
  if (!double.value || reducedMotion()) return false
  const s = spreadStart(from)
  const isNext = to === nextIndex.value && hasNext.value
  const isPrev = to === prevIndex.value && hasPrev.value
  if (!isNext && !isPrev) return false

  const F = isNext ? rightOf(s) : rightOf(to)
  const B = isNext ? leftOf(to) : leftOf(s)
  if (F === null || B === null) return false

  flip.value = {
    L: isNext ? leftOf(s) : leftOf(to),
    R: isNext ? rightOf(to) : rightOf(s),
    F,
    B,
    angle: isNext ? 0 : -180,
  }
  const end = isNext ? -180 : 0
  current.value = to
  // Se pinta el estado inicial y, un par de cuadros después, el final para que la transición CSS corra
  nextTick().then(() =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (flip.value) flip.value.angle = end
      }),
    ),
  )
  flipTimer = setTimeout(clearFlip, 900)
  return true
}

// ===== Animaciones de las demás transiciones =====
// 'next' / 'prev' = voltear página (modo 1 página); 'none' = cambio sin avanzar ni retroceder (desvanecer)
const dir = ref<'next' | 'prev' | 'none'>('none')
// En modo doble el contenedor conserva su identidad durante un volteo; este contador solo
// cambia en los cambios que deben desvanecerse (modo, tamaño de ventana, botón Atrás).
const fadeKey = ref(0)

function moveTo(next: number) {
  clearFlip()
  dir.value = next > current.value ? 'next' : next < current.value ? 'prev' : 'none'
  fadeKey.value++
  current.value = next
}

const onWideChange = (e: MediaQueryListEvent) => {
  clearFlip()
  dir.value = 'none'
  fadeKey.value++
  wide.value = e.matches
  current.value = spreadStart(current.value)
}

const transitionName = computed(() => {
  if (double.value || dir.value === 'none') return 'fade'
  return dir.value === 'next' ? 'turn-next' : 'turn-prev'
})
const spreadKey = computed(() => (double.value ? `d-${fadeKey.value}` : `s-${visible.value.join('-')}`))

function setMode(m: 'single' | 'double') {
  clearFlip()
  dir.value = 'none'
  fadeKey.value++
  savePref(m)
  current.value = spreadStart(current.value)
  history.replaceState({}, '', `/${slug}/${current.value + 1}`)
}

// ===== Navegación =====
function indexFromUrl(): number {
  const n = parseInt(segments()[1] ?? '1', 10)
  const i = Number.isFinite(n) && n >= 1 ? n - 1 : 0
  return spreadStart(total.value ? Math.min(i, total.value - 1) : 0)
}

function go(i: number) {
  if (flip.value) return // hay una hoja girando: se ignoran clics y gestos hasta que termine
  const next = spreadStart(Math.max(0, Math.min(total.value - 1, i)))
  if (next === current.value) return
  if (!tryFlip(current.value, next)) moveTo(next)
  history.pushState({}, '', `/${slug}/${next + 1}`)
  window.scrollTo({ top: 0 })
}

function onPopState() {
  moveTo(indexFromUrl())
  window.scrollTo({ top: 0 })
}

function onKey(e: KeyboardEvent) {
  if (!paged.value) return
  if (e.key === 'ArrowRight' && hasNext.value) go(nextIndex.value)
  if (e.key === 'ArrowLeft' && hasPrev.value) go(prevIndex.value)
}

// Deslizar: izquierda = siguiente, derecha = anterior.
// Los elementos con data-no-swipe (como el carrusel de fotos) se quedan con su propio deslizamiento.
let startX = 0
let startY = 0
let ignoreSwipe = false
function onTouchStart(e: TouchEvent) {
  ignoreSwipe = !!(e.target as Element | null)?.closest?.('[data-no-swipe]')
  startX = e.touches[0].clientX
  startY = e.touches[0].clientY
}
function onTouchEnd(e: TouchEvent) {
  if (ignoreSwipe) return
  const dx = e.changedTouches[0].clientX - startX
  const dy = e.changedTouches[0].clientY - startY
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
  if (dx < 0 && hasNext.value) go(nextIndex.value)
  if (dx > 0 && hasPrev.value) go(prevIndex.value)
}

onMounted(async () => {
  mql = window.matchMedia(WIDE_QUERY)
  wide.value = mql.matches
  mql.addEventListener('change', onWideChange)
  loadPref()
  window.addEventListener('popstate', onPopState)
  window.addEventListener('keydown', onKey)
  if (!slug) {
    state.value = 'notfound'
    return
  }
  const { data, error } = await supabase.rpc('get_public_catalog', { p_slug: slug })
  if (error) {
    console.error(error)
    state.value = 'error'
    return
  }
  if (!data) {
    state.value = 'notfound'
    return
  }
  catalog.value = data
  document.title = data.name
  current.value = indexFromUrl()
  state.value = 'ready'
})

onBeforeUnmount(() => {
  clearFlip()
  mql?.removeEventListener('change', onWideChange)
  window.removeEventListener('popstate', onPopState)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <p v-if="state === 'loading'" class="msg">Cargando…</p>
  <p v-else-if="state === 'notfound'" class="msg">Catálogo no encontrado.</p>
  <p v-else-if="state === 'error'" class="msg">No se pudo cargar el catálogo.</p>

  <div
    v-else-if="catalog && paged"
    class="shell"
    :class="{ 'shell-double': double }"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <div class="stage">
      <Transition :name="transitionName">
        <div :key="spreadKey" :class="double ? (flip ? 'book flipping' : 'book') : 'spread'">
          <!-- Modo doble con la hoja girando: bases (pueden faltar) y la hoja de dos caras encima -->
          <template v-if="flip">
            <div v-if="flip.L !== null" class="pg slot-l">
              <PageRenderer :page="catalog.page" :data="catalog.data" :only="flip.L" />
            </div>
            <div v-if="flip.R !== null" class="pg slot-r">
              <PageRenderer :page="catalog.page" :data="catalog.data" :only="flip.R" />
            </div>
            <div class="leaf" :style="{ transform: `rotateY(${flip.angle}deg)` }">
              <div class="pg face front">
                <PageRenderer :page="catalog.page" :data="catalog.data" :only="flip.F" />
              </div>
              <div class="pg face back">
                <PageRenderer :page="catalog.page" :data="catalog.data" :only="flip.B" />
              </div>
            </div>
          </template>

          <!-- Modo doble en reposo: la portada a la derecha, la última sola a la izquierda -->
          <template v-else-if="double">
            <div v-if="leftPage !== null" class="pg slot-l">
              <PageRenderer :page="catalog.page" :data="catalog.data" :only="leftPage" />
            </div>
            <div v-if="rightPage !== null" class="pg slot-r">
              <PageRenderer :page="catalog.page" :data="catalog.data" :only="rightPage" />
            </div>
          </template>

          <!-- Modo de 1 página -->
          <template v-else>
            <div v-for="i in visible" :key="i" class="pg">
              <PageRenderer :page="catalog.page" :data="catalog.data" :only="i" />
            </div>
          </template>
        </div>
      </Transition>
    </div>

    <nav class="pager" aria-label="Páginas del catálogo">
      <button class="pager-btn" :disabled="!hasPrev" aria-label="Página anterior" @click="go(prevIndex)">‹</button>
      <span class="pager-count">{{ counter }}</span>
      <div v-if="wide" class="pager-modes" role="group" aria-label="Modo de vista">
        <button type="button" class="mode-btn" :class="{ on: !double }" :aria-pressed="!double" @click="setMode('single')">
          1 pág.
        </button>
        <button type="button" class="mode-btn" :class="{ on: double }" :aria-pressed="double" @click="setMode('double')">
          2 pág.
        </button>
      </div>
      <button class="pager-btn" :disabled="!hasNext" aria-label="Página siguiente" @click="go(nextIndex)">›</button>
    </nav>
  </div>

  <PageRenderer v-else-if="catalog" :page="catalog.page" :data="catalog.data" />
</template>

<style>
body {
  margin: 0;
  background: #e5e5e5;
}
.msg {
  padding: 1.5rem;
  font-family: system-ui, sans-serif;
}
.shell {
  max-width: 560px;
  min-height: 100vh;
  margin: 0 auto;
  padding-bottom: 4.5rem;
  background: #fff;
}
.shell-double {
  max-width: none;
  background: transparent;
}
/* El escenario da perspectiva 3D al volteo de página y contiene lo que gira */
.stage {
  position: relative;
  perspective: 2200px;
  overflow-x: clip;
}
.spread {
  display: flex;
  justify-content: center;
}
.pg {
  display: flex;
  flex-direction: column;
  flex: 0 1 560px;
  min-width: 0;
  min-height: 100vh;
  background: #fff;
}
/* La raíz de cada página se estira para que su fondo llene la altura del par */
.pg > div {
  flex: 1;
}
.shell-double .pg {
  box-shadow: 0 0 16px rgba(0, 0, 0, 0.18);
}

/* ===== Libro (modo doble) ===== */
/* Dos columnas de 560 px (el modo doble solo existe con 1180 px o más de ancho).
   Base izquierda, base derecha y hoja comparten celdas, así que la altura la marca la más alta. */
.book {
  display: grid;
  grid-template-columns: 560px 560px;
  justify-content: center;
  perspective: 2600px;
}
.book.flipping {
  pointer-events: none;
}
.slot-l {
  grid-column: 1;
  grid-row: 1;
}
.slot-r {
  grid-column: 2;
  grid-row: 1;
}
/* La hoja gira sobre el lomo (su borde izquierdo, entre las dos columnas) */
.leaf {
  grid-column: 2;
  grid-row: 1;
  position: relative;
  z-index: 2;
  transform-origin: left center;
  transform-style: preserve-3d;
  transition: transform 0.8s ease-in-out;
}
.leaf .face {
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.25);
}
/* El reverso se dibuja girado 180°: al terminar el giro queda del derecho, en la columna izquierda */
.leaf .back {
  position: absolute;
  inset: 0;
  overflow: hidden;
  transform: rotateY(180deg);
}

/* ===== Animaciones de cambio de página (modo 1 página y desvanecimientos) ===== */
/* El elemento que sale se superpone al que entra, sin ocupar espacio ni recibir toques */
.turn-next-leave-active,
.turn-prev-leave-active,
.fade-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  pointer-events: none;
}

/* Avanzar: la página actual gira sobre su borde izquierdo y deja ver la siguiente debajo */
.turn-next-leave-active {
  z-index: 2;
  transform-origin: left center;
  backface-visibility: hidden;
  transition: transform 0.65s ease-in-out, filter 0.65s ease-in-out;
}
.turn-next-leave-to {
  transform: rotateY(-100deg);
  filter: brightness(0.75);
}
.turn-next-enter-active {
  z-index: 1;
  transition: filter 0.65s ease-in-out;
}
.turn-next-enter-from {
  filter: brightness(0.8);
}

/* Retroceder: la página anterior vuelve girando encima de la actual */
.turn-prev-enter-active {
  z-index: 2;
  transform-origin: left center;
  backface-visibility: hidden;
  transition: transform 0.65s ease-in-out, filter 0.65s ease-in-out;
}
.turn-prev-enter-from {
  transform: rotateY(-100deg);
  filter: brightness(0.75);
}
.turn-prev-leave-active {
  z-index: 1;
  transition: filter 0.65s ease-in-out;
}
.turn-prev-leave-to {
  filter: brightness(0.8);
}

/* Cambios sin dirección (modo, tamaño de ventana, Atrás): desvanecer */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Quien pide menos movimiento en su sistema no ve animaciones */
@media (prefers-reduced-motion: reduce) {
  .turn-next-enter-active,
  .turn-next-leave-active,
  .turn-prev-enter-active,
  .turn-prev-leave-active,
  .fade-enter-active,
  .fade-leave-active,
  .leaf {
    transition: none !important;
  }
}

.pager {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: min(560px, 100%);
  box-sizing: border-box;
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  background: rgba(20, 20, 20, 0.92);
  color: #fff;
  font-family: system-ui, sans-serif;
}
.pager-btn {
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}
.pager-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.pager-modes {
  display: flex;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 9999px;
}
.mode-btn {
  padding: 0.35rem 0.7rem;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 0.75rem;
  cursor: pointer;
}
.mode-btn.on {
  background: #fff;
  color: #111;
}
</style>