import { buildTags, parseSlug, toOgInfo, type OgInfo } from './og'

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> }
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

const TTL = 300 // segundos

async function loadInfo(slug: string, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<OgInfo | null> {
  const cache = (caches as any).default as Cache
  const key = new Request(`https://og-cache.internal/${slug}`)
  const hit = await cache.match(key)
  if (hit) return (await hit.json()) as OgInfo | null

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_public_catalog`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
      body: JSON.stringify({ p_slug: slug }),
    })
    if (!res.ok) return null
    const info = toOgInfo(await res.json())
    ctx.waitUntil(
      cache.put(key, new Response(JSON.stringify(info), { headers: { 'cache-control': `max-age=${TTL}` } })),
    )
    return info
  } catch {
    return null
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
    const url = new URL(request.url)
    const slug = request.method === 'GET' ? parseSlug(url.pathname) : null
    if (!slug) return env.ASSETS.fetch(request)

    // El mismo index.html de la aplicación
    const page = await env.ASSETS.fetch(new Request(new URL('/', url), request))
    if (!page.headers.get('content-type')?.includes('text/html')) return page

    const info = await loadInfo(slug, env, ctx)
    if (!info) return page

    const tags = buildTags(info, `${url.origin}/${slug}`)
    return new (globalThis as any).HTMLRewriter()
      .on('title', { element: (el: any) => el.setInnerContent(info.title) })
      .on('head', { element: (el: any) => el.append(tags, { html: true }) })
      .transform(page)
  },
}