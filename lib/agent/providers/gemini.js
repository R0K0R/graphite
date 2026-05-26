'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
  const genAI = new GoogleGenerativeAI(agentConfig.geminiApiKey || '');
  const geminiTools = [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: { ...t.input_schema, type: 'OBJECT' },
    })),
  }];

  const model = genAI.getGenerativeModel({
    model: agentConfig.model || 'gemini-2.0-flash',
    systemInstruction: SYSTEM,
    tools: geminiTools,
  });

  const history = [];
  let userMsg = userContent(prompt, context);

  while (true) {
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(userMsg);

    const functionCalls = [];
    for await (const chunk of result.stream) {
      if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      const text = chunk.text?.();
      if (text) onText(text);
      const calls = chunk.functionCalls?.();
      if (calls?.length) functionCalls.push(...calls);
    }

    const finalResponse = await result.response;
    history.push({ role: 'user', parts: [{ text: userMsg }] });
    history.push({ role: 'model', parts: finalResponse.candidates[0].content.parts });

    if (!functionCalls.length) break;

    const responseParts = [];
    for (const call of functionCalls) {
      const res = await onToolCall(call.name, call.args);
      responseParts.push({ functionResponse: { name: call.name, response: res } });
    }
    userMsg = responseParts;
  }
}

module.exports = { run };
