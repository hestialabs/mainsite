/**
 * HESTIA Labs - Alerting Rules Engine
 * Production-grade alert rule evaluation for 30-day monitoring phase
 *
 * Supports:
 * - Critical security alerts (replay, authority bypass, certificate issues)
 * - SLO breach detection (latency, error rate)
 * - Anomaly correlation (coordinated attacks across homes)
 * - Alert deduplication and grouping
 * - Severity escalation
 */

import {
    TelemetryEvent,
    SeverityLevel,
    CommandExecutionEvent,
    SafetyCountersignatureEvent,
    ReplayProtectionEvent,
    CertificateLifecycleEvent,
    OTADeploymentEvent,
    MQTTSessionMetric,
} from "./telemetry-types";

// ============================================================================
// ALERT RULE DEFINITIONS
// ============================================================================

export type AlertingRuleType =
    | "security_event"
    | "slo_breach"
    | "health_degradation"
    | "fleet_wide_anomaly"
    | "certification_issue"
    | "infrastructure_failure";

export interface AlertingRule {
    rule_id: string;
    rule_name: string;
    rule_type: AlertingRuleType;
    enabled: boolean;
    severity: SeverityLevel;

    // Evaluation
    eval_window_seconds: number; // time window for aggregation
    eval_frequency_seconds: number; // how often to evaluate
    threshold: number | string; // numeric or condition string

    // Conditions
    condition: (events: TelemetryEvent[], context: AlertContext) => boolean;

    // Alert generation
    create_alert: (events: TelemetryEvent[], context: AlertContext) => Alert;

    // Deduplication
    dedup_key_fn: (alert: Alert) => string;
    dedup_window_seconds: number;

    // Escalation
    escalate_after_seconds?: number; // escalate if not resolved
    escalation_severity?: SeverityLevel;
    notification_channels: ("pagerduty" | "slack" | "email" | "sms")[];
}

export interface AlertContext {
    current_time: number;
    home_id: string;
    fleet_size: number;
    baseline_metrics?: Record<string, number>;
}

export interface Alert {
    alert_id: string;
    rule_id: string;
    rule_name: string;
    severity: SeverityLevel;

    // Context
    home_id?: string;
    device_id?: string;
    affected_resources: string[];

    // Timing
    detected_at: number;
    resolved_at?: number;
    duration_seconds?: number;

    // Status
    status: "active" | "resolved" | "escalated" | "silenced";

    // Details
    title: string;
    description: string;
    impact: string; // user-facing impact description

    // Evidence
    evidence: {
        event_count: number;
        first_event_timestamp: number;
        last_event_timestamp: number;
        sample_event_ids: string[];
    };

    // Recommended actions
    recommended_actions: string[];

    // Dedup key for grouping
    dedup_key: string;

    // Correlation
    correlated_with?: string[]; // other alert IDs
}

// ============================================================================
// ALERT RULES: SECURITY EVENTS (CRITICAL)
// ============================================================================

