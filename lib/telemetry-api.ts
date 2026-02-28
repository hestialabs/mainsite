/**
 * HESTIA Labs - Telemetry API & Query Layer
 *
 * High-level API for dashboard and operational tools.
 * Integrates all telemetry components: types, alerts, traces, storage.
 */

import {
    TelemetryEvent,
    FleetHealthSnapshot,
    HomeHealthDetails,
    ExecutionTrace,
    AnomalyType,
} from "./telemetry-types";
import { Alert, AlertingEngine, ALL_ALERT_RULES } from "./alerts";
import { TraceExplorer, TraceAnalyzer, extractDashboardData } from "./trace-explorer";

// ============================================================================
// TELEMETRY QUERY API
// ============================================================================

export interface TelemetryQueryOptions {
    home_id?: string;
    device_id?: string;
    time_range?: {
        start_ms: number;
        end_ms: number;
    };
    event_classes?: string[];
    severity?: "critical" | "warning" | "info";
    limit?: number;
}

/**
 * Main telemetry API for dashboard and external consumers.
 */
export class TelemetryAPI {
    private alertingEngine: AlertingEngine;
    private traceExplorer: TraceExplorer;
    private timescaleConnection: any;

    constructor(
        timescaleConnection?: any,
        private jaegerUrl: string = "http://localhost:16686",
    ) {
        this.timescaleConnection = timescaleConnection;
        this.alertingEngine = new AlertingEngine(ALL_ALERT_RULES);
        this.traceExplorer = new TraceExplorer(this.jaegerUrl);
    }

    // ========================================================================
    // FLEET HEALTH QUERIES
    // ========================================================================

    /**
     * Get real-time fleet health snapshot.
     */
    async getFleetHealth(): Promise<FleetHealthSnapshot> {
        // TODO: Query TimescaleDB for aggregated metrics
        return {
            timestamp: Date.now(),
            homes_total: 0,
            homes_healthy: 0,
            homes_degraded: 0,
            homes_offline: 0,
            devices_total: 0,
            devices_online: 0,
            devices_offline: 0,
            devices_in_error_state: 0,
            average_latency_ms: 0,
            p95_latency_ms: 0,
            p99_latency_ms: 0,
            error_rate_percent: 0,
            certificate_warnings: 0,
            unverified_signatures: 0,
            replay_anomalies_detected: 0,
            authority_violations: 0,
            cloud_service_errors: 0,
            edge_node_errors: 0,
            mqtt_broker_unavailable: false,
            updates_in_progress: 0,
            update_failures: 0,
            update_rollbacks: 0,
        };
    }

    /**
     * Get per-home health details.
     */
    async getHomeHealth(homeId: string): Promise<HomeHealthDetails> {
        // TODO: Query TimescaleDB for home-specific metrics
        return {
            home_id: homeId,
            last_updated: Date.now(),
            device_count: 0,
            devices: [],
            recent_errors: [],
            certificates_ok: 0,
            certificates_expiring_soon: 0,
            certificates_expired: 0,
            commands_executed_24h: 0,
            command_success_rate_percent: 0,
            average_command_latency_ms: 0,
            commands_requiring_safety: 0,
            safety_approvals: 0,
            safety_rejections: 0,
            safety_approval_rate_percent: 0,
            current_firmware_version: "",
            devices_on_target_version: 0,
            devices_updating: 0,
            devices_failed_update: 0,
            average_rssi_dbm: 0,
            mqtt_connection_stable: true,
            reconnection_events_24h: 0,
            active_anomalies: [],
        };
    }

    // ========================================================================
    // ALERT QUERIES
    // ========================================================================

    /**
     * Get active alerts with optional filtering.
     */
    async getActiveAlerts(options?: {
        severity?: "critical" | "warning" | "info";
        home_id?: string;
        rule_type?: string;
    }): Promise<Alert[]> {
        const alerts = this.alertingEngine.getActiveAlerts();

        return alerts.filter((a) => {
            if (options?.severity && a.severity !== options.severity) return false;
            if (options?.home_id && a.home_id !== options.home_id) return false;
            // Filter by other criteria
            return true;
        });
    }

