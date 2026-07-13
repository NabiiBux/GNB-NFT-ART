/*
 * GNB NFT ART — AI cartoon proxy (Cloudflare Worker)
 * -------------------------------------------------------------------------
 * The web app is a static page, so it cannot safely hold an image-model API
 * key or call most providers directly (CORS + key exposure). This tiny proxy
 * solves both: it keeps your token server-side, adds CORS headers, calls the
 * image model, and returns the finished cartoon as a base64 data URL so the
 * browser can read its pixels without cross-origin taint.
 *
 * Default provider: Replicate (https://replicate.com). See README.md for setup.
 *
 * Secrets / vars (set with `wrangler secret put` / in the dashboard):
 *   REPLICATE_API_TOKEN   (required)  your Replicate API token
 *   REPLICATE_MODEL       (optional)  e.g. "black-forest-labs/flux-kontext-pro"
 *   ALLOW_ORIGIN          (optional)  lock CORS to your site, default "*"
 *
 * The app POSTs JSON: { image: <dataURL>, prompt: <string>, style: <string> }
 * and expects JSON back:              { image: <dataURL> }
 */

const STYLE_PROMPTS = {
  anime:   "Turn this into a high-quality anime / manga character portrait: clean cel shading, crisp line art, expressive large eyes, vibrant colors, keep the subject's pose and identity.",
  pixar:   "Turn this into a 3D animated movie character in Pixar style: rounded soft features, smooth shading, cinematic soft lighting, keep the subject's pose and identity.",
  comic:   "Turn this into a western comic-book character: bold black ink outlines, flat cel coloring, halftone shading, keep the subject's pose and identity.",
  sticker: "Turn this into a cute chibi sticker avatar: thick clean outline, simplified shapes, kawaii style, flat bright colors, keep the subject recognizable.",
};

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "POST only" }, 405, cors);
    if (!env.REPLICATE_API_TOKEN) return json({ error: "server missing REPLICATE_API_TOKEN" }, 500, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "invalid JSON body" }, 400, cors); }

    const image = body.image;
    if (!image) return json({ error: "missing 'image' (data URL)" }, 400, cors);
    const prompt = body.prompt || STYLE_PROMPTS[body.style] || STYLE_PROMPTS.anime;
    const model = env.REPLICATE_MODEL || "black-forest-labs/flux-kontext-pro";

    try {
      // Call Replicate. `Prefer: wait` blocks until the prediction finishes
      // (or times out), so we don't have to poll ourselves.
      const rp = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.REPLICATE_API_TOKEN,
          "Content-Type": "application/json",
          "Prefer": "wait",
        },
        // NOTE: input field names vary per model. flux-kontext uses `input_image`.
        // If you switch models, adjust the keys below to match its schema.
        body: JSON.stringify({
          input: {
            prompt,
            input_image: image,
            aspect_ratio: "1:1",
            output_format: "png",
          },
        }),
      });

      const data = await rp.json();
      if (!rp.ok || data.error) {
        return json({ error: "model error", detail: data.error || data }, 502, cors);
      }

      let out = data.output;
      if (Array.isArray(out)) out = out[0];
      if (!out) return json({ error: "model returned no output", detail: data }, 502, cors);

      // If already a data URL, pass through; otherwise fetch and inline as base64
      // so the browser canvas isn't cross-origin tainted.
      if (typeof out === "string" && out.startsWith("data:")) {
        return json({ image: out }, 200, cors);
      }
      const imgResp = await fetch(out);
      if (!imgResp.ok) return json({ error: "could not fetch model output image" }, 502, cors);
      const ct = imgResp.headers.get("content-type") || "image/png";
      const b64 = toBase64(await imgResp.arrayBuffer());
      return json({ image: `data:${ct};base64,${b64}` }, 200, cors);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500, cors);
    }
  },
};

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": (env && env.ALLOW_ORIGIN) || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