export const ALERT_RULE_REPLAY_ATTACK_PROBABLE: AlertingRule = {
    rule_id: "security_replay_attack_probable",
    rule_name: "Probable Replay Attack Detected",
    rule_type: "security_event",
    enabled: true,
    severity: "critical",
    notification_channels: ["pagerduty", "slack", "sms"],

    eval_window_seconds: 60,
    eval_frequency_seconds: 10,
    threshold: "risk_level == 'critical' AND confidence_score > 0.95",

    condition: (events, ctx) => {
        const replayEvents = events.filter(
            (e): e is ReplayProtectionEvent => e.event_class === "replay_protection",
        );
        const criticalEvents = replayEvents.filter(
            (e) => e.risk_level === "critical" && e.confidence_score > 0.95,
        );
        // Filter to recent events within context time window (60 sec)
        return criticalEvents.some((e) => ctx.current_time - e.wall_clock_timestamp < 60000);
    },

    create_alert: (events, ctx) => {
        const replayEvents = events.filter(
            (e): e is ReplayProtectionEvent => e.event_class === "replay_protection",
        );
        const critical = replayEvents.find(
            (e) => e.risk_level === "critical" && e.confidence_score > 0.95,
        );

        return {
            alert_id: generateAlertId(),
            rule_id: "security_replay_attack_probable",
            rule_name: "Probable Replay Attack Detected",
            severity: "critical",
            home_id: critical?.home_id,
            device_id: critical?.device_id || undefined,
            affected_resources: [critical?.device_id || "unknown"].filter(Boolean),
            detected_at: critical?.wall_clock_timestamp || ctx.current_time,
            status: "active",
            title: "Replay Attack Probability High",
            description: `Device ${critical?.device_id} shows high-confidence replay attack indicators. Detection method: ${critical?.detection_method}. Risk factors: ${critical?.risk_factors?.join(", ")}.`,
            impact: "Potential unauthorized command execution or privilege escalation.",
            evidence: {
                event_count: replayEvents.length,
                first_event_timestamp: Math.min(...replayEvents.map((e) => e.wall_clock_timestamp)),
                last_event_timestamp: Math.max(...replayEvents.map((e) => e.wall_clock_timestamp)),
                sample_event_ids: replayEvents.slice(0, 3).map((e) => e.trace_id),
            },
            recommended_actions: [
                "Isolate device immediately",
                "Revoke device certificate",
                "Review command history for last 24 hours",
                "Check device time sync (clock skew)",
                "Investigate MQTT broker logs for tampering",
            ],
            dedup_key: `replay_${critical?.device_id}_${Math.floor(critical!.wall_clock_timestamp / 60000)}`,
            notification_channels: ["pagerduty", "slack", "sms"],
        };
    },

    dedup_key_fn: (alert) => `replay_${alert.device_id}_${Math.floor(alert.detected_at / 60000)}`,
    dedup_window_seconds: 300, // 5 min window for dedup
};

export const ALERT_RULE_AUTHORITY_BOUNDARY_BYPASS: AlertingRule = {
    rule_id: "security_authority_bypass",
    rule_name: "Authority Boundary Bypass Attempt",
    rule_type: "security_event",
    enabled: true,
    severity: "critical",
    notification_channels: ["pagerduty", "sms"],

    eval_window_seconds: 10,
    eval_frequency_seconds: 5,
    threshold: "boundary_violated == true",

    condition: (events, ctx) => {
        const violations = events.filter((e) => {
            if (e.event_class === "authority_transition") {
                const isViolation = (e as any).boundary_violated === true;
                // Filter by home_id if context specifies it
                const isRelevant = !ctx.home_id || (e as any).home_id === ctx.home_id;
                return isViolation && isRelevant;
            }
            return false;
        });
        return violations.length > 0;
    },

    create_alert: (events, ctx) => {
        const violations = events.filter((e) => {
            if (e.event_class === "authority_transition") {
                return (e as any).boundary_violated === true;
            }
            return false;
        });

        const first = violations[0] as any;
        // Validate violation is within the execution context (same home)
        const contextHomeId = ctx.home_id;
        const isContextRelevant = !contextHomeId || first.home_id === contextHomeId;

        // Include context validation note in description if alert is cross-context
        const contextNote = !isContextRelevant
            ? ` [NOTE: This violation occurred in home ${first.home_id}, evaluated in context ${contextHomeId}]`
            : "";

        return {
            alert_id: generateAlertId(),
            rule_id: "security_authority_bypass",
            rule_name: "Authority Boundary Bypass Attempt",
            severity: "critical",
            home_id: first.home_id,
            device_id: first.device_id || undefined,
            affected_resources: [first.device_id || "unknown"].filter(Boolean),
            detected_at: first.wall_clock_timestamp,
            status: "active",
            title: "CRITICAL: Authority Boundary Override",
            description: `Authority ${first.from_authority} attempted to exceed boundary constraint: "${first.boundary_constraint}". Violation detail: ${first.boundary_violation_detail}${contextNote}`,
            impact: "Unauthorized privilege escalation detected. Device may have executed commands outside safe scope.",
            evidence: {
                event_count: violations.length,
                first_event_timestamp: Math.min(
                    ...violations.map((e) => (e as any).wall_clock_timestamp),
                ),
                last_event_timestamp: Math.max(
                    ...violations.map((e) => (e as any).wall_clock_timestamp),
                ),
                sample_event_ids: violations.map((e) => (e as any).trace_id),
            },
            recommended_actions: [
                "IMMEDIATE: Halt all commands to device",
                "Revoke device authority permissions",
                "Audit command history pre-incident",
                "Review Safety service decision logs",
                "Contact incident response team",
            ],
            dedup_key: `bypass_${first.device_id}_${first.home_id}`,
            notification_channels: ["pagerduty", "sms"], // skip slack for speed
        };
    },

    dedup_key_fn: (alert) => `bypass_${alert.device_id}_${alert.home_id}`,
    dedup_window_seconds: 600, // 10 min for authority bypass (no fast repeat)
};

