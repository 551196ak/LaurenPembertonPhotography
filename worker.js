export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Password-protected original-image download endpoint.
    if (url.pathname === "/api/download") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      let body;
      try { body = await request.json(); }
      catch { return Response.json({ ok:false, error:"Invalid request." }, { status:400 }); }

      const gallery = String(body.gallery || "");
      const file = String(body.file || "").replace(/[^A-Za-z0-9_.-]/g, "");
      const password = String(body.password || "");

      let expected, folder;
      if (gallery === "leonard-volleyball-26-27") {
        expected = env.LEONARD_DOWNLOAD_PASSWORD;
        folder = "leonard-volleyball-26-27";
      } else if (gallery === "heritage-vs-rl-turner") {
        expected = env.HERITAGE_DOWNLOAD_PASSWORD;
        folder = "heritage-vs-rl-turner";
      } else {
        return Response.json({ ok:false, error:"Unknown gallery." }, { status:400 });
      }

      if (!expected || password !== expected) {
        return Response.json({ ok:false, error:"Incorrect password." }, { status:401 });
      }

      const assetURL = new URL(`/assets/images/${folder}/${file}`, url.origin);
      const assetResponse = await env.ASSETS.fetch(new Request(assetURL, request));
      if (!assetResponse.ok) return new Response("Image not found.", { status:404 });

      const headers = new Headers(assetResponse.headers);
      headers.set("Content-Disposition", `attachment; filename="${file}"`);
      headers.set("Cache-Control", "private, no-store");
      return new Response(assetResponse.body, { status:200, headers });
    }

    return env.ASSETS.fetch(request);
  }
};
