'use strict';
const OpenAI = require('openai');

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
  const client = new OpenAI.default({
    apiKey: agentConfig.openaiApiKey || 'none',
    baseURL: agentConfig.openaiBaseUrl || 'https://api.openai.com/v1',
  });

  const openaiTools = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userContent(prompt, context) },
  ];

  while (true) {
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });

    const stream = await client.chat.completions.create({
      model: agentConfig.model || 'gpt-4o',
      messages,
      tools: openaiTools,
      stream: true,
    });

    let fullContent = '';
    const pendingCalls = {};

    for await (const chunk of stream) {
      if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) { fullContent += delta.content; onText(delta.content); }
      for (const tc of delta?.tool_calls ?? []) {
        if (!pendingCalls[tc.index]) pendingCalls[tc.index] = { id: '', name: '', args: '' };
        if (tc.id) pendingCalls[tc.index].id = tc.id;
        if (tc.function?.name) pendingCalls[tc.index].name = tc.function.name;
        if (tc.function?.arguments) pendingCalls[tc.index].args += tc.function.arguments;
      }
    }

    const tcList = Object.values(pendingCalls);
    const assistantMsg = { role: 'assistant', content: fullContent };
    if (tcList.length) {
      assistantMsg.tool_calls = tcList.map(tc => ({
        id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.args },
      }));
    }
    messages.push(assistantMsg);
    if (!tcList.length) break;

    for (const tc of tcList) {
      const input = JSON.parse(tc.args || '{}');
      const result = await onToolCall(tc.name, input);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }
}

module.exports = { run };
