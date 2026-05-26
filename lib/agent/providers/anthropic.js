'use strict';
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM = `You are an expert coding assistant embedded in Graphite, a node-based canvas IDE.
You can read and edit files, create/delete canvas nodes, and run shell commands.
When editing files, use edit_file with the exact old_str to replace. Keep changes minimal and correct.
Always read a file before editing it.`;

function userContent(prompt, context) {
  let out = prompt;
  if (context?.rootPath) out = `Project root: ${context.rootPath}\n\n${out}`;
  if (context?.filePaths?.length) out += `\n\nOpen files: ${context.filePaths.join(', ')}`;
  return out;
}

async function run({ prompt, context, tools, agentConfig, onText, onToolCall, signal }) {
  const client = new Anthropic.default({ apiKey: agentConfig.anthropicApiKey });
  const messages = [{ role: 'user', content: userContent(prompt, context) }];

  while (true) {
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });

    const stream = client.messages.stream({
      model: agentConfig.model || 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: SYSTEM,
      messages,
      tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
    });

    stream.on('text', onText);
    const msg = await stream.finalMessage();
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });

    messages.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason !== 'tool_use') break;

    const results = [];
    for (const block of msg.content) {
      if (block.type !== 'tool_use') continue;
      const result = await onToolCall(block.name, block.input);
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: results });
  }
}

module.exports = { run };
