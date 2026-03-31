import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import { CHAT_TOOLS } from "./_lib/chat/tool-definitions.js";
import { executeTool } from "./_lib/chat/tool-executor.js";
import { getSystemPrompt } from "./_lib/chat/system-prompt.js";

export const config = { maxDuration: 120 };

// Convert our tool definitions (Anthropic format) to OpenAI format
function toOpenAITools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return CHAT_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { messages } = req.body as {
    messages: Array<{ role: string; content: string }>;
  };

  if (!messages || !Array.isArray(messages)) {
    res.write(
      `event: error\ndata: ${JSON.stringify({ message: "messages array required" })}\n\n`,
    );
    return res.end();
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tools = toOpenAITools();

  // Build OpenAI messages with system prompt
  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: getSystemPrompt() },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  try {
    let maxIterations = 15;

    while (maxIterations-- > 0) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 8192,
        messages: openaiMessages,
        tools,
      });

      const choice = response.choices[0];
      if (!choice) break;

      const message = choice.message;

      // Check for tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        // Add assistant message with tool calls to conversation
        openaiMessages.push(message);

        // Execute each tool call
        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          const fnArgs = JSON.parse(toolCall.function.arguments || "{}");

          res.write(
            `event: tool_start\ndata: ${JSON.stringify({ name: fnName })}\n\n`,
          );

          const startTime = Date.now();
          let result: string;

          try {
            result = await executeTool(fnName, fnArgs);
          } catch (err) {
            result = JSON.stringify({
              error: err instanceof Error ? err.message : "Unknown error",
            });
          }

          const duration = Date.now() - startTime;
          res.write(
            `event: tool_end\ndata: ${JSON.stringify({ name: fnName, duration_ms: duration })}\n\n`,
          );

          // Add tool result to conversation
          openaiMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }

        // Continue the loop - let the model process tool results
        continue;
      }

      // No tool calls - this is the final text response
      if (message.content) {
        res.write(
          `event: delta\ndata: ${JSON.stringify({ text: message.content })}\n\n`,
        );
      }

      res.write(`event: done\ndata: {}\n\n`);
      return res.end();
    }

    // Exhausted iterations
    res.write(
      `event: delta\ndata: ${JSON.stringify({ text: "Se alcanzó el límite de iteraciones de herramientas." })}\n\n`,
    );
    res.write(`event: done\ndata: {}\n\n`);
    return res.end();
  } catch (err) {
    console.error("Chat error:", err);
    res.write(
      `event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : "Internal error" })}\n\n`,
    );
    return res.end();
  }
}
