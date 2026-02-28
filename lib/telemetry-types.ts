/**
 * HESTIA Labs - Telemetry Architecture v1.0
 * Author: HESTIA Labs
 * Created: 2026-02-10
 * Last Modified: 2026-02-14
 *
 * Telemetry for AI-native smart home OS with adversarial model.
 * All timestamps in UTC milliseconds. All identifiers MUST be properly sanitized.
 *
 * Invariants:
 * - Every event has cryptographic_identity_reference for audit
 * - trace_id enables full execution path reconstruction
 * - Monotonic timestamps (device-side) prevent replay manipulation
 * - Authority transitions are explicit and auditable
 * - All security-relevant events are signed/verified
 */

// ============================================================================
// CORE TELEMETRY ENVELOPE (ALL EVENTS)
// ============================================================================

export const TELEMETRY_VERSION = "1.0" as const;
export const AUTHORITY_LEVELS = ["Device", "HxTP", "Safety", "Planner", "Cloud"] as const;
export const SIGNATURE_STATUS = ["verified", "failed", "unverified", "degraded"] as const;

export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];
export type SignatureStatus = (typeof SIGNATURE_STATUS)[number];

/**
 * Universal telemetry envelope applied to ALL events and metrics.
 * Enables correlation, audit trail, and adversarial detection.
 */
export interface TelemetryEnvelope {
    /** Semantic versioning for schema evolution */
    version: "1.0";

    /** Home/tenant identifier - enables per-home aggregation and isolation */
    home_id: string; // UUID, immutable

    /** Device identifier - null for cloud/infrastructure telemetry */
    device_id: string | null;

    /** Which system made this decision/action */
    authority_level: AuthorityLevel;

    /**
     * Cryptographic identity reference:
     * - Device: Ed25519 public key hash + certificate serial
     * - HxTP: Certificate DN + timestamp
     * - Safety: Service instance ID + nonce
     * - Planner: Model version + session ID
     * - Cloud: Service account ID
     *
     * Format: "authority:hash:timestamp:nonce"
     */
    cryptographic_identity_reference: string;

    /** Monotonic device-side timestamp (prevents replay with time manipulation) */
    monotonic_timestamp: number; // milliseconds since device boot

    /** Wall clock for correlation */
    wall_clock_timestamp: number; // milliseconds since Unix epoch

    /** Correlation ID for tracing across services */
    trace_id: string; // UUID, enables full path reconstruction

    /** Parent span ID for distributed tracing */
    parent_span_id: string | null;

    /** This event's span ID */
    span_id: string; // UUID

    /** Signature verification status if this event involves cryptographic proof */
    signature_verification_status: SignatureStatus;

    /** If signature failed, include digest for forensics */
    signature_failure_reason?: string;

    /**
     * Authority boundary crossing indicator.
     * Mark when control transitions between systems.
     *
     * Examples:
     * - "planner:to:safety" - Planner sends command to Safety
     * - "safety:to:hxtp" - Safety countersigns HXTP message
     * - "hxtp:to:device" - HxTP edge sends to device
     * - "device:ack:hxtp" - Device acknowledgment
     */
    authority_transition?: string;

    /** Geohash of home location (2-character precision: ~600km) for privacy-preserving regional analysis */
    location_geohash?: string;

    /** Request ID if this is part of a user-initiated flow */
    request_id?: string;
}

// ============================================================================
// EVENT CLASSIFICATIONS
// ============================================================================

export const EVENT_CLASSES = {
    DEVICE_HEALTH: "device_health",
    CERTIFICATE_LIFECYCLE: "certificate_lifecycle",
    COMMAND_EXECUTION: "command_execution",
    SAFETY_COUNTERSIGNATURE: "safety_countersignature",
    REPLAY_PROTECTION: "replay_protection",
    OTA_DEPLOYMENT: "ota_deployment",
    PLANNER_OUTPUT: "planner_output",
    HXTP_SIGNATURE: "hxtp_signature",
    MQTT_SESSION: "mqtt_session",
    EDGE_RESOURCE: "edge_resource",
    CLOUD_SERVICE: "cloud_service",
    AUTHORITY_TRANSACT: "authority_transition",
    SECURITY_ANOMALY: "security_anomaly",
} as const;

