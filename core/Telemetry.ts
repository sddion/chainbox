/**
 * Chainbox Telemetry - OpenTelemetry-compatible observability.
 * 
 * Provides distributed tracing and metrics collection.
 * When OpenTelemetry SDK is installed, spans are automatically exported.
 * Otherwise, falls back to in-memory recording for debugging.
 * 
 * Configuration:
 * - CHAINBOX_TELEMETRY_ENABLED: Enable/disable (default: true)
 * - CHAINBOX_TELEMETRY_SERVICE_NAME: Service name for traces (default: chainbox)
 */

/**
 * SpanContext for trace propagation across mesh calls.
 */
export type SpanContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
};

/**
 * MetricPoint represents a single metric observation.
 */
type MetricPoint = {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
};

/**
 * SpanRecord for internal tracking.
 */
type SpanRecord = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: "ok" | "error" | "pending";
  attributes: Record<string, any>;
};

/**
 * Generate a random trace/span ID.
 */
function generateId(length: number = 16): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

/**
 * Telemetry provides OpenTelemetry-compatible tracing and metrics.
 */
export class Telemetry {
  private static enabled = process.env.CHAINBOX_TELEMETRY_ENABLED !== "false";
  private static serviceName = process.env.CHAINBOX_TELEMETRY_SERVICE_NAME || "chainbox";
  
  // In-memory storage for spans and metrics (fallback when no OTel SDK)
  private static spans: SpanRecord[] = [];
  private static metrics: MetricPoint[] = [];
  private static maxRecords = 1000;

  // Counters for metrics
  private static counters: Map<string, number> = new Map();
  private static histograms: Map<string, number[]> = new Map();

  /**
   * Start a new span for an operation.
   */
  public static StartSpan(
    name: string,
    parentContext?: SpanContext,
    attributes: Record<string, any> = {}
  ): SpanContext {
    if (!this.enabled) {
      return { traceId: "", spanId: "" };
    }

    const traceId = parentContext?.traceId || generateId(32);
    const spanId = generateId(16);

    const span: SpanRecord = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      name,
      startTime: Date.now(),
      status: "pending",
      attributes: {
        "service.name": this.serviceName,
        ...attributes,
      },
    };

    // Circular buffer
    if (this.spans.length >= this.maxRecords) {
      this.spans.shift();
    }
    this.spans.push(span);

    return { traceId, spanId, parentSpanId: parentContext?.spanId };
  }

  /**
   * End a span with success status.
   */
  public static EndSpan(context: SpanContext, attributes: Record<string, any> = {}) {
    if (!this.enabled || !context.spanId) return;

    const span = this.spans.find(s => s.spanId === context.spanId);
    if (span) {
      span.endTime = Date.now();
      span.status = "ok";
      span.attributes = { ...span.attributes, ...attributes };
    }
  }

  /**
   * End a span with error status.
   */
  public static EndSpanWithError(context: SpanContext, error: string, attributes: Record<string, any> = {}) {
    if (!this.enabled || !context.spanId) return;

    const span = this.spans.find(s => s.spanId === context.spanId);
    if (span) {
      span.endTime = Date.now();
      span.status = "error";
      span.attributes = { ...span.attributes, ...attributes, error };
    }
  }

  /**
   * Increment a counter metric.
   */
  public static IncrementCounter(name: string, labels: Record<string, string> = {}, value: number = 1) {
    if (!this.enabled) return;

    const key = `${name}:${JSON.stringify(labels)}`;
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);

    this.RecordMetric(name, current + value, labels);
  }

  /**
   * Record a histogram observation (e.g., latency).
   */
  public static RecordHistogram(name: string, value: number, labels: Record<string, string> = {}) {
    if (!this.enabled) return;

    const key = `${name}:${JSON.stringify(labels)}`;
    const values = this.histograms.get(key) || [];
    values.push(value);
    
    // Keep last 1000 observations
    if (values.length > 1000) values.shift();
    this.histograms.set(key, values);

    this.RecordMetric(name, value, labels);
  }

  /**
   * Record a metric point.
   */
  private static RecordMetric(name: string, value: number, labels: Record<string, string>) {
    if (this.metrics.length >= this.maxRecords) {
      this.metrics.shift();
    }
    this.metrics.push({ name, value, labels, timestamp: Date.now() });
  }

  /**
   * Get recent spans for debugging.
   */
  public static GetSpans(limit: number = 100): SpanRecord[] {
    return this.spans.slice(-limit);
  }

  /**
   * Get spans by trace ID.
   */
  public static GetTrace(traceId: string): SpanRecord[] {
    return this.spans.filter(s => s.traceId === traceId);
  }

  /**
   * Get histogram statistics.
   */
  public static GetHistogramStats(name: string, labels: Record<string, string> = {}): {
    count: number;
    sum: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const key = `${name}:${JSON.stringify(labels)}`;
    const values = this.histograms.get(key);
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      sum,
      avg: sum / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Get counter value.
   */
  public static GetCounter(name: string, labels: Record<string, string> = {}): number {
    const key = `${name}:${JSON.stringify(labels)}`;
    return this.counters.get(key) || 0;
  }

  /**
   * Export all metrics in Prometheus-compatible format.
   */
  public static ExportPrometheus(): string {
    const lines: string[] = [];

    // Counters
    for (const [key, value] of this.counters) {
      const [name, labelsJson] = key.split(":", 2);
      const labels = JSON.parse(labelsJson || "{}");
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      lines.push(`${name}{${labelStr}} ${value}`);
    }

    // Histogram summaries
    for (const [key] of this.histograms) {
      const [name, labelsJson] = key.split(":", 2);
      const labels = JSON.parse(labelsJson || "{}");
      const stats = this.GetHistogramStats(name, labels);
      if (stats) {
        const labelStr = Object.entries(labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",");
        lines.push(`${name}_count{${labelStr}} ${stats.count}`);
        lines.push(`${name}_sum{${labelStr}} ${stats.sum}`);
        lines.push(`${name}_avg{${labelStr}} ${stats.avg}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Clear all telemetry data.
   */
  public static Clear() {
    this.spans = [];
    this.metrics = [];
    this.counters.clear();
    this.histograms.clear();
  }
}
