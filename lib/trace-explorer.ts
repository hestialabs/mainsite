/**
 * HESTIA Labs - Incident Investigation Trace Explorer
 *
 * Enables full execution path reconstruction for forensics and debugging.
 * Integrates with Jaeger for trace data, adds security-specific enrichment.
 *
 * Supports:
 * - End-to-end command flow visualization
 * - Authority transition tracking
 * - Signature chain verification
 * - Latency attribution (which service is slow?)
 * - Anomaly correlation within trace
 * - Export for offline analysis
 */

import { ExecutionTrace, ExecutionSpan, AuthorityLevel } from "./telemetry-types";

// ============================================================================
// TRACE QUERY BUILDER
// ============================================================================

export interface TraceQuery {
    trace_id?: string;
    home_id?: string;
    device_id?: string;
    command_id?: string;
    service_name?: string;
    status?: "success" | "partial_failure" | "failure";
    time_range?: {
        start_ms: number;
        end_ms: number;
    };
    min_duration_ms?: number; // only traces with total duration > threshold
}

export interface TraceQueryResult {
    traces: ExecutionTrace[];
    total_count: number;
    query_time_ms: number;
}

/**
 * Fetch traces from Jaeger API.
 * Wrapper around Jaeger HTTP API with security-aware filtering.
 */
export class TraceExplorer {
    constructor(
        private jaegerBaseUrl: string = "http://localhost:16686",
        private timescaleDbConnection?: any, // optional: for correlating traces with metrics from TimescaleDB
    ) {}

    /**
     * Check if TimescaleDB connection is available for metrics correlation.
     */
    private hasMetricsConnection(): boolean {
        return !!this.timescaleDbConnection;
    }