export type EventClass = (typeof EVENT_CLASSES)[keyof typeof EVENT_CLASSES];

// ============================================================================
// 1. DEVICE HEALTH METRICS
// ============================================================================

export interface DeviceHealthMetric extends TelemetryEnvelope {
    event_class: "device_health";
    event_type:
        | "heartbeat"
        | "resource_snapshot"
        | "connectivity_status"
        | "error_rate_spike"
        | "battery_status";

    // Core health indicators
    cpu_usage_percent: number; // 0-100
    memory_usage_percent: number; // 0-100
    storage_usage_percent: number; // 0-100
    uptime_seconds: number;
    last_command_latency_ms: number;

    // Network health
    rssi_dbm: number; // WiFi signal strength
    mqtt_message_queue_depth: number;
    mqtt_reconnect_count: number; // cumulative
    failed_auth_attempts: number; // recent window

    // Thermal management
    temperature_celsius: number | null;
    thermal_throttle_active: boolean;

    // Battery (if applicable)
    battery_percent?: number;
    battery_health_status?: "good" | "degraded" | "critical";

    // Error tracking
    recent_errors: {
        error_code: string;
        count: number;
        first_occurrence_ms: number;
        last_occurrence_ms: number;
    }[];

    // Firmware metadata
    firmware_version: string;
    firmware_build_timestamp: number;
}

// ============================================================================
// 2. CERTIFICATE LIFECYCLE TRACKING
// ============================================================================

export type CertificateRole =
    | "device_identity"
    | "mqtt_tls"
    | "hxtp_peer"
    | "safety_counter_verify";
export type CertificateEvent =
    | "issued"
    | "renewed"
    | "revoked"
    | "expired"
    | "validation_failed"
    | "pinning_mismatch";

export interface CertificateLifecycleEvent extends TelemetryEnvelope {
    event_class: "certificate_lifecycle";
    event_type: CertificateEvent;

    // Certificate identity
    certificate_role: CertificateRole;
    common_name: string;
    issuer_dn: string;
    serial_number: string;
    subject_public_key_info_hash: string; // SHA256 for pinning verification

    // Lifecycle tracking
    issued_timestamp: number;
    not_before: number;
    not_after: number;
    days_until_expiry: number;

    // Chain validation
    chain_valid: boolean;
    chain_validation_errors?: string[];
    root_ca_trusted: boolean;

    // Revocation status (if OCSP/CRL available)
    revocation_status?: "active" | "revoked" | "unknown";
    revocation_check_timestamp?: number;
    revocation_check_method?: "ocsp" | "crl" | "none";

    // For "renewal" events: new certificate details
    new_serial_number?: string;
    new_not_after?: number;

    // For "validation_failed": reason
    validation_fail_reason?: string;

    // For "pinning_mismatch": what was expected vs actual
    expected_pin_hash?: string;
    actual_pin_hash?: string;

    // Environment context
    validation_location: "device" | "mqtt_broker" | "hxtp_edge" | "safety_service";
}

// ============================================================================
// 3. COMMAND EXECUTION EVENTS
// ============================================================================

export type CommandStatus =
    | "accepted"
    | "rejected"
    | "executing"
    | "completed"
    | "failed"
    | "timeout"
    | "cancelled";
export type RejectReason =
    | "authority_exceeded"
    | "signature_invalid"
    | "device_offline"
    | "device_busy"
    | "invalid_parameters"
    | "safety_veto"
    | "rate_limit"
    | "replay_detected";

export interface CommandExecutionEvent extends TelemetryEnvelope {
    event_class: "command_execution";
    event_type: CommandStatus;

    // Command identity
    command_id: string; // UUID
    command_name: string;
    command_sequence_number: number; // per-device monotonic counter

    // Parameters (sanitized - no sensitive data)
    parameter_hash: string; // SHA256 of parameters for matching without storing values
    parameter_count: number;

    // Authority who initiated
    initiated_by_authority: AuthorityLevel;
    planner_session_id?: string; // if from Planner
    planner_model_version?: string;

