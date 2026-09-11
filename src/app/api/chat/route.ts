import { NextRequest, NextResponse } from "next/server";

interface ChatRequest {
  message: string;
  datasetSummary?: {
    fileName: string;
    rowCount: number;
    columns: { name: string; type: string; uniqueCount: number; min?: number | string; max?: number | string }[];
    widgets: { type: string; title: string; xAxis?: string; yAxis?: string }[];
    filters: { column: string; selectedCount: number }[];
    calculatedColumns: { name: string; formula: string }[];
  };
}

interface ChatResponse {
  reply: string;
  action?: {
    type: "create_chart" | "add_filter" | "remove_chart" | "calculate_column" | "set_title" | "clear_all";
    payload: Record<string, unknown>;
  };
}

export async function POST(request: NextRequest) {
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { message, datasetSummary } = body;

  if (!message?.trim()) {
    return NextResponse.json({ reply: "Hi! I'm MrFixi. Ask me to create a chart, add a filter, or analyze your data." });
  }

  // Build context from dataset
  const ctx = datasetSummary
    ? `Dataset: ${datasetSummary.fileName} (${datasetSummary.rowCount} rows, ${datasetSummary.columns.length} columns).
Columns: ${datasetSummary.columns.map((c) => `${c.name} (${c.type}${c.min !== undefined ? `, range ${c.min}–${c.max}` : ""}, ${c.uniqueCount} unique)`).join("; ")}.
Existing charts: ${datasetSummary.widgets.length > 0 ? datasetSummary.widgets.map((w) => `${w.title} (${w.type}${w.xAxis ? `, x=${w.xAxis}` : ""}${w.yAxis ? `, y=${w.yAxis}` : ""})`).join("; ") : "none"}.
Active filters: ${datasetSummary.filters.length > 0 ? datasetSummary.filters.map((f) => `${f.column} (${f.selectedCount} selected)`).join("; ") : "none"}.
Calculated columns: ${datasetSummary.calculatedColumns.length > 0 ? datasetSummary.calculatedColumns.map((c) => `${c.name} = ${c.formula}`).join("; ") : "none"}.`
    : "No dataset loaded yet.";

  const systemPrompt = `You are MrFixi, a friendly data analyst AI assistant inside Datavio, a visual dashboard tool.
You help users understand their data and create visualizations.

${ctx}

When the user asks you to create a chart, add a filter, calculate a column, or perform any action, respond with a JSON action object in addition to your text reply.

Available action types and their payloads:
1. create_chart: { type: chart_type, title: string, xAxis?: string, yAxis?: string, groupBy?: string, aggregation?: "sum"|"avg"|"count"|"min"|"max" }
   - chart_type can be: bar, line, area, pie, scatter, heatmap, gauge, treemap, radar, funnel, boxplot, sankey, sunburst, candlestick, graph, themeRiver
   - xAxis should be a categorical or date column for most charts
   - yAxis should be a numeric column
   - For scatter/heatmap, xAxis and yAxis should both be numeric
   - For gauge, only yAxis is needed
2. add_filter: { column: string, values: (string|number)[] }
3. remove_chart: { title: string } — match by title
4. calculate_column: { name: string, formula: string } — formula uses column names and mathjs syntax
5. set_title: { title: string }
6. clear_all: {}

Rules:
- Always pick chart types and column mappings that make sense for the data types.
- If the user asks for something vague, pick the best chart type and columns automatically.
- Be concise but friendly. Use first person ("I'll create...", "Let me add...").
- If no dataset is loaded, tell the user to upload data first.
- For formulas, use actual column names from the dataset. Examples: "Sales * 1.1", "Profit / Sales * 100", "Sales - Cost".
- Only output ONE action object (or none). Not multiple.

Format your response as JSON:
{
  "reply": "Your text response to the user",
  "action": { "type": "...", "payload": { ... } } // optional
}`;

  try {
    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!apiResponse.ok) {
      // Fallback to rule-based AI
      return NextResponse.json(ruleBasedAI(message, datasetSummary));
    }

    const data = await apiResponse.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Try to parse the content as JSON
    try {
      const parsed = JSON.parse(content);
      return NextResponse.json({
        reply: parsed.reply || content,
        action: parsed.action,
      });
    } catch {
      // If not JSON, return as plain text
      return NextResponse.json({ reply: content });
    }
  } catch {
    // Fallback to rule-based AI
    return NextResponse.json(ruleBasedAI(message, datasetSummary));
  }
}

/**
 * Rule-based fallback AI — works without an API key.
 * Parses natural language and maps to chart actions.
 */
