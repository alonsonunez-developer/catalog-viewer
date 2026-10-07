<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
const onWideChange = (e: MediaQueryListEvent) => {
  wide.value = e.matches
  current.value = spreadStart(current.value)
}

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

// En modo doble la portada va sola y después van pares: [0], [1,2], [3,4]…
function spreadStart(i: number): number {
  if (!double.value || i <= 0) return Math.max(0, i)
  return i % 2 === 1 ? i : i - 1
}
const visible = computed(() => {
  const s = spreadStart(current.value)
  if (!double.value || s === 0) return [s]
  return [s, s + 1].filter((i) => i < total.value)
})
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

function setMode(m: 'single' | 'double') {
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
  const next = spreadStart(Math.max(0, Math.min(total.value - 1, i)))
  if (next === current.value) return
  current.value = next
  history.pushState({}, '', `/${slug}/${next + 1}`)
  window.scrollTo({ top: 0 })
}

function onPopState() {
  current.value = indexFromUrl()
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
    <div class="spread">
      <div v-for="i in visible" :key="i" class="pg">
        <PageRenderer :page="catalog.page" :data="catalog.data" :only="i" />
      </div>
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
.pager {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
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