export const ALERT_RULE_CERTIFICATE_EXPIRY_24H: AlertingRule = {
    rule_id: "cert_expiry_24h",
    rule_name: "Certificate Expiring in 24 Hours",
    rule_type: "certification_issue",
    enabled: true,
    severity: "critical",
    notification_channels: ["pagerduty", "slack", "email"],

    eval_window_seconds: 3600, // 1 hour window
    eval_frequency_seconds: 300, // check every 5 min
    threshold: "days_until_expiry < 1",

    condition: (events, ctx) => {
        const certEvents = events.filter(
            (e): e is CertificateLifecycleEvent => e.event_class === "certificate_lifecycle",
        );
        // Filter events by home_id if specified in context
        const relevantEvents = certEvents.filter((e) => !ctx.home_id || e.home_id === ctx.home_id);
        return relevantEvents.some((e) => e.days_until_expiry < 1);
    },

    create_alert: (events, ctx) => {
        const certEvents = events.filter(
            (e): e is CertificateLifecycleEvent => e.event_class === "certificate_lifecycle",
        );
        const expiring = certEvents.filter((e) => e.days_until_expiry < 1);

        return {
            alert_id: generateAlertId(),
            rule_id: "cert_expiry_24h",
            rule_name: "Certificate Expiring in 24 Hours",
            severity: "critical",
            home_id: expiring[0]?.home_id,
            device_id: expiring[0]?.device_id || undefined,
            affected_resources: [...new Set(expiring.map((e) => e.device_id || e.common_name))],
            detected_at: ctx.current_time,
            status: "active",
            title: `${expiring.length} Certificate(s) Expiring Soon`,
            description: `${expiring.map((e) => `${e.common_name} (expires in ${e.days_until_expiry} days)`).join(", ")}`,
            impact: "Device will lose mTLS connectivity upon expiration. Commands will be rejected.",
            evidence: {
                event_count: expiring.length,
                first_event_timestamp: Math.min(...expiring.map((e) => e.wall_clock_timestamp)),
                last_event_timestamp: Math.max(...expiring.map((e) => e.wall_clock_timestamp)),
                sample_event_ids: expiring.map((e) => e.trace_id),
            },
            recommended_actions: [
                "Trigger certificate renewal immediately",
                "Verify renewal service connectivity",
                "Monitor device connectivity for next 24h",
                "Prepare rollback plan if renewal fails",
            ],
            dedup_key: `cert_expiry_${expiring[0]?.device_id}`,
            notification_channels: ["pagerduty", "slack", "email"], // give 24h warning
        };
    },

    dedup_key_fn: (alert) => `cert_expiry_${alert.device_id}`,
    dedup_window_seconds: 3600, // re-alert every hour if not resolved
};

// ============================================================================
// ALERT RULES: SLO BREACHES
// ============================================================================