function ruleBasedAI(
  message: string,
  dataset?: ChatRequest["datasetSummary"]
): ChatResponse {
  if (!dataset) {
    return {
      reply: "Hi! I'm MrFixi. Upload some data first, then ask me to create charts, add filters, or analyze your data. I can suggest the best chart types for your columns!",
    };
  }

  const lower = message.toLowerCase();
  const numericCols = dataset.columns.filter((c) => c.type === "number");
  const catCols = dataset.columns.filter((c) => c.type === "string" || c.type === "boolean");
  const dateCols = dataset.columns.filter((c) => c.type === "date");

  // Check for chart creation requests
  const chartKeywords: { type: string; words: string[] }[] = [
    { type: "bar", words: ["bar", "column"] },
    { type: "line", words: ["line", "trend", "time"] },
    { type: "pie", words: ["pie", "proportion", "share", "breakdown"] },
    { type: "scatter", words: ["scatter", "correlation", "relationship"] },
    { type: "area", words: ["area"] },
    { type: "gauge", words: ["gauge", "average", "mean"] },
    { type: "heatmap", words: ["heatmap", "heat map"] },
    { type: "treemap", words: ["treemap", "tree map"] },
    { type: "radar", words: ["radar", "spider"] },
    { type: "funnel", words: ["funnel", "pipeline"] },
    { type: "boxplot", words: ["box", "boxplot", "quartile"] },
    { type: "sunburst", words: ["sunburst", "sun burst"] },
  ];

  // Find a column mentioned in the message
  function findColumn(cols: NonNullable<ChatRequest["datasetSummary"]>["columns"], text: string) {
    for (const col of cols) {
      if (text.includes(col.name.toLowerCase())) return col.name;
    }
    return null;
  }

  // Detect chart type
  let chartType: string | null = null;
  for (const ck of chartKeywords) {
    if (ck.words.some((w) => lower.includes(w))) {
      chartType = ck.type;
      break;
    }
  }

  // If user says "chart" or "visualize" or "show" without specifying type
  if (!chartType && (lower.includes("chart") || lower.includes("visualize") || lower.includes("show") || lower.includes("plot") || lower.includes("create"))) {
    chartType = "bar";
  }

  if (chartType) {
    const mentionedNum = findColumn(numericCols, lower) || numericCols[0]?.name;
    const mentionedCat = findColumn(catCols, lower) || catCols[0]?.name;
    const mentionedDate = findColumn(dateCols, lower) || dateCols[0]?.name;
    const yAxis = mentionedNum;
    const xAxis = mentionedCat || mentionedDate || dataset.columns[0]?.name;
    const title = `${yAxis || "Value"} by ${xAxis || "Category"}`;

    return {
      reply: `I'll create a ${chartType} chart showing ${yAxis || "values"} by ${xAxis || "category"}. ${chartType === "pie" ? "This will show the proportion of each category." : chartType === "scatter" ? "This will show the relationship between two numeric columns." : "This should give you a clear visual comparison."} Is there anything you'd like me to adjust?`,
      action: {
        type: "create_chart",
        payload: {
          type: chartType,
          title,
          xAxis,
          yAxis,
          aggregation: "sum",
        },
      },
    };
  }

  // Check for filter requests
  if (lower.includes("filter") || lower.includes("only show") || lower.includes("where")) {
    const col = findColumn(catCols, lower) || catCols[0]?.name;
    if (col) {
      return {
        reply: `I can help you filter by ${col}. Open the Filters tab in the left sidebar and select the values you want to include. Would you like me to create a specific chart instead?`,
      };
    }
  }

  // Check for calculated column requests
  if (lower.includes("calculate") || lower.includes("formula") || lower.includes("compute") || lower.includes("new column")) {
    const col = findColumn(numericCols, lower);
    if (col) {
      return {
        reply: `I can help you create a calculated column. For example, you could compute "${col} * 1.1" for a 10% adjustment, or combine multiple columns like "Sales - Cost". Go to the Calculated Columns section in the sidebar to set this up. What formula would you like?`,
      };
    }
  }

  // Check for "remove" or "delete" chart
  if (lower.includes("remove") || lower.includes("delete") || lower.includes("clear")) {
    if (lower.includes("all") || lower.includes("everything")) {
      return {
        reply: "I'll clear all charts from your dashboard. Use the toolbar to start fresh.",
        action: { type: "clear_all", payload: {} },
      };
    }
    return {
      reply: "Which chart would you like to remove? You can click the trash icon on any chart card, or tell me the chart title.",
    };
  }

  // Check for summary/analysis
  if (lower.includes("summary") || lower.includes("analyze") || lower.includes("insight") || lower.includes("describe") || lower.includes("overview")) {
    const insights: string[] = [];
    if (numericCols.length > 0) {
      insights.push(`Your dataset has ${dataset.rowCount} rows with ${numericCols.length} numeric columns: ${numericCols.map((c) => c.name).join(", ")}.`);
    }
    if (catCols.length > 0) {
      insights.push(`Categorical columns: ${catCols.map((c) => `${c.name} (${c.uniqueCount} unique values)`).join(", ")}.`);
    }
    if (dateCols.length > 0) {
      insights.push(`Date columns: ${dateCols.map((c) => c.name).join(", ")}.`);
    }
    insights.push(`I'd suggest starting with a bar chart of your largest numeric column grouped by a category. Want me to create that?`);
    return {
      reply: insights.join(" "),
    };
  }

  // Check for "best chart" recommendations
  if (lower.includes("best") || lower.includes("recommend") || lower.includes("suggest")) {
    const recs: string[] = [];
    if (numericCols.length >= 2) {
      recs.push(`Since you have multiple numeric columns (${numericCols.map((c) => c.name).join(", ")}), a scatter plot would show correlations between them.`);
    }
    if (catCols.length > 0 && numericCols.length > 0) {
      recs.push(`A bar chart of ${numericCols[0]?.name} by ${catCols[0]?.name} would show how values compare across categories.`);
    }
    if (dateCols.length > 0 && numericCols.length > 0) {
      recs.push(`A line chart of ${numericCols[0]?.name} over ${dateCols[0]?.name} would show trends over time.`);
    }
    if (catCols.length > 0) {
      recs.push(`A pie chart of ${catCols[0]?.name} would show the distribution of categories.`);
    }
    return {
      reply: recs.length > 0 ? `Here are my recommendations:\n\n${recs.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\nWhich would you like me to create?` : "Upload numeric data and I can recommend the best chart types for it!",
    };
  }

  // Default
  return {
    reply: `I'm MrFixi, your data assistant. I can help you:\n1. Create charts (say "create a bar chart of Sales by Region")\n2. Recommend visualizations (say "what's the best chart?")\n3. Analyze your data (say "give me a summary")\n4. Create calculated columns (say "calculate Profit as Sales minus Cost")\n5. Clear charts (say "remove all charts")\n\nWhat would you like to do?`,
  };
}
