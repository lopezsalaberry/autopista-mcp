import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_TOOLS } from "./_lib/chat/tool-definitions.js";
import { executeTool } from "./_lib/chat/tool-executor.js";
import { getSystemPrompt } from "./_lib/chat/system-prompt.js";

export const config = { maxDuration: 120 };

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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const anthropicMessages: Anthropic.Messages.MessageParam[] = messages.map(
    (m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }),
  );

  try {
    let maxIterations = 15;

    while (maxIterations-- > 0) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: getSystemPrompt(),
        messages: anthropicMessages,
        tools: CHAT_TOOLS as Anthropic.Messages.Tool[],
      });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        // No more tool calls - send the final text response
        const textBlocks = response.content.filter(
          (b): b is Anthropic.Messages.TextBlock => b.type === "text",
        );

        for (const block of textBlocks) {
          res.write(
            `event: delta\ndata: ${JSON.stringify({ text: block.text })}\n\n`,
          );
        }

        res.write(`event: done\ndata: {}\n\n`);
        return res.end();
      }

      // There are tool calls - add assistant message to conversation
      anthropicMessages.push({ role: "assistant", content: response.content });

      // Execute each tool and collect results
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        res.write(
          `event: tool_start\ndata: ${JSON.stringify({ name: toolUse.name })}\n\n`,
        );

        const startTime = Date.now();

        try {
          const result = await executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            is_error: true,
          });
        }

        const duration = Date.now() - startTime;
        res.write(
          `event: tool_end\ndata: ${JSON.stringify({ name: toolUse.name, duration_ms: duration })}\n\n`,
        );
      }

      // Add tool results to conversation
      anthropicMessages.push({ role: "user", content: toolResults });
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
