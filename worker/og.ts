const SLUG_PATH = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/\d+)?\/?$/

// "/mi-catalogo" y "/mi-catalogo/3" -> "mi-catalogo". Cualquier otra ruta (archivos, etc.) -> null
export function parseSlug(pathname: string): string | null {
  const m = pathname.match(SLUG_PATH)
  return m ? m[1] : null
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const isHttps = (v: unknown): v is string => typeof v === 'string' && /^https:\/\//.test(v)

export interface OgInfo {
  title: string
  description: string
  image: string | null
}

// Resume la respuesta de get_public_catalog en lo que necesitan las etiquetas
export function toOgInfo(catalog: any): OgInfo | null {
  if (!catalog || typeof catalog.name !== 'string') return null
  const entries: any[] = Array.isArray(catalog.page?.pages)
    ? catalog.page.pages
    : Array.isArray(catalog.page?.sections)
      ? catalog.page.sections
      : []
  const business = catalog.data?.business ?? {}
  const fromPages = entries.map((p) => p?.props?.image).find(isHttps)
  const fromProducts = (catalog.data?.products ?? [])
    .flatMap((p: any) => [p?.image, ...(Array.isArray(p?.images) ? p.images : [])])
    .find(isHttps)
  const image = fromPages ?? fromProducts ?? (isHttps(business.logo) ? business.logo : null)
  const tagline = typeof business.tagline === 'string' ? business.tagline.trim() : ''
  const businessName = typeof business.name === 'string' ? business.name.trim() : ''
  const description = tagline || (businessName ? `Catálogo de ${businessName}` : 'Catálogo digital')
  return { title: catalog.name, description, image }
}

export function buildTags(info: OgInfo, url: string): string {
  const t = escapeHtml(info.title)
  const d = escapeHtml(info.description)
  const u = escapeHtml(url)
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    `<meta name="description" content="${d}">`,
    `<meta name="twitter:card" content="${info.image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
  ]
  if (info.image) {
    const i = escapeHtml(info.image)
    tags.push(`<meta property="og:image" content="${i}">`, `<meta name="twitter:image" content="${i}">`)
  }
  return tags.join('\n')
}