export const ALERT_RULE_LATENCY_P99_BREACH: AlertingRule = {
    rule_id: "slo_latency_p99_breach",
    rule_name: "Command Latency P99 SLO Breach",
    rule_type: "slo_breach",
    enabled: true,
    severity: "warning",
    notification_channels: ["slack", "pagerduty"],

    eval_window_seconds: 600, // 10 min window
    eval_frequency_seconds: 60,
    threshold: "latency_p99_ms > 2000",

    condition: (events, ctx) => {
        const cmdEvents = events.filter(
            (e): e is CommandExecutionEvent => e.event_class === "command_execution",
        );

        if (cmdEvents.length < 10) return false; // need sample size

        // Filter to recent events relative to context timestamp
        const recentThreshold = ctx.current_time - (ctx.baseline_metrics?.eval_window_ms || 600000);
        const relevantEvents = cmdEvents.filter((e) => e.submitted_timestamp > recentThreshold);

        if (relevantEvents.length < 10) return false;

        const latencies = relevantEvents
            .filter((e) => e.total_latency_ms !== undefined)
            .map((e) => e.total_latency_ms!);

        if (latencies.length === 0) return false;

        const p99 = percentile(latencies, 0.99);
        return p99 > 2000;
    },

    create_alert: (events, ctx) => {
        const cmdEvents = events.filter(
            (e): e is CommandExecutionEvent => e.event_class === "command_execution",
        );
        const latencies = cmdEvents
            .filter((e) => e.total_latency_ms !== undefined)
            .map((e) => e.total_latency_ms!);

        const p99 = percentile(latencies, 0.99);
        const p95 = percentile(latencies, 0.95);
        const median = percentile(latencies, 0.5);

        return {
            alert_id: generateAlertId(),
            rule_id: "slo_latency_p99_breach",
            rule_name: "Command Latency P99 SLO Breach",
            severity: "warning",
            home_id: ctx.home_id,
            affected_resources: [],
            detected_at: ctx.current_time,
            status: "active" as const,
            title: `Latency P99: ${Math.round(p99)}ms (SLO: 2000ms)`,
            description: `P99 latency breach in window (p50: ${Math.round(median)}ms, p95: ${Math.round(p95)}ms, p99: ${Math.round(p99)}ms). Sample size: ${latencies.length} commands.`,
            impact: "User commands experiencing degraded latency. May indicate infrastructure bottleneck (Safety service, planner, or MQTT broker).",
            evidence: {
                event_count: latencies.length,
                first_event_timestamp: Math.min(...cmdEvents.map((e) => e.submitted_timestamp)),
                last_event_timestamp: Math.max(...cmdEvents.map((e) => e.submitted_timestamp)),
                sample_event_ids: cmdEvents.slice(0, 5).map((e) => e.trace_id),
            },
            recommended_actions: [
                "Check Safety service latency (is it slow?)",
                "Check Planner service resource utilization",
                "Verify MQTT broker message throughput",
                "Check network latency to brokers",
                "Consider scaling Safety service if sustained",
            ],
            dedup_key: `latency_p99_${ctx.home_id}_${Math.floor(ctx.current_time / 600000)}`,
            notification_channels: ["slack", "pagerduty"],
        };
    },

    dedup_key_fn: (alert) =>
        `latency_p99_${alert.home_id}_${Math.floor(alert.detected_at / 600000)}`,
    dedup_window_seconds: 300,
};

