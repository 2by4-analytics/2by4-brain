import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You summarize meeting notes for 2by4 LLC, a solo digital ads agency.

The user is Alan Woods. He's just uploaded raw meeting content (transcript, Gemini-generated notes, hand-typed notes, or a PDF). You produce two things:

1. **recapMarkdown** — a clean, structured markdown recap (no top-level # heading; start at ##). Sections, in order:
   - ## Headlines — 3-5 bullets capturing the most important takeaways
   - ## Performance / numbers (only if numerical results were discussed)
   - ## Action items — what was committed, by whom, by when
   - ## Open issues — unresolved problems flagged
   - ## Notes — anything else useful (rapport, off-topic items, links)
   Skip empty sections entirely.

2. **openItems** — a list of strings, each one a distinct task that should land on Alan's task list. Phrase each item in his voice: "Send X to Y", "Confirm Z with [partner]", "Pull last-7d numbers". Include items where the counterparty owes Alan something — phrase as "Follow up with [name] re: …" so he sees it on his board. Skip vague aspirations and small-talk. 0-8 items typical.

Important:
- Convert relative dates to absolute (e.g., "Thursday" → ISO date) when known.
- Preserve specific numbers, names, dollar amounts, dates, links exactly as stated.
- If multiple action items target the same person, keep them separate.
- Do NOT invent action items not implied by the source.

Respond ONLY with a JSON object of the form:
{
  "recapMarkdown": "...",
  "openItems": ["...", "..."]
}
No prose before or after. No code fences.`;

function extractJson(text) {
  const t = String(text || '').trim();
  // Strip code fences if the model added any despite instructions
  const stripped = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(stripped);
}

/**
 * Summarize a meeting file into a clean recap + actionable open items.
 *
 * @param {object} input
 * @param {string} input.clientName - e.g. "twin-city-barns"
 * @param {string} [input.fileText] - text content (md/txt/transcript)
 * @param {string} [input.fileBase64] - base64-encoded file (PDF only — passed as document block)
 * @param {string} [input.fileMimeType] - mime of fileBase64 (currently only application/pdf supported)
 * @param {string} [input.todayDate] - YYYY-MM-DD, used to anchor relative-date phrasing
 *
 * @returns {Promise<{ recapMarkdown: string, openItems: string[] }>}
 */
export async function summarizeMeeting({ clientName, fileText, fileBase64, fileMimeType, todayDate }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  if (!fileText && !fileBase64) throw new Error('Provide either fileText or fileBase64');

  const userBlocks = [];
  if (todayDate) {
    userBlocks.push({ type: 'text', text: `Today's date: ${todayDate}\nClient: ${clientName || '(unspecified)'}\n` });
  } else {
    userBlocks.push({ type: 'text', text: `Client: ${clientName || '(unspecified)'}\n` });
  }

  if (fileBase64 && fileMimeType === 'application/pdf') {
    userBlocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
    });
    userBlocks.push({ type: 'text', text: 'Summarize the meeting in the attached document per the system instructions.' });
  } else if (fileText) {
    userBlocks.push({ type: 'text', text: `Meeting content:\n\n---\n${fileText}\n---` });
  } else {
    throw new Error(`Unsupported fileMimeType "${fileMimeType}" — pass fileText for non-PDF formats`);
  }

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userBlocks }],
  });

  const textBlock = (resp.content || []).find(b => b.type === 'text');
  if (!textBlock) throw new Error('No text response from Claude');

  let parsed;
  try {
    parsed = extractJson(textBlock.text);
  } catch (e) {
    throw new Error(`Failed to parse JSON from Claude: ${e.message}\n\nRaw: ${textBlock.text.slice(0, 400)}`);
  }
  if (typeof parsed.recapMarkdown !== 'string') throw new Error('recapMarkdown missing from response');
  if (!Array.isArray(parsed.openItems)) throw new Error('openItems missing from response');

  return {
    recapMarkdown: parsed.recapMarkdown.trim(),
    openItems: parsed.openItems.map(s => String(s).trim()).filter(Boolean),
  };
}
