// Thin wrapper around fal.ai's HTTP API.
// Uses the queue endpoint so long generations don't hit HTTP timeouts.

const FAL_QUEUE_BASE = 'https://queue.fal.run';

// Logical model name → fal.ai model id.
// Adjust these if fal renames or versions change.
export const MODELS = {
  'nano-banana-2': 'fal-ai/nano-banana',
  'flux-dev':      'fal-ai/flux/dev',
  'flux-pro':      'fal-ai/flux-pro/v1.1',
  'gpt-image-2':   'fal-ai/gpt-image-2'
};

// Image-to-image / edit endpoints per model.
export const EDIT_MODELS = {
  'nano-banana-2': 'fal-ai/nano-banana/edit',
  'flux-dev':      'fal-ai/flux/dev/image-to-image',
  'flux-pro':      'fal-ai/flux-pro/v1.1/image-to-image',
  'gpt-image-2':   'fal-ai/gpt-image-2/edit'
};

// Rough per-image cost in USD (display only, not authoritative).
export const MODEL_COSTS = {
  'nano-banana-2': 0.02,
  'flux-dev':      0.025,
  'flux-pro':      0.05,
  'gpt-image-2':   0.07
};

// Per-model poll timeout. gpt-image-2 at quality:high can exceed 2min on complex scenes.
export const MODEL_TIMEOUTS_MS = {
  'gpt-image-2': 240_000
};
const DEFAULT_TIMEOUT_MS = 120_000;