export const ALERT_RULE_COMMAND_REJECTION_SPIKE: AlertingRule = {
    rule_id: "slo_command_rejection_spike",
    rule_name: "Command Rejection Rate Spike",
    rule_type: "slo_breach",
    enabled: true,
    severity: "warning",
    notification_channels: ["slack"],

    eval_window_seconds: 300, // 5 min
    eval_frequency_seconds: 60,
    threshold: "rejection_rate > 20% for 5 min",

    condition: (events, ctx) => {
        const cmdEvents = events.filter(
            (e): e is CommandExecutionEvent => e.event_class === "command_execution",
        );

        if (cmdEvents.length < 10) return false;

        // Filter events by home context if specified
        const relevantEvents = cmdEvents.filter((e) => !ctx.home_id || e.home_id === ctx.home_id);

        if (relevantEvents.length < 10) return false;

        const rejections = relevantEvents.filter((e) => e.status === "rejected").length;
        const rejectionRate = rejections / relevantEvents.length;

        return rejectionRate > 0.2; // 20%
    },

    create_alert: (events, ctx) => {
        const cmdEvents = events.filter(
            (e): e is CommandExecutionEvent => e.event_class === "command_execution",
        );
        const rejected = cmdEvents.filter((e) => e.status === "rejected");
        const rejectionRate = (rejected.length / cmdEvents.length) * 100;

        // Group rejection reasons
        const reasonCounts = rejected.reduce(
            (acc, e) => {
                acc[e.reject_reason || "unknown"] = (acc[e.reject_reason || "unknown"] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        return {
            alert_id: generateAlertId(),
            rule_id: "slo_command_rejection_spike",
            rule_name: "Command Rejection Rate Spike",
            severity: "warning",
            home_id: ctx.home_id,
            affected_resources: [],
            detected_at: ctx.current_time,
            status: "active" as const,
            title: `Command Rejection Rate: ${rejectionRate.toFixed(1)}% (threshold: 20%)`,
            description: `${rejected.length} rejections out of ${cmdEvents.length} commands. Top reasons: ${Object.entries(
                reasonCounts,
            )
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([reason, count]) => `${reason} (${count})`)
                .join(", ")}.`,
            impact: "Users experiencing high command failure rate. May indicate Safety service misconfiguration or device offline state.",
            evidence: {
                event_count: cmdEvents.length,
                first_event_timestamp: Math.min(...cmdEvents.map((e) => e.submitted_timestamp)),
                last_event_timestamp: Math.max(...cmdEvents.map((e) => e.submitted_timestamp)),
                sample_event_ids: rejected.slice(0, 5).map((e) => e.trace_id),
            },
            recommended_actions: [
                "Check device connectivity status",
                "Review Safety service decision logs",
                "Check rate limit configuration",
                "Verify device authority boundaries are correct",
            ],
            dedup_key: `rejection_spike_${ctx.home_id}_${Math.floor(ctx.current_time / 300000)}`,
            notification_channels: ["slack"],
        };
    },

    dedup_key_fn: (alert) =>
        `rejection_spike_${alert.home_id}_${Math.floor(alert.detected_at / 300000)}`,
    dedup_window_seconds: 600,
};

export const ALERT_RULE_OTA_ROLLBACK_RATE: AlertingRule = {
    rule_id: "infra_ota_rollback_rate",
    rule_name: "OTA Rollback Rate Exceeds Threshold",
    rule_type: "infrastructure_failure",
    enabled: true,
    severity: "critical",
    notification_channels: ["pagerduty", "slack", "sms"],

    eval_window_seconds: 3600, // 1 hour
    eval_frequency_seconds: 300, // every 5 min
    threshold: "rollback_count / deployment_count > 0.05",

    condition: (events, ctx) => {
        const otaEvents = events.filter(
            (e): e is OTADeploymentEvent => e.event_class === "ota_deployment",
        );

        // Filter by home_id if context specifies it
        const relevantEvents = otaEvents.filter((e) => !ctx.home_id || e.home_id === ctx.home_id);

        const deployments = relevantEvents.filter((e) => e.event_type === "completed");
        const rollbacks = relevantEvents.filter((e) => e.rolled_back === true);

        if (deployments.length < 5) return false;

        const rollbackRate = rollbacks.length / deployments.length;
        return rollbackRate > 0.05; // > 5%
    },

    create_alert: (events, ctx) => {
        const otaEvents = events.filter(
            (e): e is OTADeploymentEvent => e.event_class === "ota_deployment",
        );
        const deployments = otaEvents.filter((e) => e.event_type === "completed");
        const rollbacks = otaEvents.filter((e) => e.rolled_back === true);
        const rollbackRate = (rollbacks.length / deployments.length) * 100;

        return {
            alert_id: generateAlertId(),
            rule_id: "infra_ota_rollback_rate",
            rule_name: "OTA Rollback Rate Exceeds Threshold",
            severity: "critical",
            home_id: ctx.home_id,
            affected_resources: [...new Set(deployments.map((e) => e.device_id || "unknown"))],
            detected_at: ctx.current_time,
            status: "active",
            title: `OTA Rollback Rate: ${rollbackRate.toFixed(1)}% (threshold: 5%)`,
            description: `${rollbacks.length} rollbacks out of ${deployments.length} deployments. Firmware versions: ${[...new Set(deployments.map((e) => e.firmware_version))].join(", ")}.`,
            impact: "Firmware quality issues detected. Rollout should be halted immediately to prevent cascading failures.",
            evidence: {
                event_count: deployments.length,
                first_event_timestamp: Math.min(
                    ...deployments.map((e) => e.installation_completed_timestamp || 0),
                ),
                last_event_timestamp: Math.max(
                    ...deployments.map((e) => e.installation_completed_timestamp || 0),
                ),
                sample_event_ids: rollbacks.slice(0, 10).map((e) => e.trace_id),
            },
            recommended_actions: [
                "HALT current OTA rollout immediately",
                "Revert to last stable firmware version",
                "Investigate rollback reasons",
                "Review firmware changelog for breaking changes",
                "Run internal QA regression suite",
            ],
            dedup_key: `ota_rollback_${ctx.home_id}`,
            notification_channels: ["pagerduty", "slack", "sms"],
        };
    },

    dedup_key_fn: (alert) => `ota_rollback_${alert.home_id}`,
    dedup_window_seconds: 1800, // 30 min for OTA (slow to resolve)
};

// ============================================================================
// ALERT RULES: FLEET-WIDE ANOMALIES
// ============================================================================

export const ALERT_RULE_COORDINATED_RECONNECT_STORM: AlertingRule = {
    rule_id: "fleet_coordinated_reconnect_storm",
    rule_name: "Coordinated Reconnect Storm Detected",
    rule_type: "fleet_wide_anomaly",
    enabled: true,
    severity: "critical",
    notification_channels: ["pagerduty", "slack"],

    eval_window_seconds: 60,
    eval_frequency_seconds: 10,
    threshold: "anomalies > 5 homes within 60 sec, geographically clustered",

    condition: (events, ctx) => {
        // Count homes with reconnection spikes in window
        const reconnectEvents = events.filter(
            (e): e is MQTTSessionMetric =>
                e.event_class === "mqtt_session" && e.reconnection_count > 3,
        );

        const homesAffected = new Set(reconnectEvents.map((e) => e.home_id));

        // Use fleet context to determine threshold
        const minHomesThreshold = Math.max(5, Math.ceil(ctx.fleet_size * 0.05));
        if (homesAffected.size < minHomesThreshold) return false;

        // Check geographic clustering
        const geohashes = reconnectEvents.map((e) => e.location_geohash || "unknown");
        const geohashCounts = geohashes.reduce(
            (acc, g) => {
                acc[g] = (acc[g] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        // If 70%+ of reconnects from same geohash region, it's coordinated
        const topGeohashCount = Math.max(...Object.values(geohashCounts));
        const clusteringRatio = topGeohashCount / reconnectEvents.length;

        return clusteringRatio > 0.7;
    },

    create_alert: (events, ctx) => {
        const reconnectEvents = events.filter(
            (e): e is MQTTSessionMetric =>
                e.event_class === "mqtt_session" && e.reconnection_count > 3,
        );

        const homesAffected = [...new Set(reconnectEvents.map((e) => e.home_id))];

        return {
            alert_id: generateAlertId(),
            rule_id: "fleet_coordinated_reconnect_storm",
            rule_name: "Coordinated Reconnect Storm Detected",
            severity: "critical",
            affected_resources: homesAffected,
            detected_at: ctx.current_time,
            status: "active",
            title: `Reconnect Storm: ${homesAffected.length} homes, geographically clustered`,
            description: `${reconnectEvents.length} reconnection events across ${homesAffected.length} homes, concentrated in single geohash region. Indicates coordinated network incident or attack.`,
            impact: "Regional service disruption or potential coordinated attack. Commands may be delayed or rejected.",
            evidence: {
                event_count: reconnectEvents.length,
                first_event_timestamp: Math.min(
                    ...reconnectEvents.map((e) => e.wall_clock_timestamp),
                ),
                last_event_timestamp: Math.max(
                    ...reconnectEvents.map((e) => e.wall_clock_timestamp),
                ),
                sample_event_ids: reconnectEvents.slice(0, 10).map((e) => e.trace_id),
            },
            recommended_actions: [
                "Check regional internet connectivity",
                "Check MQTT broker regional load",
                "Review DNS records for potential hijacking",
                "Check if ISP provider has issues in region",
                "Alert regional administrator",
            ],
            dedup_key: `reconnect_storm_regional_${Math.floor(ctx.current_time / 300000)}`,
            notification_channels: ["pagerduty", "slack"],
        };
    },

    dedup_key_fn: (alert) => `reconnect_storm_${Math.floor(alert.detected_at / 300000)}`,
    dedup_window_seconds: 900, // 15 min window
};

// ============================================================================
// ALERT RULES: INFRASTRUCTURE FAILURE
// ============================================================================

export const ALERT_RULE_SAFETY_SERVICE_OUTAGE: AlertingRule = {
    rule_id: "infra_safety_service_outage",
    rule_name: "Safety Service Outage",
    rule_type: "infrastructure_failure",
    enabled: true,
    severity: "critical",
    notification_channels: ["pagerduty", "sms"],

    eval_window_seconds: 300, // 5 min
    eval_frequency_seconds: 30,
    threshold: "decision_count == 0 for 5 min",

    condition: (events, ctx) => {
        // Scope to specific home if context specifies it
        const isRelevant = (e: any) => !ctx.home_id || e.home_id === ctx.home_id;

        const safetyEvents = events.filter(
            (e): e is SafetyCountersignatureEvent =>
                e.event_class === "safety_countersignature" && isRelevant(e),
        );

        // If we have commands but no safety decisions, service is down
        const commandEvents = events.filter(
            (e): e is CommandExecutionEvent =>
                e.event_class === "command_execution" && isRelevant(e),
        );

        return (
            commandEvents.length > 5 &&
            safetyEvents.filter((e) => e.event_type === "decision").length === 0
        );
    },

    create_alert: (events, ctx) => {
        const commandEvents = events.filter(
            (e): e is CommandExecutionEvent => e.event_class === "command_execution",
        );

        return {
            alert_id: generateAlertId(),
            rule_id: "infra_safety_service_outage",
            rule_name: "Safety Service Outage",
            severity: "critical",
            home_id: ctx.home_id,
            affected_resources: [],
            detected_at: ctx.current_time,
            status: "active",
            title: "Safety Service Not Responding",
            description: `${commandEvents.length} commands waiting for Safety approval, but no decisions being made. Service appears offline or hung.`,
            impact: "CRITICAL: All commands requiring Safety approval are blocked. System in degraded state.",
            evidence: {
                event_count: commandEvents.length,
                first_event_timestamp: Math.min(...commandEvents.map((e) => e.submitted_timestamp)),
                last_event_timestamp: Math.max(...commandEvents.map((e) => e.submitted_timestamp)),
                sample_event_ids: commandEvents.slice(0, 5).map((e) => e.trace_id),
            },
            recommended_actions: [
                "Check Safety service pod status immediately",
                "Check database connectivity from Safety service",
                "Check memory/CPU utilization on Safety instances",
                "Review Safety service error logs",
                "Trigger failover if multi-instance setup",
                "Escalate to on-call architect",
            ],
            dedup_key: `safety_outage_${ctx.home_id}`,
            notification_channels: ["pagerduty", "sms"],
        };
    },

    dedup_key_fn: (alert) => `safety_outage_${alert.home_id}`,
    dedup_window_seconds: 600,
};

// ============================================================================
// ALERT RULES REGISTRY
// ============================================================================

export const ALL_ALERT_RULES: AlertingRule[] = [
    // Security events (highest priority)
    ALERT_RULE_REPLAY_ATTACK_PROBABLE,
    ALERT_RULE_AUTHORITY_BOUNDARY_BYPASS,
    ALERT_RULE_CERTIFICATE_EXPIRY_24H,

    // SLO breaches (user-facing impact)
    ALERT_RULE_LATENCY_P99_BREACH,
    ALERT_RULE_COMMAND_REJECTION_SPIKE,

    // OTA safety (data integrity)
    ALERT_RULE_OTA_ROLLBACK_RATE,

    // Fleet-wide issues (operational)
    ALERT_RULE_COORDINATED_RECONNECT_STORM,

    // Infrastructure (system health)
    ALERT_RULE_SAFETY_SERVICE_OUTAGE,
];

// ============================================================================
// ALERT RULE EVALUATION ENGINE
// ============================================================================

/**
 * Main alerting engine: evaluates rules, generates alerts, handles deduplication
 */
export class AlertingEngine {
    private alertHistory: Map<string, Alert> = new Map(); // dedup key → alert

    constructor(
        private rules: AlertingRule[] = ALL_ALERT_RULES,
        private alertSink: (alert: Alert) => Promise<void> = noopAlertSink,
    ) {}

    /**
     * Evaluate all enabled rules against event window.
     */
    async evaluateRules(events: TelemetryEvent[], context: AlertContext): Promise<Alert[]> {
        const alerts: Alert[] = [];

        for (const rule of this.rules.filter((r) => r.enabled)) {
            try {
                if (rule.condition(events, context)) {
                    const alert = rule.create_alert(events, context);

                    // Check deduplication
                    const dedupKey = rule.dedup_key_fn(alert);
                    const existingAlert = this.alertHistory.get(dedupKey);

                    if (
                        !existingAlert ||
                        context.current_time - existingAlert.detected_at >
                            rule.dedup_window_seconds * 1000
                    ) {
                        // New alert or dedup window expired
                        alerts.push(alert);
                        this.alertHistory.set(dedupKey, alert);

                        // Send to notification channels
                        await this.alertSink(alert);
                    }
                }
            } catch (error) {
                console.error(`Error evaluating rule ${rule.rule_id}:`, error);
                // Continue to next rule
            }
        }

        return alerts;
    }

    /**
     * Mark alert as resolved.
     */
    resolveAlert(alertId: string): void {
        for (const alert of this.alertHistory.values()) {
            if (alert.alert_id === alertId) {
                alert.status = "resolved";
                alert.resolved_at = Date.now();
                break;
            }
        }
    }

    /**
     * Get active alerts.
     */
    getActiveAlerts(): Alert[] {
        return Array.from(this.alertHistory.values()).filter(
            (a) => a.status === "active" || a.status === "escalated",
        );
    }
}

// ============================================================================
// ALERT ROUTING & NOTIFICATION
// ============================================================================

/**
 * Alert sink implementations (actual notification channels).
 */

export async function noopAlertSink(alert: Alert): Promise<void> {
    // Log alert for testing/debugging
    console.debug("Alert (noop sink):", alert.rule_name, alert.alert_id);
}

export async function pagerDutyAlertSink(alert: Alert): Promise<void> {
    // Notification channels are configured in AlertingRule, not on individual alerts

    const severity = {
        critical: "critical",
        warning: "error",
        info: "info",
    }[alert.severity];

    const payload = {
        routing_key: process.env.PAGERDUTY_INTEGRATION_KEY,
        event_action: "trigger",
        dedup_key: alert.dedup_key,
        payload: {
            summary: alert.title,
            severity,
            source: "hestia-telemetry",
            custom_details: {
                alert_id: alert.alert_id,
                rule_id: alert.rule_id,
                description: alert.description,
                impact: alert.impact,
                recommended_actions: alert.recommended_actions,
                evidence: alert.evidence,
                home_id: alert.home_id,
                affected_resources: alert.affected_resources,
            },
        },
    };

    // TODO: Implement actual PagerDuty API call
    console.log("PagerDuty Alert:", JSON.stringify(payload, null, 2));
}

export async function slackAlertSink(alert: Alert): Promise<void> {
    // Notification channels are configured in AlertingRule, not on individual alerts

    const color = {
        critical: "danger",
        warning: "warning",
        info: "good",
    }[alert.severity];

    const message = {
        attachments: [
            {
                color,
                title: alert.title,
                text: alert.description,
                fields: [
                    {
                        title: "Severity",
                        value: alert.severity.toUpperCase(),
                        short: true,
                    },
                    {
                        title: "Home",
                        value: alert.home_id || "N/A",
                        short: true,
                    },
                    {
                        title: "Impact",
                        value: alert.impact,
                        short: false,
                    },
                    {
                        title: "Recommended Actions",
                        value: alert.recommended_actions.map((a) => `• ${a}`).join("\n"),
                        short: false,
                    },
                ],
                footer: alert.rule_name,
                ts: Math.floor(alert.detected_at / 1000),
            },
        ],
    };

    // TODO: Implement actual Slack API call
    console.log("Slack Alert:", JSON.stringify(message, null, 2));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function percentile(arr: number[], p: number): number {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
}

export function correlateAlerts(alerts: Alert[]): Alert[] {
    // Group alerts by affected resources
    const correlated = new Map<string, Alert[]>();

    for (const alert of alerts) {
        for (const resource of alert.affected_resources) {
            const key = `${resource}_${alert.rule_id}`;
            if (!correlated.has(key)) {
                correlated.set(key, []);
            }
            correlated.get(key)!.push(alert);
        }
    }

    // Add correlation info
    for (const alertsInGroup of correlated.values()) {
        if (alertsInGroup.length > 1) {
            for (const alert of alertsInGroup) {
                alert.correlated_with = alertsInGroup
                    .filter((a) => a.alert_id !== alert.alert_id)
                    .map((a) => a.alert_id);
            }
        }
    }

    return alerts;
}