    // Execution timeline
    submitted_timestamp: number;
    accepted_timestamp?: number;
    execution_started_timestamp?: number;
    execution_completed_timestamp?: number;

    // Duration metrics
    queue_wait_time_ms?: number;
    execution_time_ms?: number;
    total_latency_ms?: number; // wall-to-wall

    // Result
    status: CommandStatus;
    reject_reason?: RejectReason;
    reject_detail?: string;

    // Device response
    device_acknowledgment_received: boolean;
    device_ack_timestamp?: number;

    // Safety involvement
    safety_required: boolean;
    safety_approved: boolean;
    safety_approval_timestamp?: number;

    // Signature chain
    hxtp_signature_valid: boolean;
    safety_counter_signature_valid?: boolean;

    // Retry information
    retry_count: number;
    previous_command_id?: string; // if this is a retry
}

// ============================================================================
// 4. SAFETY COUNTERSIGNATURE EVENTS
// ============================================================================

export type SafetyDecision =
    | "approved"
    | "rejected"
    | "partial_reject"
    | "requires_manual_review"
    | "timeout";
export type SafetyVetoReason =
    | "exceeds_authority_boundary"
    | "violates_rate_limit"
    | "malformed_signature"
    | "replay_indicator"
    | "device_state_mismatch"
    | "external_constraint_violation"
    | "service_degradation";

export interface SafetyCountersignatureEvent extends TelemetryEnvelope {
    event_class: "safety_countersignature";
    event_type: "decision" | "error" | "timeout" | "service_degradation";

    // Request identity
    safety_request_id: string;
    command_id: string;

    // What's being approved
    command_authority_level: AuthorityLevel;
    claimed_device_authority_boundary: string; // e.g., "living_room_lights"
    claimed_command_type: string;

    // Safety decision
    decision: SafetyDecision;
    decision_timestamp: number;
    decision_latency_ms: number;

    // If rejected or partial
    veto_reason?: SafetyVetoReason;
    veto_detail?: string;
    affected_parameters?: string[]; // keys that were rejected (if partial)

    // Confidence metrics
    certainty_score: number; // 0-1, how confident is Safety in this decision?
    model_version: string;
    rules_evaluated_count: number;

    // External constraint checks (if applicable)
    external_checks_performed: string[];
    external_check_results: Record<string, boolean>;

    // If manual review requested: who's reviewing?
    manual_review_requested: boolean;
    assigned_reviewer?: string;
    review_deadline?: number;

    // Service health context
    service_health_status: "healthy" | "degraded" | "impaired";
    service_instance_id: string;

    // Counter-signature proof
    counter_signature: string; // Ed25519 signature over command + decision
    counter_signature_public_key_reference: string;
}

// ============================================================================
// 5. REPLAY PROTECTION VALIDATION EVENTS
// ============================================================================

export type ReplayDetectionMethod =
    | "timestamp_verification"
    | "nonce_uniqueness"
    | "sequence_number_monotonicity"
    | "signature_timestamp_binding"
    | "behavioral_anomaly";

export type ReplayRiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface ReplayProtectionEvent extends TelemetryEnvelope {
    event_class: "replay_protection";
    event_type: "validation_passed" | "anomaly_detected" | "probable_replay";

    // Message under inspection
    message_id: string;
    message_timestamp: number;
    received_timestamp: number;

    // Replay detection details
    detection_method: ReplayDetectionMethod;
    time_delta_ms: number; // difference between claimed and received timestamp

    // For sequence number checks
    claimed_sequence?: number;
    last_seen_sequence?: number;
    sequence_gap?: number;

    // For nonce checks
    nonce_value?: string;
    nonce_previously_seen: boolean;
    nonce_age_ms?: number;

    // Behavioral analysis
    similar_recent_messages?: number; // count of pattern matches
    device_typical_message_interval_ms?: number;
    deviation_from_typical_pattern_sigma?: number; // std dev units

    // Risk assessment
    risk_level: ReplayRiskLevel;
    risk_factors: string[]; // ["timestamp_old", "device_offline_window", "nonce_reuse"]

    // How we detected it
    confidence_score: number; // 0-1
    detection_algorithm_version: string;

    // What we did
    action_taken: "allow" | "block" | "require_re_auth" | "alert_operator";

    // Correlation with other devices (coordinated storm detection)
    similar_anomalies_in_fleet?: number;
    geographically_clustered: boolean;
}

