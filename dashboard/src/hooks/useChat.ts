import { useState, useCallback, useRef } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolCalls?: Array<{ name: string; duration_ms?: number }>;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    // Create user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    // Create placeholder assistant message
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      toolCalls: [],
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    setActiveTools([]);

    // Build message history for the API (only role + content, no metadata)
    const history = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Abort previous request if any
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const toolCalls: Array<{ name: string; duration_ms?: number }> = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7);
          } else if (line.startsWith("data: ") && currentEvent) {
            const data = JSON.parse(line.slice(6));

            if (currentEvent === "delta") {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: last.content + data.text };
                }
                return updated;
              });
            } else if (currentEvent === "tool_start") {
              setActiveTools(prev => [...prev, data.name]);
              toolCalls.push({ name: data.name });
            } else if (currentEvent === "tool_end") {
              setActiveTools(prev => prev.filter(t => t !== data.name));
              const tc = toolCalls.find(t => t.name === data.name && !t.duration_ms);
              if (tc) tc.duration_ms = data.duration_ms;
            } else if (currentEvent === "error") {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: `Error: ${data.message}` };
                }
                return updated;
              });
            }
            currentEvent = "";
          }
        }
      }

      // Update tool calls on the assistant message
      if (toolCalls.length > 0) {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            updated[updated.length - 1] = { ...last, toolCalls };
          }
          return updated;
        });
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant" && !last.content) {
            updated[updated.length - 1] = { ...last, content: "Error al conectar con el asistente." };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setActiveTools([]);
    }
  }, [messages]);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
    setActiveTools([]);
  }, []);

  return { messages, isStreaming, activeTools, sendMessage, clearChat };
}
