<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PageRenderer } from 'catalog-kit'
import { supabase } from './lib/supabase'

const slug = location.pathname.split('/').filter(Boolean)[0] ?? ''
const state = ref<'loading' | 'notfound' | 'error' | 'ready'>('loading')
const catalog = ref<{ name: string; page: unknown; data: any } | null>(null)

onMounted(async () => {
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
  state.value = 'ready'
})
</script>

<template>
  <p v-if="state === 'loading'" class="p-6">Cargando…</p>
  <p v-else-if="state === 'notfound'" class="p-6">Catálogo no encontrado.</p>
  <p v-else-if="state === 'error'" class="p-6">No se pudo cargar el catálogo.</p>
  <PageRenderer v-else-if="catalog" :page="catalog.page" :data="catalog.data" />
</template>