// ============================================================================
// 6. OTA DEPLOYMENT STATUS
// ============================================================================

export type OTAPhase =
    | "announced"
    | "available"
    | "downloading"
    | "verifying"
    | "installing"
    | "completed"
    | "failed"
    | "rolled_back";
export type OTAFailureMode =
    | "download_timeout"
    | "checksum_mismatch"
    | "signature_invalid"
    | "flash_write_error"
    | "insufficient_space"
    | "version_downgrade_rejected"
    | "rollback_timeout"
    | "network_interrupted";

export interface OTADeploymentEvent extends TelemetryEnvelope {
    event_class: "ota_deployment";
    event_type: OTAPhase;

    // Release identity
    rollout_id: string; // UUID for tracking cohort
    firmware_version: string;
    firmware_build_hash: string; // SHA256
    release_notes_hash: string; // link without content to prevent injection

    // Release metadata
    release_timestamp: number;
    is_security_patch: boolean;
    requires_manual_approval: boolean;

    // Rollout strategy
    rollout_percentage: number; // target % of homes in this phase
    device_cohort: string; // e.g., "esp32s3_2.4ghz"
    rollout_strategy: "canary" | "staged" | "immediate";

    // Device-side telemetry
    current_firmware_version: string;
    announcement_received_timestamp?: number;
    download_started_timestamp?: number;
    download_completed_timestamp?: number;
    installation_started_timestamp?: number;
    installation_completed_timestamp?: number;

    // Download metrics
    download_size_bytes?: number;
    download_duration_ms?: number;
    download_bandwidth_kbps?: number;
    retry_count?: number;

    // Verification
    firmware_checksum: string;
    checksum_matches: boolean;
    signature_verified: boolean;
    signature_verification_timestamp?: number;

    // Installation result
    phase: OTAPhase;
    success: boolean;
    failure_mode?: OTAFailureMode;
    failure_detail?: string;

    // Rollback tracking
    rolled_back: boolean;
    rollback_reason?: string;
    rollback_to_version?: string;

    // Device state after OTA
    post_ota_reboot_successful?: boolean;
    post_ota_telemetry_available?: boolean;
}

// ============================================================================
// 7. PLANNER OUTPUT LOGS
// ============================================================================

export type PlannerOutputStatus =
    | "generated"
    | "error"
    | "timeout"
    | "safety_rejected"
    | "rate_limited";

export interface PlannerOutputEvent extends TelemetryEnvelope {
    event_class: "planner_output";
    event_type: PlannerOutputStatus;

    // Request identity
    planner_session_id: string;
    user_request_hash: string; // SHA256 of voice/text input (no PII)
    request_timestamp: number;

    // Model context
    model_version: string;
    model_context_size: number; // tokens used
    inference_latency_ms: number;
    temperature: number; // 0-1
    max_tokens: number;

    // Generated command
    generated_command_hash: string;
    generated_command_count: number;
    target_devices: string[]; // device IDs affected
    target_authorities: AuthorityLevel[];

    // Confidence
    confidence_score: number; // 0-1, model's confidence in output
    ambiguity_detected: boolean; // was user intent ambiguous?

    // Planning parameters
    home_state_context: {
        num_devices: number;
        num_active_automations: number;
        num_recent_commands: number;
    };

    // Results
    status: PlannerOutputStatus;
    generated_successfully: boolean;
    error_type?: string;
    timeout_ms?: number;

    // Safety submission
    submitted_to_safety: boolean;
    safety_submission_timestamp?: number;
}

// ============================================================================
// 8. HXTP SIGNATURE VERIFICATION RESULTS
// ============================================================================

export type SignatureAlgorithm = "Ed25519" | "ECDSA_P256" | "RSA_2048";
export type VerificationScope = "single_message" | "command_batch" | "certificate_chain";

export interface HxtpSignatureEvent extends TelemetryEnvelope {
    event_class: "hxtp_signature";
    event_type: "verification_passed" | "verification_failed" | "certificate_pinning_check";

