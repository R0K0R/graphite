import { useState, useEffect, useCallback } from 'react';
import { onAgentEvent } from './agentBridge.js';

export function useAgent() {
  const [messages, setMessages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    return onAgentEvent((event) => {
      switch (event.type) {
        case 'chunk':
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last.kind === 'text') {
              return [...prev.slice(0, -1), { ...last, content: last.content + event.text }];
            }
            return [...prev, { role: 'assistant', kind: 'text', content: event.text }];
          });
          break;
        case 'tool-start':
          setMessages(prev => [...prev, { role: 'assistant', kind: 'tool', name: event.name, input: event.input, result: null }]);
          break;
        case 'tool-result':
          setMessages(prev => {
            const idx = [...prev].reverse().findIndex(m => m.kind === 'tool' && m.name === event.name && m.result === null);
            if (idx === -1) return prev;
            const i = prev.length - 1 - idx;
            return [...prev.slice(0, i), { ...prev[i], result: event.result }, ...prev.slice(i + 1)];
          });
          break;
        case 'file-draft':
          setMessages(prev => [...prev, { role: 'assistant', kind: 'file-draft', path: event.path }]);
          break;
        case 'canvas-action':
          setMessages(prev => [...prev, { role: 'assistant', kind: 'canvas-action', action: event }]);
          break;
        case 'done':
          setIsRunning(false);
          break;
        case 'error':
          setMessages(prev => [...prev, { role: 'assistant', kind: 'error', message: event.message }]);
          setIsRunning(false);
          break;
      }
    });
  }, []);

  const run = useCallback((prompt, context) => {
    if (!window.electronAPI || isRunning) return;
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    setIsRunning(true);
    window.electronAPI.agentRun({ prompt, context });
  }, [isRunning]);

  const stop = useCallback(() => {
    window.electronAPI?.agentStop();
    setIsRunning(false);
  }, []);

  const clear = useCallback(() => setMessages([]), []);

  return { messages, isRunning, run, stop, clear };
}
