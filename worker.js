export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const json = (data, status = 200) =>
      Response.json(data, {
        status,
        headers: {
          "Cache-Control": "no-store"
        }
      });

    // --------------------------------------------------
    // ADMIN PASSWORD CHECK
    // --------------------------------------------------
    function adminAuthorized(request) {
      const password = request.headers.get("X-Admin-Password") || "";
      return !!env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD;
    }

    // --------------------------------------------------
    // ALLOWED GALLERIES
    // --------------------------------------------------
    const galleries = {
      "bells-homecoming-2026": "Bells Homecoming 2026",
      "heritage-vs-rl-turner": "Heritage vs RL Turner",
      "leonard-volleyball-26-27": "Leonard Volleyball 26-27"
    };

    // --------------------------------------------------
    // ADMIN LOGIN CHECK
    // --------------------------------------------------
    if (url.pathname === "/api/admin/login") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json(
          { ok: false, error: "Invalid request." },
          400
        );
      }

      const password = String(body.password || "");

      if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
        return json(
          { ok: false, error: "Incorrect password." },
          401
        );
      }

      return json({
        ok: true,
        galleries
      });
    }

    // --------------------------------------------------
    // UPLOAD PHOTO TO R2
    // --------------------------------------------------
    if (url.pathname === "/api/admin/upload") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (!adminAuthorized(request)) {
        return json(
          { ok: false, error: "Unauthorized." },
          401
        );
      }

      const gallery = url.searchParams.get("gallery") || "";

      if (!galleries[gallery]) {
        return json(
          { ok: false, error: "Unknown gallery." },
          400
        );
      }

      const contentType =
        request.headers.get("Content-Type") ||
        "application/octet-stream";

      if (!contentType.startsWith("image/")) {
        return json(
          { ok: false, error: "Only image files are allowed." },
          400
        );
      }

      const originalName =
        request.headers.get("X-File-Name") || "photo.jpg";

      const safeName = originalName
        .replace(/[^A-Za-z0-9_.-]/g, "_")
        .replace(/_+/g, "_");

      const uniqueName =
        `${Date.now()}-${crypto.randomUUID()}-${safeName}`;

      const key = `${gallery}/${uniqueName}`;

      try {
        await env.Photos.put(key, request.body, {
          httpMetadata: {
            contentType
          },
          customMetadata: {
            originalName: safeName,
            gallery
          }
        });

        return json({
          ok: true,
          key,
          file: uniqueName,
          url: `/api/photo/${encodeURIComponent(gallery)}/${encodeURIComponent(uniqueName)}`
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: "Upload failed."
          },
          500
        );
      }
    }

    // --------------------------------------------------
    // LIST PHOTOS IN A GALLERY
    // --------------------------------------------------
    if (url.pathname === "/api/admin/photos") {
      if (!adminAuthorized(request)) {
        return json(
          { ok: false, error: "Unauthorized." },
          401
        );
      }

      const gallery = url.searchParams.get("gallery") || "";

      if (!galleries[gallery]) {
        return json(
          { ok: false, error: "Unknown gallery." },
          400
        );
      }

      try {
        const result = await env.Photos.list({
          prefix: `${gallery}/`
        });

        const photos = result.objects.map(object => {
          const file = object.key.substring(
            `${gallery}/`.length
          );

          return {
            key: object.key,
            file,
            size: object.size,
            uploaded: object.uploaded,
            url: `/api/photo/${encodeURIComponent(gallery)}/${encodeURIComponent(file)}`
          };
        });

        return json({
          ok: true,
          photos
        });
      } catch {
        return json(
          { ok: false, error: "Could not load photos." },
          500
        );
      }
    }

    // --------------------------------------------------
    // DELETE PHOTO FROM R2
    // --------------------------------------------------
    if (url.pathname === "/api/admin/delete") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (!adminAuthorized(request)) {
        return json(
          { ok: false, error: "Unauthorized." },
          401
        );
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json(
          { ok: false, error: "Invalid request." },
          400
        );
      }

      const gallery = String(body.gallery || "");
      const file = String(body.file || "");

      if (!galleries[gallery]) {
        return json(
          { ok: false, error: "Unknown gallery." },
          400
        );
      }

      if (
        !file ||
        file.includes("/") ||
        file.includes("\\") ||
        file.includes("..")
      ) {
        return json(
          { ok: false, error: "Invalid file." },
          400
        );
      }

      try {
        await env.Photos.delete(`${gallery}/${file}`);

        return json({
          ok: true
        });
      } catch {
        return json(
          { ok: false, error: "Delete failed." },
          500
        );
      }
    }

    // --------------------------------------------------
    // SERVE AN R2 PHOTO PUBLICLY THROUGH THE WORKER
    // --------------------------------------------------
    if (url.pathname.startsWith("/api/photo/")) {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      const parts = url.pathname
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent);

      // api / photo / gallery / filename
      if (parts.length !== 4) {
        return new Response("Not Found", { status: 404 });
      }

      const gallery = parts[2];
      const file = parts[3];

      if (!galleries[gallery]) {
        return new Response("Not Found", { status: 404 });
      }

      if (
        !file ||
        file.includes("/") ||
        file.includes("\\") ||
        file.includes("..")
      ) {
        return new Response("Not Found", { status: 404 });
      }

      const object = await env.Photos.get(
        `${gallery}/${file}`
      );

      if (!object) {
        return new Response("Image not found.", {
          status: 404
        });
      }

      const headers = new Headers();

      object.writeHttpMetadata(headers);

      headers.set(
        "ETag",
        object.httpEtag
      );

      headers.set(
        "Cache-Control",
        "public, max-age=3600"
      );

      return new Response(object.body, {
        headers
      });
    }

    // --------------------------------------------------
    // EXISTING PASSWORD-PROTECTED ORIGINAL DOWNLOAD
    // --------------------------------------------------
    if (url.pathname === "/api/download") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405
        });
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json(
          { ok: false, error: "Invalid request." },
          400
        );
      }

      const gallery = String(body.gallery || "");

      const file = String(body.file || "")
        .replace(/[^A-Za-z0-9_.-]/g, "");

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
        return json(
          { ok: false, error: "Unknown gallery." },
          400
        );
      }

      if (!expected || password !== expected) {
        return json(
          { ok: false, error: "Incorrect password." },
          401
        );
      }

      const assetURL = new URL(
        `/assets/images/${folder}/${file}`,
        url.origin
      );

      const assetResponse = await env.ASSETS.fetch(
        new Request(assetURL, request)
      );

      if (!assetResponse.ok) {
        return new Response(
          "Image not found.",
          { status: 404 }
        );
      }

      const headers = new Headers(
        assetResponse.headers
      );

      headers.set(
        "Content-Disposition",
        `attachment; filename="${file}"`
      );

      headers.set(
        "Cache-Control",
        "private, no-store"
      );

      return new Response(
        assetResponse.body,
        {
          status: 200,
          headers
        }
      );
    }

    // --------------------------------------------------
    // EVERYTHING ELSE = EXISTING WEBSITE
    // --------------------------------------------------
    return env.ASSETS.fetch(request);
  }
};