    // Signature details
    signature_algorithm: SignatureAlgorithm;
    message_digest_algorithm: "SHA256" | "SHA512";
    message_hash: string;
    signature_value: string; // hex-encoded

    // Verification scope
    scope: VerificationScope;
    scope_detail?: string; // e.g., "batch of 5 commands"

    // Signer identification
    signer_public_key_hash: string;
    signer_certificate_serial: string;
    signer_authority_level: AuthorityLevel;

    // Verification context
    verification_timestamp: number;
    verification_location: "device" | "mqtt_broker" | "hxtp_edge" | "cloud";

    // Result details
    verification_result: "passed" | "failed";
    verification_latency_ms: number;

    // If failed
    failure_reason?:
        | "signature_invalid"
        | "certificate_expired"
        | "certificate_revoked"
        | "certificate_untrusted"
        | "key_mismatch"
        | "digest_mismatch"
        | "timestamp_out_of_bounds";

    // Certificate pinning (if applicable)
    pinning_enabled: boolean;
    pinning_validation_passed?: boolean;
    pinning_mismatch_detail?: string;

    // Batch processing
    batch_size?: number;
    batch_partial_failures?: number; // how many in batch failed?

    // Timing (for clock skew detection)
    claimed_timestamp: number;
    wall_clock_timestamp: number;
    clock_skew_seconds?: number;
    excessive_skew_detected?: boolean;
}

// ============================================================================
// 9. MQTT SESSION METRICS
// ============================================================================

export type MQTTConnectionStatus =
    | "connected"
    | "disconnected"
    | "reconnecting"
    | "failed"
    | "timeout";

export interface MQTTSessionMetric extends TelemetryEnvelope {
    event_class: "mqtt_session";
    event_type:
        | "session_established"
        | "session_terminated"
        | "message_loss"
        | "qos_degradation"
        | "subscription_failed"
        | "message_rate_spike";

    // Session identity
    mqtt_session_id: string;
    broker_hostname: string;
    broker_port: number;
    tls_enabled: boolean;
    tls_version?: string;
    tls_cipher_suite?: string;

    // Connection telemetry
    connected_timestamp?: number;
    disconnected_timestamp?: number;
    connection_duration_seconds?: number;

    // Status tracking
    current_status: MQTTConnectionStatus;
    status_change_reason?: string;

    // Message statistics
    messages_sent: number;
    messages_received: number;
    bytes_sent: number;
    bytes_received: number;
    message_rate_per_second: number;

    // QoS tracking
    qos0_messages: number; // fire-and-forget
    qos1_messages: number; // at-least-once
    qos2_messages: number; // exactly-once

    // Reliability
    message_loss_count: number;
    message_loss_percentage: number; // 0-100
    duplicate_message_count: number;
    out_of_order_messages: number;

    // Latency
    subscription_response_time_ms: number;
    publish_ack_time_ms: number;
    round_trip_time_ms: number;

    // Network quality
    packet_loss_percent?: number;
    retransmission_count?: number;

    // Authentication
    authentication_method: "certificate" | "username_password" | "token";
    authentication_success: boolean;
    authentication_latency_ms?: number;

    // Reconnections
    reconnection_count: number;
    reconnection_backoff_ms?: number;
    backoff_exhausted?: boolean;

    // Subscriptions
    active_subscriptions: number;
    subscription_topics: string[]; // topic filters
    failed_subscription_topics?: string[];
}

// ============================================================================
// 10. EDGE NODE RESOURCE METRICS
// ============================================================================

export interface EdgeNodeResourceMetric extends TelemetryEnvelope {
    event_class: "edge_resource";
    event_type: "resource_snapshot" | "overload_detected" | "degradation_warning";

    // Edge node identity
    edge_node_id: string;
    edge_location: string; // geographic annotation
    environment: "staging" | "production";

    // Compute resources
    cpu_cores: number;
    cpu_usage_percent: number;
    cpu_throttle_active: boolean;
    load_average_1m: number;
    load_average_5m: number;
    load_average_15m: number;

    // Memory
    memory_total_gb: number;
    memory_used_gb: number;
    memory_available_gb: number;
    memory_usage_percent: number;
    swap_used_gb: number;

