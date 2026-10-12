// flux.datadesk.eco was this map's first name: every path, query and hash
// lands on aerial (the browser keeps the hash across a redirect)
export default {
  fetch: r => Response.redirect(
    'https://aerial.datadesk.eco' + r.url.slice(new URL(r.url).origin.length),
    301),
};
