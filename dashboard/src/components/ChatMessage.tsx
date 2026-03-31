import React from "react";
import type { ChatMessage as ChatMessageType } from "../hooks/useChat";

interface TableData {
  headers: string[];
  rows: string[][];
}

function parseTable(lines: string[]): TableData {
  const headers = lines[0]
    .split("|")
    .filter(c => c.trim() !== "")
    .map(c => c.trim());

  const rows: string[][] = [];
  // Skip header and separator (line index 1 is usually ---|----|---)
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]
      .split("|")
      .filter(c => c.trim() !== "")
      .map(c => c.trim());
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return { headers, rows };
}

function renderInline(text: string): React.ReactNode {
  // Process bold and inline code within a line
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Find the next special token
    const boldIdx = remaining.indexOf("**");
    const codeIdx = remaining.indexOf("`");

    // Determine which comes first
    let nextIdx = Infinity;
    let nextType = "";
    if (boldIdx >= 0 && boldIdx < nextIdx) { nextIdx = boldIdx; nextType = "bold"; }
    if (codeIdx >= 0 && codeIdx < nextIdx) { nextIdx = codeIdx; nextType = "code"; }

    if (nextType === "bold") {
      // Push text before **
      if (nextIdx > 0) {
        parts.push(remaining.slice(0, nextIdx));
      }
      const endBold = remaining.indexOf("**", nextIdx + 2);
      if (endBold === -1) {
        // No closing **, push rest as-is
        parts.push(remaining.slice(nextIdx));
        remaining = "";
      } else {
        parts.push(
          <strong key={key++}>{remaining.slice(nextIdx + 2, endBold)}</strong>
        );
        remaining = remaining.slice(endBold + 2);
      }
    } else if (nextType === "code") {
      // Push text before `
      if (nextIdx > 0) {
        parts.push(remaining.slice(0, nextIdx));
      }
      const endCode = remaining.indexOf("`", nextIdx + 1);
      if (endCode === -1) {
        parts.push(remaining.slice(nextIdx));
        remaining = "";
      } else {
        parts.push(
          <code key={key++} className="chat-inline-code">
            {remaining.slice(nextIdx + 1, endCode)}
          </code>
        );
        remaining = remaining.slice(endCode + 1);
      }
    } else {
      // No more special tokens
      parts.push(remaining);
      remaining = "";
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block: ```
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={key++} className="chat-code-block">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Table: lines starting with |
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const table = parseTable(tableLines);
        elements.push(
          <div key={key++} className="chat-table-wrap">
            <table className="chat-table">
              <thead>
                <tr>
                  {table.headers.map((h, hi) => (
                    <th key={hi}>{renderInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      } else {
        // Single line with | — just render as text
        elements.push(<p key={key++}>{renderInline(tableLines[0])}</p>);
      }
      continue;
    }

    // Unordered list: lines starting with -
    if (line.trimStart().startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("- ")) {
        items.push(lines[i].trimStart().slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="chat-list">
          {items.map((item, li) => (
            <li key={li}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list: lines starting with digit.
    if (/^\d+\.\s/.test(line.trimStart())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trimStart())) {
        items.push(lines[i].trimStart().replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={key++} className="chat-list">
          {items.map((item, li) => (
            <li key={li}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Heading: ### or ## or #
    if (line.startsWith("### ")) {
      elements.push(<h4 key={key++} className="chat-heading">{renderInline(line.slice(4))}</h4>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h3 key={key++} className="chat-heading">{renderInline(line.slice(3))}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(<h3 key={key++} className="chat-heading">{renderInline(line.slice(2))}</h3>);
      i++;
      continue;
    }

    // Empty line: paragraph break
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Regular text: collect consecutive non-empty, non-special lines
    const textLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !lines[i].trimStart().startsWith("|") &&
      !lines[i].trimStart().startsWith("- ") &&
      !/^\d+\.\s/.test(lines[i].trimStart()) &&
      !lines[i].startsWith("# ") &&
      !lines[i].startsWith("## ") &&
      !lines[i].startsWith("### ")
    ) {
      textLines.push(lines[i]);
      i++;
    }

    if (textLines.length > 0) {
      elements.push(
        <p key={key++}>
          {textLines.map((tl, ti) => (
            <React.Fragment key={ti}>
              {ti > 0 && <br />}
              {renderInline(tl)}
            </React.Fragment>
          ))}
        </p>
      );
    }
  }

  return <>{elements}</>;
}

export function ChatMessage({ message }: { message: ChatMessageType }) {
  return (
    <div className={`chat-message ${message.role}`}>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="chat-tools-used">
          {message.toolCalls.map((tc, i) => (
            <span key={i} className="chat-tool-badge">
              {tc.name.replace(/^(mixpanel_|hubspot_|medicus_)/, "")}
              {tc.duration_ms != null && (
                <span className="chat-tool-time">
                  {(tc.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="chat-message-content">
        {message.role === "user" ? message.content : renderMarkdown(message.content)}
      </div>
    </div>
  );
}