    // Storage
    disk_total_gb: number;
    disk_used_gb: number;
    disk_available_gb: number;
    disk_usage_percent: number;
    iops_available: number;
    iops_current: number;

    // Network
    network_interfaces: Array<{
        interface_name: string;
        bytes_in: number;
        bytes_out: number;
        packets_in: number;
        packets_out: number;
        errors_in: number;
        errors_out: number;
        dropped_packets_in: number;
        dropped_packets_out: number;
    }>;

    // Process count
    total_processes: number;
    running_processes: number;
    zombie_processes: number;

    // Kernel metrics
    context_switches_per_second: number;
    interrupts_per_second: number;

    // Temperature (if available)
    cpu_temperature_celsius?: number;
    warning_threshold_celsius?: number;

    // Anomalies detected
    anomaly_detected: boolean;
    anomaly_type?: string; // e.g., "memory_leak", "cpu_spike", "io_congestion"
}

// ============================================================================
// 11. CLOUD SERVICE RESOURCE METRICS
// ============================================================================

export interface CloudServiceMetric extends TelemetryEnvelope {
    event_class: "cloud_service";
    event_type: "health_snapshot" | "latency_recorded" | "error_rate_spike" | "scaling_event";

    // Service identity
    service_name: string; // "safety", "planner", "cloud_planner", "api_gateway"
    service_instance_id: string;
    service_region: string;
    service_version: string;

    // Request processing
    requests_total: number;
    requests_per_second: number;
    successful_requests: number;
    failed_requests: number;
    error_rate_percent: number;

    // Latency percentiles (critical for SLO)
    latency_p50_ms: number;
    latency_p95_ms: number;
    latency_p99_ms: number;
    latency_p999_ms: number;
    latency_max_ms: number;

    // Error details
    error_types: Record<string, number>; // e.g., {"timeout": 5, "bad_request": 2}
    error_rate_trend: "stable" | "increasing" | "decreasing";

    // Dependency health
    downstream_service_latency: Record<string, number>; // call latency to dependencies
    downstream_service_errors: Record<string, number>; // error counts per dependency

    // Cache performance (if applicable)
    cache_hit_rate_percent?: number;
    cache_eviction_rate?: number;

    // Scaling metrics
    instance_count: number;
    cpu_reservation_percent: number;
    memory_reservation_percent: number;
    scaling_action_taken?: boolean;
    scaling_action_type?: "scale_up" | "scale_down";

    // Queue depth (if async processing)
    queue_length?: number;
    queue_age_seconds?: number;

    // Database/external calls
    database_query_count: number;
    database_query_latency_p95_ms: number;
    slow_query_count?: number;
}

// ============================================================================
// 12. AUTHORITY TRANSITION TRACKING
// ============================================================================

export interface AuthorityTransitionEvent extends TelemetryEnvelope {
    event_class: "authority_transition";
    event_type: "transition" | "delegation" | "rejection" | "cascade_failure";

    // From → To
    from_authority: AuthorityLevel;
    to_authority: AuthorityLevel;

    // What changed hands
    entity_type: string; // "command", "decision", "signature", "context"
    entity_id: string;

    // Decision context
    decision_required: boolean;
    decision_made: boolean;
    decision_result?: "approved" | "rejected" | "deferred";

    // Authority boundary
    boundary_constraint: string; // e.g., "living_room_only", "non_destructive_only"
    boundary_respected: boolean;
    boundary_violation_detail?: string;

    // Information flow
    information_disclosed: string[]; // what context was passed
    information_sanitized: boolean;
    sanitization_rules_applied?: string[];

    // Timing
    transition_latency_ms: number;

    // Signature chain
    request_signed: boolean;
    response_signed?: boolean;
    response_signature_valid?: boolean;
}

// ============================================================================
// 13. SECURITY ANOMALY EVENTS
// ============================================================================

export type AnomalyType =
    | "certificate_chain_invalid"
    | "signature_verification_storm"
    | "replay_attack_probable"
    | "reconnect_storm"
    | "command_rejection_spike"
    | "latency_anomaly"
    | "authority_boundary_bypass"
    | "crypto_identity_mismatch"
    | "clock_skew_detected"
    | "rate_limit_exhaustion";

