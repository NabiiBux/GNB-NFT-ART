# AI Cartoon Proxy

A tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/) that powers
the **✨ AI cartoon character (beta)** button in GNB NFT ART.

The app itself is a single static HTML page, so it can't safely hold an image-model
API key or call most providers directly (browsers block those calls via CORS, and a
key in front-end code is a key leaked). This proxy fixes that:

- keeps your API token **server-side**,
- adds the **CORS** headers the browser needs,
- calls the image model and returns the finished cartoon as a **base64 data URL**
  (so the canvas can read its pixels without cross-origin taint).

It defaults to **[Replicate](https://replicate.com)**, but it's ~120 lines you can
point at any provider.

---

## Setup (~2 minutes)

### 1. Get a Replicate token
Sign up at <https://replicate.com>, then copy your token from
<https://replicate.com/account/api-tokens>.

### 2. Install Wrangler and deploy
```bash
npm install -g wrangler
cd ai-cartoon-proxy
wrangler login
wrangler deploy                      # creates the Worker + gives you a URL
wrangler secret put REPLICATE_API_TOKEN   # paste your token when prompted
```

`wrangler deploy` prints a URL like `https://gnb-ai-cartoon.<you>.workers.dev`.

### 3. Point the app at it
In the app → **🖼️ Photo → Cartoon Layers** tab → **✨ AI cartoon character** →
paste that URL into **AI endpoint URL**. Leave the API-key field blank (the token
lives in the Worker). Pick a style, upload a photo, hit **Generate AI cartoon**,
then **Build layer set** as usual.

---

## Choosing a model

The default is `black-forest-labs/flux-kontext-pro` — an image-editing model that
takes an `input_image` + `prompt`. You can change it without touching code:

```bash
wrangler secret put REPLICATE_MODEL     # e.g. black-forest-labs/flux-kontext-pro
```

> ⚠️ **Input field names vary per model.** `flux-kontext` uses `input_image`.
> If you pick a different model (e.g. an SDXL img2img or an anime LoRA), open
> `worker.js` and adjust the keys inside the `input: { … }` object to match that
> model's schema on its Replicate page. Some models are gated or paid — check the
> model page and your Replicate billing.

## Locking down CORS (optional but recommended)
By default the Worker allows any origin. To restrict it to your site:
```bash
wrangler secret put ALLOW_ORIGIN        # e.g. https://nabiibux.github.io
```

## Using a different provider (OpenAI, Stability, …)
Replace the `fetch(...)` block in `worker.js` with that provider's image-edit call,
keeping the same request/response contract the app expects:

- **Request from app:** `POST` JSON `{ image: <dataURL>, prompt, style }`
- **Response to app:** JSON `{ image: <dataURL> }`

As long as you return `{ image: "data:image/png;base64,…" }`, the app works unchanged.

---

## Privacy note
Using this feature sends the uploaded photo to your chosen model provider. The
built-in **local Cartoonify** button stays fully offline — nothing leaves the
device — so use that if you don't want photos sent anywhere.
