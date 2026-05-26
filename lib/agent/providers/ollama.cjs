'use strict';

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
  const baseUrl = (agentConfig.ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '');
  const model = agentConfig.model || 'qwen2.5-coder:7b';

  const ollamaTools = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userContent(prompt, context) },
  ];

  while (true) {
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, tools: ollamaTools, stream: true }),
      signal,
    });

    let fullContent = '';
    const toolCalls = [];
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const obj = JSON.parse(line);
        const delta = obj.message;
        if (delta?.content) { fullContent += delta.content; onText(delta.content); }
        if (delta?.tool_calls?.length) toolCalls.push(...delta.tool_calls);
      }
    }

    messages.push({ role: 'assistant', content: fullContent, ...(toolCalls.length && { tool_calls: toolCalls }) });
    if (!toolCalls.length) break;

    for (const tc of toolCalls) {
      const input = typeof tc.function.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments;
      const result = await onToolCall(tc.function.name, input);
      messages.push({ role: 'tool', content: JSON.stringify(result) });
    }
  }
}

module.exports = { run };