export type SeverityLevel = "info" | "warning" | "critical";

export interface SecurityAnomalyEvent extends TelemetryEnvelope {
    event_class: "security_anomaly";
    event_type: AnomalyType;

    // Anomaly details
    anomaly_type: AnomalyType;
    severity: SeverityLevel;
    confidence_score: number; // 0-1, confidence this is real threat vs noise

    // Context
    affected_system: string; // "device", "mqtt", "hxtp", "safety", "planner"
    affected_resources: string[]; // device IDs or service names

    // Detection details
    detection_method: string;
    baseline_value?: number;
    observed_value?: number;
    deviation_percent?: number;

    // Correlated events
    correlated_anomalies: number; // how many similar anomalies in fleet?
    geographic_cluster_size?: number; // if geographically clustered

    // Recommended action
    recommended_action: string; // "investigate", "isolate_device", "rollback_ota", "scale_service"

    // Evidence
    supporting_events: string[]; // IDs of related telemetry events

    // Threat model match
    matches_threat_model: boolean;
    threat_model_scenario?: string; // e.g., "certificate_swap_mid_session"

    // Time window
    anomaly_start_timestamp: number;
    anomaly_end_timestamp: number;
    duration_seconds: number;
}

// ============================================================================
// COMPOSITE STRUCTURES
// ============================================================================

/**
 * All possible telemetry event types.
 * Use discriminated union for type-safe handling.
 */
export type TelemetryEvent =
    | DeviceHealthMetric
    | CertificateLifecycleEvent
    | CommandExecutionEvent
    | SafetyCountersignatureEvent
    | ReplayProtectionEvent
    | OTADeploymentEvent
    | PlannerOutputEvent
    | HxtpSignatureEvent
    | MQTTSessionMetric
    | EdgeNodeResourceMetric
    | CloudServiceMetric
    | AuthorityTransitionEvent
    | SecurityAnomalyEvent;

/**
 * Trace structure for end-to-end execution path.
 * Enables incident investigation and latency analysis.
 */
export interface ExecutionTrace {
    trace_id: string; // UUID
    home_id: string;

    // Trace timeline
    initiated_at: number;
    completed_at: number;
    total_duration_ms: number;

    // Span list (ordered by timestamp)
    spans: ExecutionSpan[];

    // Authority transitions along path
    authority_path: AuthorityLevel[];

    // Result
    trace_status: "success" | "partial_failure" | "failure";
    root_failure_reason?: string;

    // Signature chain
    signatures_verified: number;
    signatures_failed: number;

    // Replay/security checks
    replay_checks_performed: number;
    security_anomalies: AnomalyType[];
}

/**
 * Individual span in execution trace.
 * Represents work in one system during the trace.
 */
export interface ExecutionSpan {
    span_id: string; // UUID
    parent_span_id: string | null;
    trace_id: string;

    // Operation identity
    operation_name: string;
    service_name: string; // "planner", "safety", "hxtp_edge", "device", etc.

    // Timeline
    started_at: number;
    ended_at: number;
    duration_ms: number;
    wall_duration_ms: number; // actual elapsed time

    // Authority context
    authority_level: AuthorityLevel;
    authority_boundary: string | null;

    // Status
    status: "pending" | "running" | "succeeded" | "failed" | "timeout";
    error_message?: string;

    // Signature verification
    signature_in_valid: boolean;
    signature_out_created: boolean;

    // Tags for filtering
    tags: Record<string, string | number>;

    // Metrics
    queued_time_ms?: number;
    processing_time_ms?: number;
    child_latency_ms?: number; // sum of child spans

    // Child operations
    child_span_ids: string[];
}

// ============================================================================
// DASHBOARD DATA MODEL (AGGREGATED TELEMETRY)
// ============================================================================

/**
 * Real-time fleet health snapshot.
 * Aggregated from device and infrastructure telemetry.
 */
export interface FleetHealthSnapshot {
    timestamp: number;
    homes_total: number;
    homes_healthy: number;
    homes_degraded: number;
    homes_offline: number;

