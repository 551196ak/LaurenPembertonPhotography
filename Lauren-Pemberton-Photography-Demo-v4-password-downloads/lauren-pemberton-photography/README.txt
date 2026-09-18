LAUREN PEMBERTON PHOTOGRAPHY — V4

This version adds password-protected DOWNLOAD BUTTONS for the Heritage vs. RL Turner and Leonard Volleyball 26–27 galleries. Viewing remains public.

IMPORTANT SECURITY NOTE
The public gallery images are web previews and can still be saved by a determined visitor because anything displayed in a browser is retrievable. The protected /downloads copies are blocked by the Worker and are only returned after the server verifies the gallery password. When Lauren supplies full-resolution originals, put those only in downloads/<gallery>/ and keep smaller web previews in assets/images/<gallery>/.

CLOUDFLARE SETUP AFTER UPLOADING THIS VERSION TO GITHUB
1. The included wrangler.jsonc makes worker.js run before static assets.
2. In Cloudflare > Workers & Pages > laurenpembertonphotography > Settings > Variables and Secrets, add these as SECRET values:
   HERITAGE_DOWNLOAD_PASSWORD = choose the Heritage password
   LEONARD_DOWNLOAD_PASSWORD = choose the Leonard Volleyball password
3. Redeploy after adding/changing secrets.
4. Do NOT put the actual passwords in GitHub, JavaScript, HTML, or wrangler.jsonc.

Bells Homecoming is still Work in Progress and has no download password until photos are added.
