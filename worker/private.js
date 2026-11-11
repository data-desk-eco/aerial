// /private/<key>: the archive's private tables (data-desk-raw tables/<key>)
// to a data desk login, so aerial reads them as it reads the public bucket,
// ranged. cloudflare access gates the path at the edge, and the login is
// checked here as well, so a dropped path rule cannot open it. the read key
// (RAW, the raw-read-env lines) reads tables/ and nothing else; it signs each
// request here and never reaches the page. /private/?to=<path> is where the
// edge's login lands, and it goes back to the page that asked.
const HOST = 's3.waw3-2.cloudferro.com', REGION = 'WAW3-2'
const enc = new TextEncoder()
const hex = b => [...new Uint8Array(b)]
  .map(x => x.toString(16).padStart(2, '0')).join('')
const hmac = async (k, s) => crypto.subtle.sign('HMAC',
  await crypto.subtle.importKey('raw', typeof k === 'string' ? enc.encode(k)
    : k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(s))
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)))

// signature v4 over a body-less get or head, the range among its headers
async function signed(method, path, range, env) {
  const v = n => env.RAW?.match(RegExp(`^${n}=['"]?([^'"\\n]*)`, 'm'))?.[1]
  const t = new Date().toISOString().replace(/[-:]|\.\d+/g, ''), d = t.slice(0, 8)
  const h = { host: HOST, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-amz-date': t, ...range && { range } }
  const names = Object.keys(h).sort(), scope = `${d}/${REGION}/s3/aws4_request`
  const req = [method, path, '', names.map(n => `${n}:${h[n]}\n`).join(''),
    names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n')
  let k = 'AWS4' + v('AWS_SECRET_ACCESS_KEY')
  for (const s of [d, REGION, 's3', 'aws4_request']) k = await hmac(k, s)
  const sig = hex(await hmac(k,
    ['AWS4-HMAC-SHA256', t, scope, await sha(req)].join('\n')))
  delete h.host
  return { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${
    v('AWS_ACCESS_KEY_ID')}/${scope}, SignedHeaders=${names.join(';')
    }, Signature=${sig}` }
}

export async function serve(req, env, who) {
  if (!['GET', 'HEAD'].includes(req.method))
    return new Response(null, { status: 405 })
  if (!await who(req).catch(() => {}))
    return new Response('a data desk access login is needed', { status: 403 })
  const url = new URL(req.url), key = url.pathname.slice('/private/'.length)
  if (!key) {
    const to = url.searchParams.get('to') ?? ''
    return Response.redirect(new URL(/^\/(?!\/)/.test(to) ? to : '/', url), 302)
  }
  const path = '/data-desk-raw/tables/' + key.split('/').map(s =>
    encodeURIComponent(decodeURIComponent(s))).join('/')
  const r = await fetch(`https://${HOST}${path}`, { method: req.method,
    headers: await signed(req.method, path, req.headers.get('range'), env) })
  const res = new Response(r.body, r)
  res.headers.set('cache-control', 'private, no-store')
  return res
}