    // Devices
    devices_total: number;
    devices_online: number;
    devices_offline: number;
    devices_in_error_state: number;

    // Health metrics
    average_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
    error_rate_percent: number;

    // Security
    certificate_warnings: number;
    unverified_signatures: number;
    replay_anomalies_detected: number;
    authority_violations: number;

    // Infrastructure
    cloud_service_errors: number;
    edge_node_errors: number;
    mqtt_broker_unavailable: boolean;

    // OTA Status
    updates_in_progress: number;
    update_failures: number;
    update_rollbacks: number;
}

/**
 * Per-home detailed health view.
 */
export interface HomeHealthDetails {
    home_id: string;
    home_name?: string;
    last_updated: number;

    // Device roster
    device_count: number;
    devices: Array<{
        device_id: string;
        name: string;
        status: "online" | "offline" | "error";
        last_heartbeat: number;
        cpu_usage_percent: number;
        memory_usage_percent: number;
        uptime_seconds: number;
        firmware_version: string;
    }>;

    // Recent errors (last 24h)
    recent_errors: Array<{
        device_id?: string;
        error_code: string;
        count: number;
        first_occurrence: number;
        last_occurrence: number;
        severity: "info" | "warning" | "critical";
    }>;

    // Certificate status
    certificates_ok: number;
    certificates_expiring_soon: number; // < 30 days
    certificates_expired: number;

    // Command metrics
    commands_executed_24h: number;
    command_success_rate_percent: number;
    average_command_latency_ms: number;

    // Safety metrics
    commands_requiring_safety: number;
    safety_approvals: number;
    safety_rejections: number;
    safety_approval_rate_percent: number;

    // OTA status
    current_firmware_version: string;
    devices_on_target_version: number;
    devices_updating: number;
    devices_failed_update: number;

    // Network quality
    average_rssi_dbm: number;
    mqtt_connection_stable: boolean;
    reconnection_events_24h: number;

    // Anomalies
    active_anomalies: AnomalyType[];
}

// ============================================================================
// VALIDATION & SCHEMA HELPERS
// ============================================================================

/**
 * Type guard for telemetry events.
 */
export function isTelemetryEvent(obj: any): obj is TelemetryEvent {
    return (
        obj &&
        typeof obj === "object" &&
        "version" in obj &&
        "home_id" in obj &&
        "event_class" in obj &&
        obj.version === TELEMETRY_VERSION
    );
}

/**
 * Type guard for specific event classes.
 */
export function isDeviceHealthMetric(event: TelemetryEvent): event is DeviceHealthMetric {
    return event.event_class === "device_health";
}

export function isSecurityAnomalyEvent(event: TelemetryEvent): event is SecurityAnomalyEvent {
    return event.event_class === "security_anomaly";
}

export function isCommandExecutionEvent(event: TelemetryEvent): event is CommandExecutionEvent {
    return event.event_class === "command_execution";
}

/**
 * Sanitize sensitive data from telemetry before storage/transmission.
 */
export function sanitizeTelemetryEvent(event: TelemetryEvent): TelemetryEvent {
    // Preserve hash values and IDs, remove any raw sensitive values
    const sanitized = { ...event };

    // Ensure no raw parameters are included
    if (isCommandExecutionEvent(sanitized)) {
        // Only parameter_hash should exist, not raw parameters
        delete (sanitized as any).parameters;
        delete (sanitized as any).parameter_values;
    }

    // Ensure no raw user input in Planner events
    const plannerEvent = sanitized as any;
    if (plannerEvent.event_class === "planner_output") {
        delete plannerEvent.user_input;
        delete plannerEvent.user_request;
    }

    return sanitized;
}

/**
 * Extract trace path from execution trace.
 * Useful for incident investigation visualizations.
 */
export function extractTracePath(trace: ExecutionTrace): string {
    return trace.authority_path.join(" → ");
}

/**
 * Calculate cardinality for a given metric.
 */
export interface CardinalityEstimate {
    metric_name: string;
    per_home_cardinality: number;
    at_1000_homes: number;
    at_10000_homes: number;
    storage_days_per_home_gb: number;
    storage_1000_homes_gb: number;
    storage_10000_homes_gb: number;
}
