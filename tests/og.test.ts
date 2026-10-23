import { describe, expect, it } from 'vitest'
import { buildTags, escapeHtml, parseSlug, toOgInfo } from '../worker/og'

describe('parseSlug', () => {
  it('reconoce /slug y /slug/n', () => {
    expect(parseSlug('/dulce-hogar')).toBe('dulce-hogar')
    expect(parseSlug('/dulce-hogar/3')).toBe('dulce-hogar')
    expect(parseSlug('/dulce-hogar/')).toBe('dulce-hogar')
  })
  it('ignora archivos, rutas profundas y la raíz', () => {
    for (const p of ['/', '/favicon.svg', '/assets/index-abc.js', '/a/b/c', '/a/x', '/Mayus', '/-a'])
      expect(parseSlug(p), p).toBeNull()
  })
})

describe('toOgInfo', () => {
  const base = {
    name: 'Primavera',
    page: { version: 2, pages: [{ props: { title: 'x' } }, { props: { image: 'https://x.test/portada.webp' } }] },
    data: { business: { name: 'Dulce Hogar', tagline: 'Pasteles por encargo', logo: 'https://x.test/logo.webp' }, products: [] },
  }
  it('usa la primera imagen de las páginas y el lema como descripción', () => {
    expect(toOgInfo(base)).toEqual({
      title: 'Primavera',
      description: 'Pasteles por encargo',
      image: 'https://x.test/portada.webp',
    })
  })
  it('sin portada usa la primera foto de producto y después el logo', () => {
    const conProducto = { ...base, page: { version: 2, pages: [] }, data: { ...base.data, products: [{ images: ['https://x.test/p.webp'] }] } }
    expect(toOgInfo(conProducto)?.image).toBe('https://x.test/p.webp')
    expect(toOgInfo({ ...base, page: { version: 2, pages: [] } })?.image).toBe('https://x.test/logo.webp')
  })
  it('sin lema usa el nombre del negocio, y descarta imágenes que no son https', () => {
    const info = toOgInfo({ ...base, page: { pages: [{ props: { image: 'http://x.test/a.png' } }] }, data: { business: { name: 'Dulce Hogar' } } })
    expect(info).toEqual({ title: 'Primavera', description: 'Catálogo de Dulce Hogar', image: null })
  })
  it('un catálogo inexistente da null', () => {
    expect(toOgInfo(null)).toBeNull()
  })
})

describe('buildTags', () => {
  it('escapa el contenido y agrega la imagen si existe', () => {
    const html = buildTags({ title: 'A "B" <i>', description: 'x & y', image: 'https://x.test/a.webp' }, 'https://v.test/a')
    expect(html).toContain('content="A &quot;B&quot; &lt;i&gt;"')
    expect(html).toContain('content="x &amp; y"')
    expect(html).toContain('property="og:image" content="https://x.test/a.webp"')
    expect(html).toContain('summary_large_image')
  })
  it('sin imagen no genera og:image', () => {
    const html = buildTags({ title: 'A', description: 'B', image: null }, 'https://v.test/a')
    expect(html).not.toContain('og:image')
    expect(escapeHtml('<&">')).toBe('&lt;&amp;&quot;&gt;')
  })
})