    /**
     * Get alert history (resolved alerts).
     */
    async getAlertHistory(options?: {
        time_range?: { start_ms: number; end_ms: number };
        home_id?: string;
        limit?: number;
    }): Promise<Alert[]> {
        // Build SQL query using options
        const queryParams = {
            limit: options?.limit ?? 100,
            homeId: options?.home_id,
            startTime: options?.time_range?.start_ms,
            endTime: options?.time_range?.end_ms,
        };

        // Log query params for debugging
        const queryString = Object.entries(queryParams)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => `${k}=${v}`)
            .join("&");

        // Placeholder: would query TimescaleDB with these params
        // SQL example: SELECT * FROM alerts WHERE home_id = $1 LIMIT $2
        if (!this.timescaleConnection) {
            console.warn(`Alert history query: ${queryString} - TimescaleDB not configured`);
        }

        return [];
    }

    /**
     * Resolve an alert.
     */
    async resolveAlert(alertId: string): Promise<void> {
        this.alertingEngine.resolveAlert(alertId);
    }

    // ========================================================================
    // TRACE & FORENSICS QUERIES
    // ========================================================================

    /**
     * Get execution trace for incident investigation.
     */
    async getTrace(traceId: string): Promise<ExecutionTrace> {
        return this.traceExplorer.getTrace(traceId);
    }

    /**
     * Query traces by criteria (for investigation).
     */
    async queryTraces(options: {
        home_id?: string;
        command_id?: string;
        device_id?: string;
        status?: "success" | "partial_failure" | "failure";
        time_range?: { start_ms: number; end_ms: number };
        min_duration_ms?: number;
    }) {
        return this.traceExplorer.queryTraces(options);
    }

    /**
     * Analyze trace for latency/bottlenecks.
     */
    async analyzeTrace(traceId: string) {
        const trace = await this.getTrace(traceId);

        return {
            trace_id: traceId,
            slowest_service: TraceAnalyzer.findSlowestService(trace),
            signature_chain: TraceAnalyzer.verifySignatureChain(trace),
            authority_boundaries: TraceAnalyzer.checkAuthorityBoundaries(trace),
            latency_breakdown: TraceAnalyzer.getLatencyBreakdown(trace),
            timeout_candidates: TraceAnalyzer.findTimeoutCandidates(trace),
            dashboard_data: extractDashboardData(trace),
        };
    }

    // ========================================================================
    // SECURITY QUERIES
    // ========================================================================

    /**
     * Get security anomalies in time range.
     */
    async getSecurityAnomalies(options?: {
        time_range?: { start_ms: number; end_ms: number };
        anomaly_types?: AnomalyType[];
        home_id?: string;
        risk_level?: "low" | "medium" | "high" | "critical";
    }): Promise<TelemetryEvent[]> {
        // Build query with all filter parameters
        const queryBuilder = {
            timeRange: options?.time_range
                ? `[${options.time_range.start_ms}, ${options.time_range.end_ms}]`
                : null,
            anomalyTypes: options?.anomaly_types?.join(",") || null,
            homeId: options?.home_id || null,
            riskLevel: options?.risk_level || null,
        };

        // Filter out null values for cleaner query
        const appliedFilters = Object.entries(queryBuilder)
            .filter(([, v]) => v !== null)
            .map(([k, v]) => `${k}:${v}`);

        // Log applied filters for query tracing
        if (appliedFilters.length > 0) {
            console.debug(`Security anomaly query with filters: ${appliedFilters.join(", ")}`);
        }

        // TODO: Query security_anomaly events from TimescaleDB
        // Would execute: SELECT * FROM security_anomalies WHERE ... appliedFilters
        if (!this.timescaleConnection) {
            console.warn("TimescaleDB connection not configured for anomaly query");
        }

        return [];
    }

    /**
     * Get certificate threat status.
     */
    async getCertificateThreats(): Promise<{
        expiring_soon: Array<{
            home_id: string;
            device_id: string;
            days_until_expiry: number;
            certificate_role: string;
        }>;
        already_expired: Array<{
            home_id: string;
            device_id: string;
            certificate_role: string;
        }>;
        revoked: Array<{
            home_id: string;
            device_id: string;
            revoked_at: number;
        }>;
    }> {
        // TODO: Query certificate_lifecycle events
        return {
            expiring_soon: [],
            already_expired: [],
            revoked: [],
        };
    }

    /**
     * Get replay attack observations.
     */
    async getReplayObservations(options?: {
        time_range?: { start_ms: number; end_ms: number };
        risk_level?: "low" | "medium" | "high" | "critical";
    }): Promise<{
        high_confidence_attacks: number;
        affected_devices: string[];
        affected_homes: string[];
        recommended_actions: string[];
    }> {
        // Use risk level and time range to filter events
        const minRiskLevel = options?.risk_level ?? "critical";
        const timeRange = options?.time_range;

        // Build WHERE clause: risk_level >= $1 AND timestamp BETWEEN $2 AND $3
        const whereConditions = [
            `risk_level >= '${minRiskLevel}'`,
            ...(timeRange
                ? [`timestamp >= ${timeRange.start_ms}`, `timestamp <= ${timeRange.end_ms}`]
                : []),
        ];

        // Log WHERE clause for query tracing
        console.debug(`Replay anomaly query WHERE: ${whereConditions.join(" AND ")}`);

        // TODO: Query replay_protection events and aggregate results
        if (!this.timescaleConnection) {
            console.warn("TimescaleDB connection not configured for replay analysis");
        }

        return {
            high_confidence_attacks: 0,
            affected_devices: [],
            affected_homes: [],
            recommended_actions: [],
        };
    }

    // ========================================================================
    // OTA QUERIES
    // ========================================================================

    /**
     * Get OTA rollout status and health.
     */
    async getOTARolloutStatus(rolloutId?: string) {
        // Build WHERE clause based on rolloutId
        const whereClause = rolloutId
            ? `WHERE rollout_id = '${rolloutId}'`
            : `WHERE status = 'active'`;

        // Log query for debugging
        console.debug(`OTA rollout query: SELECT * FROM ota_deployments ${whereClause}`);

        // TODO: Execute SQL: SELECT * FROM ota_deployments ${whereClause}
        if (!this.timescaleConnection) {
            console.warn("TimescaleDB connection not configured for OTA status query");
        }

        return {
            active_rollouts: [],
            failed_rollouts: [],
            rollback_rate_percent: 0,
            devices_updating: 0,
            devices_failed: 0,
        };
    }

    /**
     * Get OTA failure analysis.
     */
    async getOTAFailures(options?: {
        time_range?: { start_ms: number; end_ms: number };
        failure_mode?: string;
    }) {
        // Build WHERE clause with filters
        const conditions: string[] = ["event_type = 'failure'"];
        if (options?.failure_mode) {
            conditions.push(`failure_mode = '${options.failure_mode}'`);
        }
        if (options?.time_range) {
            conditions.push(
                `timestamp BETWEEN ${options.time_range.start_ms} AND ${options.time_range.end_ms}`,
            );
        }

        // TODO: Query OTA events and group by failure_mode
        if (!this.timescaleConnection) {
            console.warn("TimescaleDB connection not configured for OTA failure analysis");
        }

        return {
            total_failures: 0,
            by_failure_mode: {} as Record<string, number>,
            affected_devices: [] as string[],
            recommendations: [] as string[],
        };
    }

    // ========================================================================
    // INFRASTRUCTURE QUERIES
    // ========================================================================

    /**
     * Get cloud service health metrics.
     */
    async getCloudServiceHealth(serviceName?: string) {
        // TODO: Query cloud_service metrics from TimescaleDB
        return {
            service_name: serviceName || "all",
            healthy_instances: 0,
            degraded_instances: 0,
            error_rate_percent: 0,
            latency_p95_ms: 0,
            latency_p99_ms: 0,
            critical_errors: [] as string[],
        };
    }

    /**
     * Get edge node status.
     */
    async getEdgeNodeStatus() {
        // TODO: Query edge_resource metrics
        return {
            total_nodes: 0,
            healthy_nodes: 0,
            resource_constrained: [] as string[],
            anomalies_detected: [] as string[],
        };
    }

    // ========================================================================
    // SLO & PERFORMANCE QUERIES
    // ========================================================================

    /**
     * Get SLO compliance metrics.
     */
    async getSLOCompliance() {
        // TODO: Query command latency and error rate metrics
        return {
            command_latency_slo: {
                target_p99_ms: 2000,
                actual_p99_ms: 0,
                compliant: true,
            },
            command_success_slo: {
                target_percent: 99.5,
                actual_percent: 0,
                compliant: true,
            },
            safety_approval_slo: {
                target_percent: 95,
                actual_percent: 0,
                compliant: true,
            },
            certificate_renewal_slo: {
                target_expiry_notice_days: 30,
                actual_expiring_count: 0,
                compliant: true,
            },
        };
    }

    /**
     * Get latency percentiles for time range.
     */
    async getLatencyPercentiles(options?: {
        home_id?: string;
        time_range?: { start_ms: number; end_ms: number };
    }) {
        // Build WHERE clause for filtering
        const filters: string[] = [];
        if (options?.home_id) {
            filters.push(`home_id = '${options.home_id}'`);
        }
        if (options?.time_range) {
            filters.push(
                `timestamp >= ${options.time_range.start_ms} AND timestamp <= ${options.time_range.end_ms}`,
            );
        }

        // TODO: Query command execution latencies: SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency) FROM commands WHERE ${filters.join(' AND ')}
        return {
            p50_ms: 0,
            p75_ms: 0,
            p95_ms: 0,
            p99_ms: 0,
            p999_ms: 0,
            max_ms: 0,
        };
    }

    // ========================================================================
    // AGGREGATED STATS QUERIES
    // ========================================================================

    /**
     * Get daily statistics summary.
     */
    async getDailyStats(date: string) {
        // date format: "2026-02-21"
        return {
            date,
            commands_executed: 0,
            command_success_rate_percent: 0,
            safety_decisions_made: 0,
            safety_approval_rate_percent: 0,
            replay_anomalies_detected: 0,
            certificates_renewed: 0,
            ota_updates_deployed: 0,
            ota_update_failures: 0,
            critical_alerts: 0,
            resolved_alerts: 0,
            homes_affected_by_incidents: 0,
        };
    }

    /**
     * Get trend data (for charting).
     */
    async getTrendData(
        metric: string,
        options?: {
            time_range?: { start_ms: number; end_ms: number };
            granularity?: "hourly" | "daily";
        },
    ) {
        // Validate metric parameter and use options for time filtering
        const supportedMetrics = ["latency", "error_rate", "throughput"];
        if (!supportedMetrics.includes(metric)) {
            console.warn(`Unsupported metric: ${metric}`);
        }

        const granularity = options?.granularity ?? "hourly";
        const timeRange = options?.time_range;

        // Log the query for debugging
        console.debug(
            `Trend query: metric='${metric}' granularity='${granularity}' range=[${timeRange?.start_ms}, ${timeRange?.end_ms}]`,
        );

        // TODO: Query time-series data and return bucketed results
        return [] as Array<{ timestamp: number; value: number }>;
    }

    // ========================================================================
    // EXPORT & REPORTING
    // ========================================================================

    /**
     * Export trace as JSON for offline analysis.
     */
    async exportTrace(traceId: string) {
        const trace = await this.getTrace(traceId);
        return trace; // Return full trace data
    }

    /**
     * Generate incident report.
     */
    async generateIncidentReport(options: {
        time_range: { start_ms: number; end_ms: number };
        incident_type: string; // "ota_failure", "latency_spike", "security_event"
    }) {
        const alerts = await this.getAlertHistory(options);
        const anomalies = await this.getSecurityAnomalies(options);

        // Correlate alerts and anomalies to build incident picture
        const totalIncidents = alerts.length + anomalies.length;
        const affectedHomes = new Set([
            ...(alerts.map((a) => a.home_id).filter(Boolean) as string[]),
            ...(anomalies.map((a: any) => a.home_id).filter(Boolean) as string[]),
        ]);

        return {
            incident_period: options.time_range,
            incident_type: options.incident_type,
            total_events: totalIncidents,
            affected_homes: Array.from(affectedHomes),
            root_cause: alerts.length > 0 ? alerts[0].title : "Unknown",
            timeline: [
                ...alerts.map((a) => ({ timestamp: a.detected_at, event: `Alert: ${a.title}` })),
                ...anomalies.map((a: any) => ({
                    timestamp: a.wall_clock_timestamp,
                    event: `Anomaly detected`,
                })),
            ].sort((a, b) => b.timestamp - a.timestamp),
            recommendations: alerts.length > 0 ? alerts[0].recommended_actions.slice(0, 3) : [],
            remediation_status: "pending" as "pending" | "in_progress" | "resolved",
        };
    }
}

