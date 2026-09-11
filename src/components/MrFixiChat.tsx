"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  Send,
  Sparkles,
  Loader2,
  Trash2,
  Wand2,
} from "lucide-react";
import { useDashboardStore } from "../store/dashboard";
import type { ChatMessage } from "../lib/types";

export function MrFixiChat() {
  const dataset = useDashboardStore((s) => s.dataset);
  const widgets = useDashboardStore((s) => s.widgets);
  const filters = useDashboardStore((s) => s.filters);
  const calculatedColumns = useDashboardStore((s) => s.calculatedColumns);
  const chatMessages = useDashboardStore((s) => s.chatMessages);
  const addChatMessage = useDashboardStore((s) => s.addChatMessage);
  const clearChat = useDashboardStore((s) => s.clearChat);
  const addWidget = useDashboardStore((s) => s.addWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const addFilter = useDashboardStore((s) => s.addFilter);
  const addCalculatedColumn = useDashboardStore((s) => s.addCalculatedColumn);
  const clearDataset = useDashboardStore((s) => s.clearDataset);
  const setDashboardTitle = useDashboardStore((s) => s.setDashboardTitle);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, loading]);

  // Initialize with welcome message
  useEffect(() => {
    if (chatMessages.length === 0) {
      addChatMessage({
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: dataset
          ? `Hi! I'm MrFixi, your data assistant. I can see you have "${dataset.fileName}" loaded with ${dataset.rowCount} rows and ${dataset.columns.length} columns. Ask me to create a chart, analyze your data, or recommend the best visualizations!`
          : "Hi! I'm MrFixi, your data assistant. Upload some data and I'll help you create charts, add filters, calculate columns, and more!",
      });
    }
  }, [dataset, chatMessages.length, addChatMessage]);

  const buildSummary = useCallback(() => {
    if (!dataset) return undefined;
    return {
      fileName: dataset.fileName,
      rowCount: dataset.rowCount,
      columns: dataset.columns.map((c) => ({
        name: c.name,
        type: c.type,
        uniqueCount: c.uniqueCount,
        min: c.min,
        max: c.max,
      })),
      widgets: widgets.map((w) => ({
        type: w.chart.type,
        title: w.chart.title,
        xAxis: w.chart.xAxis,
        yAxis: w.chart.yAxis,
      })),
      filters: filters.map((f) => ({
        column: f.column,
        selectedCount: f.selected.length,
      })),
      calculatedColumns: calculatedColumns.map((c) => ({
        name: c.name,
        formula: c.formula,
      })),
    };
  }, [dataset, widgets, filters, calculatedColumns]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input.trim(),
    };
    addChatMessage(userMsg);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.content,
          datasetSummary: buildSummary(),
        }),
      });

      if (!res.ok) throw new Error("Failed to get response");

      const data = await res.json();

      // Execute action if present
      if (data.action) {
        executeAction(data.action.type, data.action.payload);
      }

      addChatMessage({
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: data.reply,
        action: data.action,
      });
    } catch {
      setError("Connection error. Please try again.");
      addChatMessage({
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: "Sorry, I couldn't process that request. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  function executeAction(type: string, payload: Record<string, unknown>) {
    switch (type) {
      case "create_chart":
        addWidget({
          id: `chart-${Date.now()}`,
          type: payload.type as never,
          title: (payload.title as string) || "Chart",
          xAxis: payload.xAxis as string | undefined,
          yAxis: payload.yAxis as string | undefined,
          groupBy: payload.groupBy as string | undefined,
          aggregation: ((payload.aggregation as string) || "sum") as never,
        });
        break;
      case "add_filter":
        if (dataset) {
          const col = payload.column as string;
          const values = payload.values as (string | number)[];
          addFilter({
            column: col,
            values,
            selected: values,
          });
        }
        break;
      case "calculate_column":
        addCalculatedColumn({
          id: `calc-${Date.now()}`,
          name: payload.name as string,
          formula: payload.formula as string,
          type: "number",
        });
        break;
      case "set_title":
        setDashboardTitle(payload.title as string);
        break;
      case "clear_all":
        // Clear all widgets
        widgets.forEach((w) => removeWidget(w.id));
        break;
    }
  }

  const suggestions = dataset
    ? [
        "Create a bar chart of Sales by Region",
        "Show me a pie chart of Category distribution",
        "What's the best chart for this data?",
        "Give me a summary of the data",
      ]
    : [
        "Upload some data first!",
      ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">MrFixi</h3>
            <p className="text-[10px] text-slate-400">AI Data Assistant</p>
          </div>
        </div>
        {chatMessages.length > 1 && (
          <button
            onClick={clearChat}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3"
      >
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.action && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] opacity-70">
                  <Wand2 className="h-2.5 w-2.5" />
                  {msg.action.type.replace("_", " ")}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="mb-3 flex justify-start">
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              MrFixi is thinking...
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {chatMessages.length <= 1 && (
        <div className="px-3 pb-2">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <Sparkles className="h-3 w-3" />
            Try asking:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                disabled={!dataset}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-100 p-3">
        {error && (
          <p className="mb-2 text-[10px] text-red-500">{error}</p>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask MrFixi to create a chart..."
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
