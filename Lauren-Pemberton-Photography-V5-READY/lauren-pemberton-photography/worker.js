export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/downloads/')) {
      return new Response('Not found', { status: 404 });
    }

    if (url.pathname === '/api/download' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({error:'Invalid request.'},400); }
      const gallery = String(body.gallery || '');
      const file = String(body.file || '');
      const password = String(body.password || '');
      const allowed = {
        'heritage-vs-rl-turner': env.HERITAGE_DOWNLOAD_PASSWORD,
        'leonard-volleyball-26-27': env.LEONARD_DOWNLOAD_PASSWORD
      };
      if (!allowed[gallery] || password !== allowed[gallery]) return json({error:'Incorrect download password.'},401);
      if (!/^[A-Za-z0-9_.-]+$/.test(file)) return json({error:'Invalid file.'},400);

      const assetURL = new URL(`/downloads/${gallery}/${file}`, request.url);
      const asset = await env.ASSETS.fetch(new Request(assetURL));
      if (!asset.ok) return json({error:'Image not found.'},404);
      const headers = new Headers(asset.headers);
      headers.set('Content-Disposition', `attachment; filename="${file}"`);
      headers.set('Cache-Control','private, no-store');
      return new Response(asset.body,{status:200,headers});
    }

    return env.ASSETS.fetch(request);
  }
};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})}
