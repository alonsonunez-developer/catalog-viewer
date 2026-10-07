<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PageRenderer, resolveTheme } from 'catalog-kit'

const props = defineProps<{ page: unknown; data: any; index: number; fit: boolean }>()

const INNER = 560 // ancho en el que se diseñó cada página
const outer = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const outerW = ref(INNER)
const outerH = ref(0)
const contentH = ref(0)
let observer: ResizeObserver | null = null

function measure() {
  if (outer.value) {
    outerW.value = outer.value.clientWidth
    outerH.value = outer.value.clientHeight
  }
  // offsetHeight no incluye la reducción: es la altura real del contenido
  if (inner.value) contentH.value = inner.value.offsetHeight
}

onMounted(() => {
  measure()
  // Se vuelve a medir cuando cargan imágenes o fuentes, o cambia el tamaño de la ventana
  observer = new ResizeObserver(measure)
  if (outer.value) observer.observe(outer.value)
  if (inner.value) observer.observe(inner.value)
})
onBeforeUnmount(() => observer?.disconnect())

// Nunca se agranda; solo se reduce lo necesario para que la página quepa entera
const scale = computed(() => {
  if (!props.fit || !contentH.value || !outerH.value) return 1
  return Math.min(1, outerH.value / contentH.value, outerW.value / INNER)
})
const offsetX = computed(() => Math.max(0, (outerW.value - INNER * scale.value) / 2))

// El hueco que deja la reducción se rellena con el fondo del tema
const background = computed(() => {
  try {
    const theme = (props.page as { theme?: unknown } | null)?.theme ?? 'joyeria'
    return resolveTheme(theme as any, props.data?.brandTheme ?? null).colors.background
  } catch {
    return '#ffffff'
  }
})
</script>

<template>
  <div ref="outer" class="fit-outer" :class="{ on: fit }" :style="fit ? { backgroundColor: background } : undefined">
    <div
      ref="inner"
      class="fit-inner"
      :class="{ on: fit }"
      :style="fit ? { transform: `translateX(${offsetX}px) scale(${scale})`, '--fill': `${outerH}px` } : undefined"
    >
      <PageRenderer :page="page" :data="data" :only="index" />
    </div>
  </div>
</template>

<style scoped>
.fit-outer.on {
  position: relative;
  overflow: hidden;
  min-height: 0;
}
.fit-inner.on {
  position: absolute;
  top: 0;
  left: 0;
  width: 560px;
  transform-origin: top left;
}
/* Portadas y contacto miden "85vh"/"70vh"; aquí llenan el alto de la página */
.fit-inner.on :deep(section[class*='min-h-']) {
  min-height: var(--fill) !important;
}
</style>