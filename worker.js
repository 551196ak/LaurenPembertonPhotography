export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const json = (data, status = 200) =>
      Response.json(data, {
        status,
        headers: { "Cache-Control": "no-store" }
      });

    const authorized = (request) => {
      const password = request.headers.get("X-Admin-Password") || "";
      return !!env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD;
    };

    const safeSlug = (value) =>
      String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);

    const safeFile = (value) =>
      String(value || "")
        .replace(/[^A-Za-z0-9_.-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 180);

    const defaultGalleries = [
      {
        id: "bells-homecoming-2026",
        title: "Bells Homecoming 2026"
      },
      {
        id: "heritage-vs-rl-turner",
        title: "Heritage vs RL Turner"
      },
      {
        id: "leonard-volleyball-26-27",
        title: "Leonard Volleyball 26-27"
      }
    ];

    async function getGalleries() {
      const object = await env.Photos.get("_system/galleries.json");

      if (!object) {
        await saveGalleries(defaultGalleries);
        return defaultGalleries;
      }

      try {
        const data = JSON.parse(await object.text());
        return Array.isArray(data) ? data : defaultGalleries;
      } catch {
        return defaultGalleries;
      }
    }

    async function saveGalleries(galleries) {
      await env.Photos.put(
        "_system/galleries.json",
        JSON.stringify(galleries, null, 2),
        {
          httpMetadata: {
            contentType: "application/json"
          }
        }
      );
    }

    // ------------------------------------------
    // ADMIN LOGIN
    // ------------------------------------------

    if (url.pathname === "/api/admin/login") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid request." }, 400);
      }

      if (
        !env.ADMIN_PASSWORD ||
        String(body.password || "") !== env.ADMIN_PASSWORD
      ) {
        return json({ ok: false, error: "Incorrect password." }, 401);
      }

      return json({
        ok: true,
        galleries: await getGalleries()
      });
    }

    // ------------------------------------------
    // PUBLIC GALLERY LIST
    // ------------------------------------------

    if (url.pathname === "/api/galleries") {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      return json({
        ok: true,
        galleries: await getGalleries()
      });
    }

    // ------------------------------------------
    // CREATE GALLERY
    // ------------------------------------------

    if (url.pathname === "/api/admin/gallery/create") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (!authorized(request)) {
        return json({ ok: false, error: "Unauthorized." }, 401);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid request." }, 400);
      }

      const title = String(body.title || "").trim();
      const description = String(body.description || "").trim().slice(0, 500);
      const date = String(body.date || "").trim().slice(0, 40);
      const id = safeSlug(title);

      if (!title || !id) {
        return json(
          { ok: false, error: "Please enter a gallery name." },
          400
        );
      }

      const galleries = await getGalleries();

      if (galleries.some((gallery) => gallery.id === id)) {
        return json(
          { ok: false, error: "A gallery with that name already exists." },
          409
        );
      }

      const gallery = {
        id,
        title,
        description,
        date,
        created: new Date().toISOString()
      };

      galleries.push(gallery);
      await saveGalleries(galleries);

      return json({
        ok: true,
        gallery,
        galleries
      });
    }

    // ------------------------------------------
    // RENAME / EDIT GALLERY
    // ------------------------------------------

    if (url.pathname === "/api/admin/gallery/update") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (!authorized(request)) {
        return json({ ok: false, error: "Unauthorized." }, 401);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid request." }, 400);
      }

      const id = safeSlug(body.id);
      const title = String(body.title || "").trim();
      const description = String(body.description || "").trim().slice(0, 500);
      const date = String(body.date || "").trim().slice(0, 40);

      if (!id || !title) {
        return json({ ok: false, error: "Invalid gallery." }, 400);
      }

      const galleries = await getGalleries();
      const gallery = galleries.find((item) => item.id === id);

      if (!gallery) {
        return json({ ok: false, error: "Gallery not found." }, 404);
      }

      gallery.title = title;
      gallery.description = description;
      gallery.date = date;

      await saveGalleries(galleries);

      return json({
        ok: true,
        gallery,
        galleries
      });
    }

    // ------------------------------------------
    // DELETE ENTIRE GALLERY
    // ------------------------------------------

    if (url.pathname === "/api/admin/gallery/delete") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (!authorized(request)) {
        return json({ ok: false, error: "Unauthorized." }, 401);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid request." }, 400);
      }

      const id = safeSlug(body.id);

      if (!id) {
        return json({ ok: false, error: "Invalid gallery." }, 400);
      }

      let galleries = await getGalleries();

      if (!galleries.some((gallery) => gallery.id === id)) {
        return json({ ok: false, error: "Gallery not found." }, 404);
      }

      // Delete every R2 object belonging to this gallery.
      let cursor;

      do {
        const listed = await env.Photos.list({
          prefix: `${id}/`,
          cursor
        });

        if (listed.objects.length) {
          await env.Photos.delete(
            listed.objects.map((object) => object.key)
          );
        }

        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);

      galleries = galleries.filter((gallery) => gallery.id !== id);
      await saveGalleries(galleries);

      return json({
        ok: true,
        galleries
      });
    }

    // ------------------------------------------
    // UPLOAD PHOTO
    // ------------------------------------------

    if (url.pathname === "/api/admin/upload") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (!authorized(request)) {
        return json({ ok: false, error: "Unauthorized." }, 401);
      }

      const galleryId = safeSlug(url.searchParams.get("gallery"));

      const galleries = await getGalleries();

      if (!galleries.some((gallery) => gallery.id === galleryId)) {
        return json({ ok: false, error: "Unknown gallery." }, 400);
      }

      const contentType =
        request.headers.get("Content-Type") || "application/octet-stream";

      if (!contentType.startsWith("image/")) {
        return json(
          { ok: false, error: "Only image files can be uploaded." },
          400
        );
      }

      const originalName = safeFile(
        request.headers.get("X-File-Name") || "photo.jpg"
      );

      const file =
        `${Date.now()}-${crypto.randomUUID()}-${originalName}`;

      const key = `${galleryId}/${file}`;

      await env.Photos.put(key, request.body, {
        httpMetadata: {
          contentType
        },
        customMetadata: {
          originalName,
          gallery: galleryId
        }
      });

      return json({
        ok: true,
        file,
        key,
        url:
          `/api/photo/${encodeURIComponent(galleryId)}/` +
          encodeURIComponent(file)
      });
    }

    // ------------------------------------------
    // ADMIN PHOTO LIST
    // ------------------------------------------

    if (url.pathname === "/api/admin/photos") {
      if (!authorized(request)) {
        return json({ ok: false, error: "Unauthorized." }, 401);
      }

      const galleryId = safeSlug(url.searchParams.get("gallery"));
      const galleries = await getGalleries();

      if (!galleries.some((gallery) => gallery.id === galleryId)) {
        return json({ ok: false, error: "Unknown gallery." }, 400);
      }

      const photos = [];
      let cursor;

      do {
        const result = await env.Photos.list({
          prefix: `${galleryId}/`,
          cursor
        });

        for (const object of result.objects) {
          const file = object.key.substring(`${galleryId}/`.length);

          photos.push({
            file,
            key: object.key,
            size: object.size,
            uploaded: object.uploaded,
            url:
              `/api/photo/${encodeURIComponent(galleryId)}/` +
              encodeURIComponent(file)
          });
        }

        cursor = result.truncated ? result.cursor : undefined;
      } while (cursor);

      photos.sort(
        (a, b) =>
          new Date(b.uploaded).getTime() -
          new Date(a.uploaded).getTime()
      );

      return json({
        ok: true,
        photos
      });
    }

    // ------------------------------------------
    // PUBLIC PHOTOS FOR A GALLERY
    // ------------------------------------------

    if (url.pathname === "/api/gallery/photos") {
      const galleryId = safeSlug(url.searchParams.get("gallery"));
      const galleries = await getGalleries();

      if (!galleries.some((gallery) => gallery.id === galleryId)) {
        return json({ ok: false, error: "Unknown gallery." }, 404);
      }

      const photos = [];
      let cursor;

      do {
        const result = await env.Photos.list({
          prefix: `${galleryId}/`,
          cursor
        });

        for (const object of result.objects) {
          const file = object.key.substring(`${galleryId}/`.length);

          photos.push({
            file,
            url:
              `/api/photo/${encodeURIComponent(galleryId)}/` +
              encodeURIComponent(file)
          });
        }

        cursor = result.truncated ? result.cursor : undefined;
      } while (cursor);

      return json({
        ok: true,
        photos
      });
    }

    // ------------------------------------------
    // DELETE ONE PHOTO
    // ------------------------------------------

    if (url.pathname === "/api/admin/delete") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (!authorized(request)) {
        return json({ ok: false, error: "Unauthorized." }, 401);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid request." }, 400);
      }

      const galleryId = safeSlug(body.gallery);
      const file = safeFile(body.file);

      if (!galleryId || !file) {
        return json({ ok: false, error: "Invalid photo." }, 400);
      }

      await env.Photos.delete(`${galleryId}/${file}`);

      return json({ ok: true });
    }

    // ------------------------------------------
    // SERVE R2 PHOTO
    // ------------------------------------------

    if (url.pathname.startsWith("/api/photo/")) {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      const parts = url.pathname
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent);

      if (parts.length !== 4) {
        return new Response("Not Found", { status: 404 });
      }

      const galleryId = safeSlug(parts[2]);
      const file = safeFile(parts[3]);

      const object = await env.Photos.get(`${galleryId}/${file}`);

      if (!object) {
        return new Response("Image not found.", { status: 404 });
      }

      const headers = new Headers();

      object.writeHttpMetadata(headers);

      headers.set("ETag", object.httpEtag);
      headers.set("Cache-Control", "public, max-age=3600");

      return new Response(object.body, {
        headers
      });
    }

    // ------------------------------------------
    // EXISTING PASSWORD-PROTECTED DOWNLOADS
    // ------------------------------------------

    if (url.pathname === "/api/download") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid request." }, 400);
      }

      const gallery = String(body.gallery || "");
      const file = safeFile(body.file);
      const password = String(body.password || "");

      let expected;
      let folder;

      if (gallery === "leonard-volleyball-26-27") {
        expected = env.LEONARD_DOWNLOAD_PASSWORD;
        folder = "leonard-volleyball-26-27";
      } else if (gallery === "heritage-vs-rl-turner") {
        expected = env.HERITAGE_DOWNLOAD_PASSWORD;
        folder = "heritage-vs-rl-turner";
      } else {
        return json({ ok: false, error: "Unknown gallery." }, 400);
      }

      if (!expected || password !== expected) {
        return json({ ok: false, error: "Incorrect password." }, 401);
      }

      const assetURL = new URL(
        `/assets/images/${folder}/${file}`,
        url.origin
      );

      const assetResponse = await env.ASSETS.fetch(
        new Request(assetURL, request)
      );

      if (!assetResponse.ok) {
        return new Response("Image not found.", { status: 404 });
      }

      const headers = new Headers(assetResponse.headers);

      headers.set(
        "Content-Disposition",
        `attachment; filename="${file}"`
      );

      headers.set("Cache-Control", "private, no-store");

      return new Response(assetResponse.body, {
        status: 200,
        headers
      });
    }

    // ------------------------------------------
    // EXISTING WEBSITE
    // ------------------------------------------

    return env.ASSETS.fetch(request);
  }
};