    /**
     * Query traces by various criteria.
     */
    async queryTraces(query: TraceQuery): Promise<TraceQueryResult> {
        // Check if we can enrich results with metrics data from TimescaleDB
        const enrichWithMetrics = this.hasMetricsConnection();

        const jaegerQuery = this.buildJaegerQuery(query);
        const startTime = Date.now();

        const response = await fetch(`${this.jaegerBaseUrl}/api/traces?${jaegerQuery}`, {
            headers: {
                "X-Trace-Viewer": "hestia-dashboard",
                "X-Metrics-Enhanced": enrichWithMetrics ? "true" : "false",
                Authorization: `Bearer ${process.env.JAEGER_API_TOKEN}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Jaeger API error: ${response.status}`);
        }

        const data = await response.json();
        const queryTime = Date.now() - startTime;

        // Enrich traces with security context
        const enrichedTraces = data.data.map((t: any) => this.enrichTrace(t));

        return {
            traces: enrichedTraces,
            total_count: data.data.length,
            query_time_ms: queryTime,
        };
    }

    /**
     * Get single trace by ID.
     */
    async getTrace(traceId: string): Promise<ExecutionTrace> {
        const response = await fetch(`${this.jaegerBaseUrl}/api/traces/${traceId}`, {
            headers: {
                Authorization: `Bearer ${process.env.JAEGER_API_TOKEN}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Trace not found: ${traceId}`);
        }

        const data = await response.json();
        return this.enrichTrace(data.data[0]);
    }

    /**
     * Build Jaeger API query string from our query format.
     */
    private buildJaegerQuery(query: TraceQuery): string {
        const params = new URLSearchParams();

        if (query.service_name) {
            params.append("service", query.service_name);
        }

        // Build tag-based filters
        const tags: string[] = [];
        if (query.home_id) tags.push(`home_id=${query.home_id}`);
        if (query.device_id) tags.push(`device_id=${query.device_id}`);
        if (query.command_id) tags.push(`command_id=${query.command_id}`);
        if (query.status) tags.push(`status=${query.status}`);

        if (tags.length > 0) {
            params.append("tags", tags.join(" "));
        }

        if (query.time_range) {
            params.append("start", Math.floor(query.time_range.start_ms / 1000).toString());
            params.append("end", Math.floor(query.time_range.end_ms / 1000).toString());
        }

        params.append("limit", "100");

        return params.toString();
    }

    /**
     * Enrich Jaeger trace with security context and analysis.
     */
    private enrichTrace(jaegerTrace: any): ExecutionTrace {
        const spans: ExecutionSpan[] = jaegerTrace.spans.map((s: any) => ({
            span_id: s.spanID,
            parent_span_id:
                s.references?.find((r: any) => r.refType === "CHILD_OF")?.spanID || null,
            trace_id: s.traceID,
            operation_name: s.operationName,
            service_name: s.process.serviceName,
            started_at: s.startTime,
            ended_at: s.startTime + s.duration,
            duration_ms: Math.round(s.duration / 1000),
            wall_duration_ms: Math.round(s.duration / 1000), // same as duration for Jaeger
            authority_level: this.extractAuthority(s.tags),
            authority_boundary: this.extractBoundary(s.tags),
            status: this.extractStatus(s),
            error_message: s.tags?.find((t: any) => t.key === "error.message")?.value,
            signature_in_valid:
                s.tags?.find((t: any) => t.key === "signature.in.valid")?.value === true,
            signature_out_created:
                s.tags?.find((t: any) => t.key === "signature.out.created")?.value === true,
            tags: this.extractTags(s.tags),
            queued_time_ms: s.tags?.find((t: any) => t.key === "queued_time_ms")?.value,
            processing_time_ms: s.tags?.find((t: any) => t.key === "processing_time_ms")?.value,
            child_latency_ms: undefined, // will compute below
            child_span_ids: [],
        }));

        // Build parent-child relationships
        for (const span of spans) {
            const parent = spans.find((s) => s.span_id === span.parent_span_id);
            if (parent) {
                parent.child_span_ids.push(span.span_id);
            }
        }

        // Compute child latencies
        for (const span of spans) {
            if (span.child_span_ids.length > 0) {
                const childSpans = spans.filter((s) => span.child_span_ids.includes(s.span_id));
                span.child_latency_ms = childSpans.reduce((sum, s) => sum + s.duration_ms, 0);
            }
        }

        // Reconstruct authority path
        const rootSpan = spans.find((s) => !s.parent_span_id);
        const authorityPath = this.extractAuthorityPath(spans, rootSpan?.span_id);

        // Determine trace status
        const failedSpans = spans.filter((s) => s.status === "failed");
        let traceStatus: "success" | "partial_failure" | "failure";
        if (failedSpans.length === 0) {
            traceStatus = "success";
        } else if (failedSpans.length < spans.length) {
            traceStatus = "partial_failure";
        } else {
            traceStatus = "failure";
        }

        // Extract trace-level info (homeId used for filtering, commandId for logging context)
        const homeId = this.extractTag(spans, "home_id");
        const commandId = this.extractTag(spans, "command_id");

        // Log command context for trace debugging
        if (commandId) {
            console.debug(`Trace ${jaegerTrace.traceID} from command ${commandId}`);
        }

        return {
            trace_id: jaegerTrace.traceID,
            home_id: homeId || "unknown",
            initiated_at: Math.min(...spans.map((s) => s.started_at)),
            completed_at: Math.max(...spans.map((s) => s.ended_at)),
            total_duration_ms: rootSpan
                ? rootSpan.started_at +
                  rootSpan.duration_ms -
                  Math.min(...spans.map((s) => s.started_at))
                : 0,
            spans,
            authority_path: authorityPath,
            trace_status: traceStatus,
            root_failure_reason: failedSpans[0]?.error_message,
            signatures_verified: spans.filter((s) => s.signature_in_valid).length,
            signatures_failed: spans.filter(
                (s) => !s.signature_in_valid && s.signature_in_valid !== undefined,
            ).length,
            replay_checks_performed: spans.filter((s) => s.tags.replay_check).length,
            security_anomalies: [], // TO BE filled from security_anomaly events
        };
    }

    /**
     * Extract authority level from span tags.
     */
    private extractAuthority(tags: any[]): AuthorityLevel {
        const authTag = tags?.find((t) => t.key === "authority_level");
        return (authTag?.value || "Device") as AuthorityLevel;
    }

    /**
     * Extract authority boundary constraint.
     */
    private extractBoundary(tags: any[]): string | null {
        return tags?.find((t) => t.key === "authority_boundary")?.value || null;
    }

    /**
     * Extract span execution status.
     */
    private extractStatus(span: any): "pending" | "running" | "succeeded" | "failed" | "timeout" {
        if (span.tags?.find((t: any) => t.key === "error")?.value) {
            return "failed";
        }
        if (span.tags?.find((t: any) => t.key === "timeout")?.value) {
            return "timeout";
        }
        return "succeeded";
    }

    /**
     * Extract key-value tags from span.
     */
    private extractTags(tags: any[]): Record<string, string | number> {
        const result: Record<string, string | number> = {};
        for (const tag of tags || []) {
            result[tag.key] = tag.value;
        }
        return result;
    }

    /**
     * Extract authority chain from root span.
     */
    private extractAuthorityPath(spans: ExecutionSpan[], rootSpanId?: string): AuthorityLevel[] {
        const path: AuthorityLevel[] = [];
        let currentSpan = spans.find((s) => s.span_id === rootSpanId);

        while (currentSpan) {
            if (!path.includes(currentSpan.authority_level)) {
                path.push(currentSpan.authority_level);
            }

            // Find first child
            const child = spans.find((s) => s.parent_span_id === currentSpan?.span_id);
            currentSpan = child;
        }

        return path;
    }

    /**
     * Helper: extract tag value from any span.
     */
    private extractTag(spans: ExecutionSpan[], key: string): string | undefined {
        for (const span of spans) {
            if (span.tags[key]) {
                return String(span.tags[key]);
            }
        }
        return undefined;
    }
}

// ============================================================================
// TRACE ANALYSIS UTILITIES
// ============================================================================

/**
 * Analyze trace for latency issues and bottlenecks.
 */
export class TraceAnalyzer {
    /**
     * Identify slowest service in trace.
     */
    static findSlowestService(trace: ExecutionTrace): {
        service_name: string;
        total_latency_ms: number;
        span_count: number;
    } | null {
        const serviceLatencies = new Map<string, { total: number; count: number }>();

        for (const span of trace.spans) {
            if (!serviceLatencies.has(span.service_name)) {
                serviceLatencies.set(span.service_name, { total: 0, count: 0 });
            }

            const stat = serviceLatencies.get(span.service_name)!;
            stat.total += span.duration_ms;
            stat.count += 1;
        }

        let slowest: { name: string; total: number; count: number } | null = null;
        for (const [name, stat] of serviceLatencies) {
            if (!slowest || stat.total > slowest.total) {
                slowest = { name, ...stat };
            }
        }

        return slowest
            ? {
                  service_name: slowest.name,
                  total_latency_ms: slowest.total,
                  span_count: slowest.count,
              }
            : null;
    }

    /**
     * Check signature chain validation status.
     */
    static verifySignatureChain(trace: ExecutionTrace): {
        valid: boolean;
        problems: string[];
        verified_spans: number;
        failed_spans: number;
    } {
        const problems: string[] = [];
        let verified = 0;
        let failed = 0;

        for (const span of trace.spans) {
            if (span.signature_in_valid) {
                verified += 1;
            } else if (span.signature_in_valid === false) {
                failed += 1;
                problems.push(`Signature validation failed at ${span.service_name}`);
            }
        }

        // Check that critical transitions have signatures
        for (let i = 0; i < trace.authority_path.length - 1; i++) {
            const from = trace.authority_path[i];
            const to = trace.authority_path[i + 1];

            const transitionSpans = trace.spans.filter((s) => {
                const authorityTransition = s.tags.authority_transition;
                return (
                    typeof authorityTransition === "string" &&
                    authorityTransition.includes(`${from}:to:${to}`)
                );
            });

            // Verify all transition spans have valid signatures
            const validTransitions = transitionSpans.filter(
                (s) => s.tags.signature_status === "verified",
            );

            if (validTransitions.length !== transitionSpans.length && transitionSpans.length > 0) {
                problems.push(
                    `Authority transition ${from}→${to} has ${transitionSpans.length - validTransitions.length} unsigned spans`,
                );
            }
        }

        return {
            valid: failed === 0 && problems.length === 0,
            problems,
            verified_spans: verified,
            failed_spans: failed,
        };
    }

    /**
     * Identify authority boundary violations.
     */
    static checkAuthorityBoundaries(trace: ExecutionTrace): {
        violations: string[];
        escalations: string[];
    } {
        const violations: string[] = [];
        const escalations: string[] = [];

        for (const span of trace.spans) {
            // Check if span exceeded its authority boundary
            if (span.authority_boundary) {
                const operationName = span.operation_name.toLowerCase();

                // Example: "living_room_only" boundary can only control lights in living_room
                if (
                    span.authority_boundary.includes("_only") &&
                    !operationName.includes(span.authority_boundary.split("_")[0])
                ) {
                    violations.push(
                        `${span.service_name}: Operation '${span.operation_name}' exceeds boundary '${span.authority_boundary}'`,
                    );
                }
            }

            // Check for privilege escalation patterns
            if (
                span.authority_level === "Device" &&
                (typeof span.tags.initiates_planner_call === "string" ||
                    typeof span.tags.initiates_planner_call === "number") &&
                String(span.tags.initiates_planner_call) === "true"
            ) {
                escalations.push(
                    `Device initiated Planner call (possible escalation): ${span.operation_name}`,
                );
            }
        }

        return { violations, escalations };
    }

    /**
     * Estimate where latency is concentrated.
     */
    static getLatencyBreakdown(trace: ExecutionTrace): {
        service_name: string;
        latency_ms: number;
        latency_percent: number;
    }[] {
        const serviceLatencies = new Map<string, number>();

        for (const span of trace.spans) {
            const current = serviceLatencies.get(span.service_name) || 0;
            serviceLatencies.set(span.service_name, current + span.duration_ms);
        }

        const total = trace.total_duration_ms;

        return Array.from(serviceLatencies.entries())
            .map(([name, latency]) => ({
                service_name: name,
                latency_ms: latency,
                latency_percent: Math.round((latency / total) * 100),
            }))
            .sort((a, b) => b.latency_ms - a.latency_ms);
    }

    /**
     * Identify timeout candidates.
     */
    static findTimeoutCandidates(trace: ExecutionTrace): {
        service_name: string;
        operation_name: string;
        duration_ms: number;
    }[] {
        // Spans exceeding 500ms are timeout candidates
        return trace.spans
            .filter((s) => s.duration_ms > 500)
            .map((s) => ({
                service_name: s.service_name,
                operation_name: s.operation_name,
                duration_ms: s.duration_ms,
            }))
            .sort((a, b) => b.duration_ms - a.duration_ms);
    }
}

// ============================================================================
// TRACE EXPORT & FORENSICS
// ============================================================================

export interface TraceExportFormat {
    format: "json" | "csv" | "timeline";
    include_tags: boolean;
    include_logs: boolean;
}

export class TraceExporter {
    /**
     * Export trace as JSON for offline analysis.
     */
    static toJSON(trace: ExecutionTrace): string {
        return JSON.stringify(trace, null, 2);
    }

    /**
     * Export trace as CSV for spreadsheet analysis.
     */
    static toCSV(trace: ExecutionTrace): string {
        const headers = [
            "Span ID",
            "Service",
            "Operation",
            "Duration (ms)",
            "Authority",
            "Status",
            "Error",
        ];

        const rows = trace.spans.map((s) => [
            s.span_id,
            s.service_name,
            s.operation_name,
            s.duration_ms,
            s.authority_level,
            s.status,
            s.error_message || "",
        ]);

        const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join(
            "\n",
        );

        return csv;
    }

    /**
     * Export as human-readable timeline.
     */
    static toTimeline(trace: ExecutionTrace): string {
        let timeline = `╔════════════════════════════════════════════════════════════════════════════════╗\n`;
        timeline += `║ EXECUTION TRACE: ${trace.trace_id.substring(0, 36)}                      ║\n`;
        timeline += `║ Status: ${trace.trace_status.padEnd(72)} ║\n`;
        timeline += `║ Duration: ${trace.total_duration_ms}ms                                                          ║\n`;
        timeline += `╚════════════════════════════════════════════════════════════════════════════════╝\n\n`;

        // Sort spans by start time
        const sortedSpans = trace.spans.slice().sort((a, b) => a.started_at - b.started_at);

        const getIndent = (spanId: string): number => {
            let depth = 0;
            let current = sortedSpans.find((s) => s.span_id === spanId);
            while (current?.parent_span_id) {
                depth += 1;
                current = sortedSpans.find((s) => s.span_id === current?.parent_span_id);
            }
            return depth;
        };

        for (const span of sortedSpans) {
            const indent = "  ".repeat(getIndent(span.span_id));
            const status = span.status === "succeeded" ? "✓" : "✗";
            const sig = span.signature_in_valid
                ? "🔒"
                : span.signature_in_valid === false
                  ? "⚠"
                  : " ";

            timeline += `${indent}${status} ${sig} [${span.service_name}] ${span.operation_name} (${span.duration_ms}ms)\n`;

            if (span.error_message) {
                timeline += `${indent}  ⚠ ERROR: ${span.error_message}\n`;
            }
        }

        return timeline;
    }
}

// ============================================================================
// DASHBOARD DATA EXTRACTION
// ============================================================================

/**
 * Extract trace data formatted for dashboard visualization.
 */
export interface TraceDashboardData {
    trace_id: string;
    status: string;
    total_duration_ms: number;
    timeline: {
        timestamp: number;
        service: string;
        operation: string;
        duration_ms: number;
        status: string;
    }[];
    critical_path: {
        service: string;
        operation: string;
        duration_ms: number;
    }[];
    authority_transitions: {
        from: AuthorityLevel;
        to: AuthorityLevel;
        at_timestamp: number;
        signature_valid?: boolean;
    }[];
    anomalies: string[];
    signature_chain_valid: boolean;
}

export function extractDashboardData(trace: ExecutionTrace): TraceDashboardData {
    const analyzer = TraceAnalyzer;
    const signatureChain = analyzer.verifySignatureChain(trace);
    const latencyBreakdown = analyzer.getLatencyBreakdown(trace);
    const authorityBoundaries = analyzer.checkAuthorityBoundaries(trace);

    // Build critical path (longest chain of dependent spans)
    const criticalPath = latencyBreakdown
        .slice(0, 3) // top 3 slowest services
        .map((item) => ({
            service: item.service_name,
            operation:
                trace.spans.find((s) => s.service_name === item.service_name)?.operation_name ||
                "unknown",
            duration_ms: item.latency_ms,
        }));

    // Extract authority transitions
    const transitions: TraceDashboardData["authority_transitions"] = [];
    for (let i = 0; i < trace.authority_path.length - 1; i++) {
        const from = trace.authority_path[i];
        const to = trace.authority_path[i + 1];
        const transitionSpan = trace.spans.find((s) => {
            const authorityTransition = s.tags.authority_transition;
            return (
                typeof authorityTransition === "string" &&
                authorityTransition.includes(`${from}:to:${to}`)
            );
        });

        transitions.push({
            from,
            to,
            at_timestamp: transitionSpan?.started_at || 0,
            signature_valid: transitionSpan?.signature_out_created,
        });
    }

    return {
        trace_id: trace.trace_id,
        status: trace.trace_status,
        total_duration_ms: trace.total_duration_ms,
        timeline: trace.spans
            .sort((a, b) => a.started_at - b.started_at)
            .map((s) => ({
                timestamp: s.started_at,
                service: s.service_name,
                operation: s.operation_name,
                duration_ms: s.duration_ms,
                status: s.status,
            })),
        critical_path: criticalPath,
        authority_transitions: transitions,
        anomalies: [
            ...authorityBoundaries.violations,
            ...authorityBoundaries.escalations,
            ...signatureChain.problems,
        ],
        signature_chain_valid: signatureChain.valid,
    };
}
