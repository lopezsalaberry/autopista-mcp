import React, { useState, useRef, useEffect } from "react";
import { useChat } from "../hooks/useChat";
import { ChatMessage } from "./ChatMessage";

export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { messages, isStreaming, activeTools, sendMessage, clearChat } = useChat();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTools]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) {
      // Small delay to allow the transition to start, then focus
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  }, [input]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Backdrop overlay for mobile */}
      {open && <div className="chat-backdrop" onClick={onClose} />}

      <div className={`chat-drawer ${open ? "open" : ""}`}>
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h3>Asistente Medicus</h3>
          </div>
          <div className="chat-header-actions">
            {messages.length > 0 && (
              <button
                className="chat-header-btn"
                onClick={clearChat}
                title="Limpiar chat"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3,6 5,6 21,6" />
                  <path d="M19,6V20a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
                </svg>
              </button>
            )}
            <button className="chat-header-btn" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--brand-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="chat-empty-title">Asistente de datos</p>
              <p className="chat-empty-hint">
                Preguntame sobre metricas, contactos, deals, funnel de conversion, o cualquier dato de Medicus.
              </p>
            </div>
          )}
          {messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {activeTools.length > 0 && (
            <div className="chat-tool-indicator">
              <div className="chat-tool-spinner" />
              <span>
                Consultando{" "}
                {activeTools[activeTools.length - 1].replace(
                  /^(mixpanel_|hubspot_|medicus_)/,
                  ""
                )}
                ...
              </span>
            </div>
          )}
          {isStreaming && activeTools.length === 0 && messages.length > 0 && (
            <div className="chat-typing-indicator">
              <span />
              <span />
              <span />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribi tu consulta..."
            rows={1}
            disabled={isStreaming}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            title="Enviar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
