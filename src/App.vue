<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PageRenderer, PageSchema } from 'catalog-kit'
import { supabase } from './lib/supabase'

// URLs: /<slug> y /<slug>/<número de página>, por ejemplo /dulce-hogar/3
const segments = () => location.pathname.split('/').filter(Boolean)
const slug = segments()[0] ?? ''

const state = ref<'loading' | 'notfound' | 'error' | 'ready'>('loading')
const catalog = ref<{ name: string; page: unknown; data: any } | null>(null)
const current = ref(0)

const total = computed(() => {
  const r = PageSchema.safeParse(catalog.value?.page)
  return r.success && r.data.version === 2 ? r.data.pages.length : 0
})
const paged = computed(() => total.value > 0)

function indexFromUrl(): number {
  const n = parseInt(segments()[1] ?? '1', 10)
  const i = Number.isFinite(n) && n >= 1 ? n - 1 : 0
  return total.value ? Math.min(i, total.value - 1) : 0
}

function go(i: number) {
  const next = Math.max(0, Math.min(total.value - 1, i))
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
  if (e.key === 'ArrowRight') go(current.value + 1)
  if (e.key === 'ArrowLeft') go(current.value - 1)
}

// Deslizar: izquierda = siguiente, derecha = anterior
let startX = 0
let startY = 0
function onTouchStart(e: TouchEvent) {
  startX = e.touches[0].clientX
  startY = e.touches[0].clientY
}
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - startX
  const dy = e.changedTouches[0].clientY - startY
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
  go(current.value + (dx < 0 ? 1 : -1))
}

onMounted(async () => {
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
  window.removeEventListener('popstate', onPopState)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <p v-if="state === 'loading'" class="msg">Cargando…</p>
  <p v-else-if="state === 'notfound'" class="msg">Catálogo no encontrado.</p>
  <p v-else-if="state === 'error'" class="msg">No se pudo cargar el catálogo.</p>

  <div v-else-if="catalog && paged" class="shell" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
    <PageRenderer :page="catalog.page" :data="catalog.data" :only="current" />
    <nav class="pager" aria-label="Páginas del catálogo">
      <button class="pager-btn" :disabled="current === 0" aria-label="Página anterior" @click="go(current - 1)">‹</button>
      <span class="pager-count">{{ current + 1 }} / {{ total }}</span>
      <button class="pager-btn" :disabled="current === total - 1" aria-label="Página siguiente" @click="go(current + 1)">›</button>
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
</style>