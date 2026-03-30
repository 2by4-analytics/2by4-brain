import Anthropic from '@anthropic-ai/sdk';
import { fetchClients } from '../config/clients.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BRAIN_SYSTEM_PROMPT = `You are 2by4 Brain — the AI operations system for 2by4 LLC, a solo digital ads and marketing agency run by Alan.

Your job is to help Alan manage his client accounts, analyze ad performance, generate creative, and surface what needs his attention. You are direct, efficient, and knowledgeable about performance marketing.

## Agency Overview
2by4 LLC manages two types of clients:

### Sticker Funnel Clients
Meta ads only. Funnel: Meta ad → survey → opt-in → sticker checkout (~$3 decal) → order bumps including $14.95/month continuity subscription. Front-end is sub-breakeven by design — real business is monthly subscribers.

### Shed Clients
Meta + Google Ads. Stack: WordPress, GoHighLevel, Tag Manager.

## Houseplant Client — Detailed Brief
- Niche: Houseplant enthusiasts
- Always lead with product tester angle — NEVER lead with stickers
- Make reader feel selected, not sold to
- Survey reinforces plant identity
- Checkout at apply.plant-enthusiast.com/Approved
- $3 single decal or $8 for 3. Order bumps: $1 last decal, $14.95/mo continuity (THE offer), $7 planner, $3.95 rush

## Client Name → ID Mapping
When Alan refers to a client by name, resolve it to the correct ID before calling any tool. Never ask Alan for a client ID.
- "Eric - Plants" or "Plants" → client1
- "Eric - Faith" or "Faith" → eric-faith-mncg09ih
- "Jorge" → client2
- "Brian" → brian-mm0ufx84
- "Matteo" → matteo-mm0urlzh
- "Todd" → todd-mn3cd22p
- "Coco - VM" or "Coco VM" → coco-vm-mn7htjvz
- "Coco - Black Wolf" or "Coco Black Wolf" → coco-black-wolf-mn7hvdev
- "Craig - RevMoto" or "RevMoto" → craig-revmoto-mmjeuw8s
- "Craig - ReadyNation" or "ReadyNation" → craig-readynation-mmkodtu2

## Tools Available
You have tools to pull live data. Use them proactively — don't tell Alan you need data, just go get it.
- get_performance: pull one client's data for a time period
- get_all_performance: pull all clients at once
- get_briefing: get today's morning briefing
- run_creative_generator: generate new ad hooks and copy for a client
- analyze_creatives: run live creative analysis (scores ads, flags SCALE/MONITOR/PAUSE)
- get_creative_analysis: retrieve the most recent stored creative analysis for a client

## Style
- Be concise. Alan is busy.
- Use numbers. Be specific.
- Pull data first, then answer — never say you can't access data.
- Surface the most important thing first.
- Never pad with generic advice.`;

export async function chatWithBrain(messages, clientContext = null) {
  const allClients = await fetchClients();

  let systemPrompt = BRAIN_SYSTEM_PROMPT;

  if (clientContext) {
    systemPrompt += `\n\n## Current Working Context\nAlan is focused on: ${clientContext.name} (${clientContext.type}). Client ID: ${clientContext.id}. CPP target: $${clientContext.cppTarget}.`;
  } else {
    const clientList = Object.entries(allClients)
      .map(([id, c]) => `- ${c.name} (id: ${id}) — ${c.type}, CPP target $${c.cppTarget}`)
      .join('\n');
    systemPrompt += `\n\n## Current Clients\n${clientList}`;
  }

  // Agentic loop — Brain can call tools multiple times before responding
  const agentMessages = [...messages];
  
  while (true) {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS,
      messages: agentMessages
    });

    // If Brain wants to use a tool
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      
      // Add Brain's response (with tool calls) to message history
      agentMessages.push({ role: 'assistant', content: response.content });

      // Execute all tool calls and collect results
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          console.log(`[Brain] Calling tool: ${toolUse.name}`, toolUse.input);
          try {
            const result = await executeTool(toolUse.name, toolUse.input, allClients);
            return {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result)
            };
          } catch (err) {
            return {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              is_error: true,
              content: err.message
            };
          }
        })
      );

      // Add tool results to message history and loop
      agentMessages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Brain is done — return the text response
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text || 'No response';
  }
}