// ============================================================================
// QUERY BUILDER HELPERS
// ============================================================================

/**
 * Fluent query builder for complex telemetry queries.
 */
export class TelemetryQueryBuilder {
    private options: TelemetryQueryOptions = {};

    forHome(homeId: string): this {
        this.options.home_id = homeId;
        return this;
    }

    forDevice(deviceId: string): this {
        this.options.device_id = deviceId;
        return this;
    }

    inTimeRange(startMs: number, endMs: number): this {
        this.options.time_range = { start_ms: startMs, end_ms: endMs };
        return this;
    }

    withEventClasses(...classes: string[]): this {
        this.options.event_classes = classes;
        return this;
    }

    withSeverity(severity: "critical" | "warning" | "info"): this {
        this.options.severity = severity;
        return this;
    }

    limit(n: number): this {
        this.options.limit = n;
        return this;
    }

    build(): TelemetryQueryOptions {
        return this.options;
    }
}

// ============================================================================
// SINGLETON API INSTANCE
// ============================================================================

let apiInstance: TelemetryAPI | null = null;

export function initializeTelemetryAPI(
    timescaleConnection?: any,
    jaegerUrl?: string,
): TelemetryAPI {
    if (!apiInstance) {
        apiInstance = new TelemetryAPI(timescaleConnection, jaegerUrl);
    }
    return apiInstance;
}

export function getTelemetryAPI(): TelemetryAPI {
    if (!apiInstance) {
        throw new Error("TelemetryAPI not initialized. Call initializeTelemetryAPI first.");
    }
    return apiInstance;
}

// ============================================================================
// DASHBOARD DATA PROVIDERS (for React hooks)
// ============================================================================

/**
 * React hook for fleet health data.
 */
export async function useFleetHealth() {
    const api = getTelemetryAPI();
    return api.getFleetHealth();
}

/**
 * React hook for alerts data.
 */
export async function useActiveAlerts(options?: {
    severity?: "critical" | "warning" | "info";
    home_id?: string;
    rule_type?: string;
}) {
    const api = getTelemetryAPI();
    return api.getActiveAlerts(options);
}

/**
 * React hook for home health details.
 */
export async function useHomeHealth(homeId: string) {
    const api = getTelemetryAPI();
    return api.getHomeHealth(homeId);
}

/**
 * React hook for trace analysis.
 */
export async function useTrace(traceId: string) {
    const api = getTelemetryAPI();
    return api.analyzeTrace(traceId);
}