function authHeaders() {
  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY is not set — cannot call fal.ai.');
  }
  return {
    'Authorization': `Key ${process.env.FAL_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function submitJob(modelId, input) {
  const res = await fetch(`${FAL_QUEUE_BASE}/${modelId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error(`fal submit ${res.status}: ${await res.text()}`);
  return res.json(); // { request_id, status_url, response_url }
}

async function pollJob(statusUrl, responseUrl, { maxWaitMs = 120_000, pollMs = 2000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const s = await fetch(statusUrl, { headers: authHeaders() });
    if (!s.ok) throw new Error(`fal status ${s.status}: ${await s.text()}`);
    const status = await s.json();
    if (status.status === 'COMPLETED') {
      const r = await fetch(responseUrl, { headers: authHeaders() });
      if (!r.ok) throw new Error(`fal result ${r.status}: ${await r.text()}`);
      return r.json();
    }
    if (status.status === 'FAILED') {
      throw new Error(`fal job failed: ${JSON.stringify(status)}`);
    }
    await sleep(pollMs);
  }
  throw new Error(`fal job timed out after ${maxWaitMs}ms`);
}

// Generate a single image. Returns { imageUrl, seed, model, rawResponse }.
export async function generateImage({ model = 'nano-banana-2', prompt, aspectRatio = '1:1', seed }) {
  const modelId = MODELS[model];
  if (!modelId) throw new Error(`Unknown model: ${model}. Available: ${Object.keys(MODELS).join(', ')}`);

  // fal input varies slightly by model — most accept prompt + image_size/aspect.
  const input = { prompt };
  if (seed !== undefined) input.seed = seed;

  // Map our aspect to fal conventions. Most models accept image_size string.
  if (model.startsWith('flux') || model === 'gpt-image-2') {
    input.image_size = aspectRatio === '1:1' ? 'square_hd'
      : aspectRatio === '16:9' ? 'landscape_16_9'
      : aspectRatio === '9:16' ? 'portrait_16_9'
      : 'square_hd';
    if (model.startsWith('flux')) {
      input.num_inference_steps = model === 'flux-pro' ? 40 : 28;
    }
    if (model === 'gpt-image-2') {
      input.quality = 'high';
      input.num_images = 1;
    }
  } else {
    input.aspect_ratio = aspectRatio;
  }

  const { status_url, response_url } = await submitJob(modelId, input);
  const result = await pollJob(status_url, response_url, { maxWaitMs: MODEL_TIMEOUTS_MS[model] ?? DEFAULT_TIMEOUT_MS });

  const imageUrl = result.images?.[0]?.url || result.image?.url || result.url;
  if (!imageUrl) throw new Error(`fal response had no image URL: ${JSON.stringify(result).slice(0, 500)}`);

  return {
    imageUrl,
    seed: result.seed ?? seed ?? null,
    model,
    costEstimate: MODEL_COSTS[model] ?? null,
    rawResponse: result
  };
}

// Image-to-image variation. Takes a source image URL + an edit instruction.
// Returns { imageUrl, model, rawResponse }.
export async function generateVariation({ model = 'nano-banana-2', prompt, sourceImageUrl, seed }) {
  const modelId = EDIT_MODELS[model];
  if (!modelId) throw new Error(`No image-to-image endpoint for model: ${model}`);
  if (!sourceImageUrl) throw new Error('sourceImageUrl is required');

  const input = { prompt };
  if (model.startsWith('flux')) {
    input.image_url = sourceImageUrl;
    input.num_inference_steps = model === 'flux-pro' ? 40 : 28;
    input.strength = 0.75; // how much to deviate from source
  } else if (model === 'gpt-image-2') {
    input.image_urls = [sourceImageUrl];
    input.quality = 'high';
    input.num_images = 1;
  } else {
    // nano-banana edit endpoint takes an array
    input.image_urls = [sourceImageUrl];
  }
  if (seed !== undefined) input.seed = seed;

  const { status_url, response_url } = await submitJob(modelId, input);
  const result = await pollJob(status_url, response_url, { maxWaitMs: MODEL_TIMEOUTS_MS[model] ?? DEFAULT_TIMEOUT_MS });

  const imageUrl = result.images?.[0]?.url || result.image?.url || result.url;
  if (!imageUrl) throw new Error(`fal variation response had no image URL: ${JSON.stringify(result).slice(0, 500)}`);

  return {
    imageUrl,
    seed: result.seed ?? seed ?? null,
    model,
    costEstimate: MODEL_COSTS[model] ?? null,
    rawResponse: result
  };
}

// N parallel variations from the same source image.
export async function generateVariationsFromSource({ model, prompt, sourceImageUrl, count = 3 }) {
  const jobs = Array.from({ length: count }, (_, i) =>
    generateVariation({ model, prompt, sourceImageUrl, seed: Date.now() + i }).catch(err => ({ error: err.message, index: i }))
  );
  const results = await Promise.all(jobs);
  return {
    model,
    prompt,
    sourceImageUrl,
    variants: results,
    costEstimate: (MODEL_COSTS[model] ?? 0) * count
  };
}

// Generate N variants in parallel with different seeds.
// gpt-image-2 doesn't honor seed (OpenAI backing model is deterministic on prompt),
// so we use fal's native num_images batch in a single queue job instead.
export async function generateVariants({ model, prompt, aspectRatio, count = 3 }) {
  if (model === 'gpt-image-2') {
    return generateBatchGptImage2({ prompt, aspectRatio, count });
  }
  const jobs = Array.from({ length: count }, (_, i) =>
    generateImage({ model, prompt, aspectRatio, seed: Date.now() + i }).catch(err => ({ error: err.message, index: i }))
  );
  const results = await Promise.all(jobs);
  return {
    model,
    prompt,
    variants: results,
    costEstimate: (MODEL_COSTS[model] ?? 0) * count
  };
}

async function generateBatchGptImage2({ prompt, aspectRatio, count }) {
  const modelId = MODELS['gpt-image-2'];
  const input = {
    prompt,
    image_size: aspectRatio === '9:16' ? 'portrait_16_9'
             : aspectRatio === '16:9' ? 'landscape_16_9'
             : 'square_hd',
    quality: 'high',
    num_images: count
  };
  try {
    const { status_url, response_url } = await submitJob(modelId, input);
    const result = await pollJob(status_url, response_url, { maxWaitMs: MODEL_TIMEOUTS_MS['gpt-image-2'] ?? DEFAULT_TIMEOUT_MS });
    const images = result.images || [];
    const variants = images.map((img) => ({
      imageUrl: img.url,
      seed: null,
      model: 'gpt-image-2',
      costEstimate: MODEL_COSTS['gpt-image-2'] ?? null,
      rawResponse: img
    }));
    while (variants.length < count) {
      variants.push({ error: 'fal returned fewer images than requested', index: variants.length });
    }
    return {
      model: 'gpt-image-2',
      prompt,
      variants,
      costEstimate: (MODEL_COSTS['gpt-image-2'] ?? 0) * count
    };
  } catch (err) {
    return {
      model: 'gpt-image-2',
      prompt,
      variants: Array.from({ length: count }, (_, i) => ({ error: err.message, index: i })),
      costEstimate: 0
    };
  }
}
