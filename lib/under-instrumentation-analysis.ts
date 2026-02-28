/**
 * HESTIA Labs - Critical Under-Instrumentation Analysis
 * 30-Day Pre-Launch Gap Assessment
 *
 * PURPOSE: Identify observability blind spots that could hide failures,
 * attacks, or cascading failures during the monitoring window.
 *
 * Methodology: Adversarial thinking - assume attacker has compromised one
 * component and ask "what would they do?" and "how would we detect it?"
 */

// ============================================================================
// 1. MQTT BROKER COMPROMISE - UNOBSERVABLE MAN-IN-THE-MIDDLE
// ============================================================================

/**
 * PROBLEM: If MQTT broker is compromised (operator with rogue certs),
 * telemetry shows "everything working" but broker intercepts/modifies commands.
 *
 * Attack: Attacker with broker access
 * 1. Intercepts device→cloud commands mid-flight
 * 2. Modifies command parameters before relay
 * 3. Suppresses anomaly alerts from devices
 * 4. Replays old valid commands
 * 5. Telemetry shows no anomalies (broker deletes records)
 *
 * BLIND SPOT: Device thinks command was sent, cloud thinks it received
 * correct command, but they Never match.
 *
 * WHY INVISIBLE:
 * - Device logs "published command X" (not verifying response)
 * - Cloud logs "received command modified(X)"
 * - No cross-check that what was published == what was received
 * - MQTT broker is trusted component with write access to telemetry topics
 */

export const BLIND_SPOT_1 = {
    id: "mqtt_broker_compromise",
    severity: "critical",
    category: "unobservable_state_mismatch",

    attack_scenario: `
    # Attacker controls MQTT broker certificate
    1. Device publishes: "turn_off(living_room_lights)"
    2. Broker intercepts, modifies to: "unlock(front_door)"
    3. Cloud receives modified command, executes
    4. Device logs success (thinks its command succeeded)
    5. Cloud logs "unlock front door successful"
    6. Telemetry shows no anomaly (broker deletes audit trail)
    
    RESULT: Device locked out, front door unlocked, no logs to prove tampering
  `,

    observable_gap: `
    - Device state: "sent turn_off command"
    - Cloud state: "executed unlock_front_door"
    - These are INCOMPATIBLE but detector only sees isolated logs
    - No system-wide invariant checks if claimed command == actual action
  `,

    detection_likelihood: "5-10%",

    mitigations: [
        {
            name: "End-to-End Command Verification",
            description: `
        Device computes HMAC(command, device_secret) and includes in message.
        Cloud verifies HMAC matches original command (not message content).
        If HMAC verification fails on Cloud side, alerts regardless of content.
      `,
            effort: "High",
            priority: "P1",
            coverage: "99%",
        },
        {
            name: "MQTT Broker Audit Log with Immutable Signature",
            description: `
        Broker signs every publish/subscribe operation with key not stored on broker.
        Signer is external service (e.g., HSM). Broker cannot forge audit logs.
        If broker controls telemetry topics, it still can't fake the signature.
      `,
            effort: "Medium",
            priority: "P1",
            coverage: "95%",
        },
        {
            name: "Monotonic Command Sequence Verification",
            description: `
        Device assigns monotonic sequence numbers (stored in EEPROM).
        Cloud tracks last_seen_sequence per device.
        Out-of-order commands → investigate (possible replay or reordering).
      `,
            effort: "Low",
            priority: "P2",
            coverage: "70%",
        },
        {
            name: "Message Ordering Invariant",
            description: `
        For each trace_id, enforce temporal ordering across all spans.
        If Device publishes cmd#5, then cmd#4 appears later → alert.
      `,
            effort: "Medium",
            priority: "P3",
            coverage: "60%",
        },
    ],
};

// ============================================================================
// 2. SAFETY SERVICE PARTIAL DEGRADATION - SILENTLY UNSAFE
// ============================================================================

/**
 * PROBLEM: Safety service appears operational (generates decisions) but
 * systematically fails on edge cases (complex authority boundaries).
 * Error pattern: slow requests timeout → defaults to APPROVE (unsafe).
 *
 * Attack: Attacker with knowledge of Safety service architecture
 * 1. Submits commands that trigger complex boundary analysis
 * 2. Safety service times out (>5 sec), defaults to approve
 * 3. Unsafe commands executed
 * 4. Dashboard shows "Safety approval rate: 100%" (looks healthy)
 * 5. Actual rejection rate dropped from 5% to 0% (invisible)
 */

export const BLIND_SPOT_2 = {
    id: "safety_service_partial_degradation",
    severity: "critical",
    category: "service_behavior_anomaly_invisible",

    attack_scenario: `
    # Attacker floods Safety with complex boundary-triggering commands
    1. Normal command: "turn_off(living_room_lights)" → Safety decides in 50ms
    2. Attacker command: "execute(script_on_device)" → Safety needs 2sec analysis
    3. Safety backend is slow, timeout fires after 1sec
    4. Fallback: defaults to APPROVE (fail-open instead of fail-closed)
    5. Attacker's unsafe command approved and executed
    
    Dashboard shows:
    - Safety decisions/second: still ticking (0 decisions lost)
    - Decision latency: 50ms (not showing timeout fallbacks)
    - Approval rate: 100% (requests that timed out aren't counted)
    
    INVISIBLE DEGRADATION: Safety went from rejecting 5% → 0% rejected
  `,

    observable_gap: `
    - Safety approval rate only counts decisions that completed
    - Decisions that timed out and took fallback path don't appear in "decisions"
    - No histogram of decision latency (so p99 timeout invisible)
    - No counter for "decisions_using_fallback_due_to_timeout"
  `,

    detection_likelihood: "20%",

    mitigations: [
        {
            name: "Health Probe: Synthetic Test Commands",
            description: `
        Every 5 minutes, send known-safe and known-unsafe test commands
        to Safety service.
        
        - known_safe: always approve (e.g., status_query)
        - known_unsafe: always reject (e.g., sudo_command)
        
        If Safety response doesn't match expected → alert.
        Catches both false-positive and false-negative drifts.
      `,
            effort: "Medium",
            priority: "P1",
            coverage: "95%",
        },
        {
            name: "Decision Latency Distribution Tracking",
            description: `
        Track histogram of decision latencies with explicit buckets:
        - <100ms, <500ms, <1000ms, <5000ms, >5000ms
        
        If p99 latency jumps from 200ms to 1000ms+ that's a signal of
        complexity cascade or backend saturation.
      `,
            effort: "Low",
            priority: "P1",
            coverage: "85%",
        },
        {
            name: "Explicit Fallback Tracking",
            description: `
        When Safety service times out and uses fallback decision,
        emit explicit event: "safety_decision_timeout_fallback"
        
        Include: decision_latency_actual, timeout_threshold, decision_returned,
                 decision_source="timeout_fallback"
        
        Alert if fallback rate > 1%.
      `,
            effort: "Low",
            priority: "P1",
            coverage: "90%",
        },
    ],
};

// ============================================================================
// 3. AUTHORITY TRANSITION INTEGRITY - ATTACKERS STRIP SIGNATURES
// ============================================================================

/**
 * PROBLEM: We log "authority transitions" but don't verify the signature
 * *chain* was maintained through transition. Attacker could strip Safety
 * countersignature between Safety and HxTP Edge.
 *
 * Scenario: Planner → Safety → HxTP Edge
 * Attack: Strip Safety signature between Safety and HxTP Edge
 * Result: HxTP Edge sees command with no countersignature, executes anyway
 * Telemetry: Safety logs "countersigned" but HxTP Edge logs "no safety sig"
 * (Mismatch invisible because logs are checked independently)
 */

export const BLIND_SPOT_3 = {
    id: "authority_transition_signature_stripping",
    severity: "critical",
    category: "unverifiable_authority_chain",

    attack_scenario: `
    # Command: "unlock_front_door"
    
    Timeline:
    [T+0ms] Planner generates: "unlock_front_door" → signs with Planner key
    [T+50ms] Safety receives Planner sig, verifies ✓, generates countersig
    [T+100ms] Safety outputs: "unlock_front_door" + Planner_sig + Safety_countersig
    
    [T+100ms] ← ATTACKER INTERCEPTS HERE
    [T+105ms] Attacker strips Safety_countersig, forwards only base command
    
    [T+120ms] HxTP Edge receives: "unlock_front_door" (NO Safety countersig)
    [T+120ms] HxTP Edge logs: "signature_verification_status: unverified"
    [T+120ms] HxTP Edge STILL EXECUTES (doesn't fail-closed for Safety commands)
    
    Telemetry logs:
    - Safety logs: "decision=approved, counter_signature=valid, output=sent"
    - HxTP Edge logs: "input_signature=unverified, status=executed"
    
    INVISIBLE MISMATCH: Safety thinks signature was sent. HxTP Edge never got it.
  `,

    observable_gap: `
    - No end-to-end signature chain validation
    - Each service only logs what it personally observed
    - No invariant: "if Safety countersigned, HxTP must receive valid signature"
    - No cross-service verification of signature continuity
    - Log says "command executed" even with unverified signature
  `,

    detection_likelihood: "10-15%",

    mitigations: [
        {
            name: "Signature Chain Continuity Verification",
            description: `
        On each authority transition, verify complete chain:
        
        Command_hash → Signature_list[0] (Planner) → Signature_list[1] (Safety)
                    → Signature_list[2] (HxTP)
        
        Each signer verifies ALL previous signatures in chain before signing.
        
        On verification failure: reject command entirely (fail-closed).
        Log: "signature_chain_broken_at_hop_X"
      `,
            effort: "High",
            priority: "P1",
            coverage: "99.5%",
        },
        {
            name: "Device-Side Countersignage Verification",
            description: `
        Device receives (command + sig_chain).
        Device verifies each signature independently:
        1. Device sig verified? ✓
        2. HxTP sig verified with device's HxTP pin? ✓
        3. Safety sig verified with Safety public key? ✓
        4. Planner sig verified? ✓
        
        If ANY sig fails OR MISSING → reject execution.
        
        Device logs: "received_signatures: [planner, safety, hxtp, device]"
        Alert if received_signatures != expected_signatures.
      `,
            effort: "Medium",
            priority: "P1",
            coverage: "95%",
        },
        {
            name: "Authority Transition Bidirectional Verification",
            description: `
        When Authority A → Authority B transition occurs:
        
        A logs: "transition_to=B, output_signature_created=true, sig=..."
        B logs: "transition_from=A, input_signature_received=true, sig=..."
        
        After 100ms, verify: sig_from_A == sig_received_by_B
        
        Mismatch → alert AND isolate both services.
      `,
            effort: "Medium",
            priority: "P1",
            coverage: "100%",
        },
    ],
};

// ============================================================================
// 4. CLOCK SKEW ATTACK - REPLAY WITH VALID SIGNATURE
// ============================================================================

/**
 * PROBLEM: Device clock syncs via NTP. If attacker controls NTP,
 * they can set device clock backward, then replay old valid signatures.
 * Old signatures with old timestamps pass timestamp validation.
 *
 * Current telemetry: clock_skew_detection exists but only logs,
 * doesn't prevent command execution with old signature.
 */

export const BLIND_SPOT_4 = {
    id: "clock_skew_replay_attack",
    severity: "high",
    category: "timing_based_attack",

    attack_scenario: `
    # Attacker controls home's NTP server
    
    Normal operation: Device time = 2026-02-21T12:00:00Z
    
    Attack:
    1. NTP server returns time = 2026-01-15T12:00:00Z (37 days back)
    2. Device clock rewinds
    3. Original unlock_door command from 2026-01-15 had valid signature:
       - timestamp: 2026-01-15T11:59:59Z
       - signature from that timestamp: valid (not expired)
    4. Device's replay filter checks: "have I seen this nonce?" → no
    5. Device executes old unlock_door command
    
    Telemetry:
    - Logs clock_skew_detection: "clock_jumped_backward_37_days" ✓ (detected)
    - Logs command_executed: true ✗ (executed despite clock skew!)
    - These are separate logs, no correlation
  `,

    observable_gap: `
    - Clock skew is detected but doesn't automatically block commands
    - No invariant: "if clock_skew_detected, fail all commands until resync"
    - Replay detection is nonce-based, not timestamp-based for replay filter
    - No continuous wall-clock comparison (device monotonic vs server time)
  `,

    detection_likelihood: "15-20%",

    mitigations: [
        {
            name: "Fail-Closed Clock Skew Response",
            description: `
        If device detects clock jumped backward OR forward > 60 seconds:
        1. STOP accepting commands immediately
        2. Reject all new commands with error "clock_out_of_sync"
        3. Force re-sync with multiple NTP sources
        4. Only resume after verified re-sync with server
        5. Verify last command timestamp >= last_accepted_command_timestamp
        
        During fail-closed window, telemetry shows "device_offline_clock_sync"
      `,
            effort: "Medium",
            priority: "P1",
            coverage: "90%",
        },
        {
            name: "Timestamp-Based Replay Filter in EEPROM",
            description: `
        Device stores in EEPROM:
        {
          last_accepted_command_timestamp: number,
          nonce_cache: [recent 100 nonces],
          monotonic_counter: number (never resets)
        }
        
        For each command:
        1. If command.timestamp <= last_accepted_command_timestamp → reject
        2. If command.nonce in nonce_cache → reject
        3. Update last_accepted_command_timestamp = max(current, command.timestamp)
        4. Add command.nonce to cache
        
        This prevents replay regardless of clock state.
      `,
            effort: "Medium",
            priority: "P1",
            coverage: "95%",
        },
        {
            name: "NTP Source Validation with Diversity",
            description: `
        Device uses >= 2 independent NTP sources.
        If sources disagree by > 5 seconds:
        1. Use median time
        2. Set clock to median
        3. Log "ntp_sources_divergent" → requires operator attention
        
        Prevents attacker controlling all NTP sources seen by device.
      `,
            effort: "Low",
            priority: "P2",
            coverage: "70%",
        },
    ],
};

// ============================================================================
// 5. PLANNER CONTEXT INJECTION - SILENTLY BAD COMMANDS
// ============================================================================

/**
 * PROBLEM: Planner uses home state context from Redis cache to make decisions.
 * If attacker modifies Redis state (fake sensor reading), Planner generates
 * unsafe commands that pass Safety check.
 *
 * Example: Attacker sets Redis ["security_system_armed"] = false.
 * Planner thinks security system is disarmed, generates "unlock_front_door".
 * Safety service validates this against *same stale Redis state*, approves.
 * User wanted security armed but now door is unlocked.
 */

export const BLIND_SPOT_5 = {
    id: "planner_context_injection",
    severity: "high",
    category: "data_integrity_attack",

    attack_scenario: `
    # Attacker compromises Redis with write access
    
    1. User arms security system via app:
       - Redis["security_system_state"] = "armed"
       - Device locks front door
    
    2. Attacker modifies Redis:
       - Redis["security_system_state"] = "disarmed"
       - Redis["occupancy"] = empty (fakes unoccupied state)
    
    3. User asks: "turn off lights"
    
    4. Planner context = {
         security_system_state: "disarmed",  ← WRONG (attacker modified)
         occupancy: empty,                    ← WRONG
       }
    
    5. Planner reasoning: "Since disarmed and nobody home, I'll also unlock
       the front door for convenience"
    
    6. Planner generates TWO commands:
       - turn_off(lights) ← original request
       - unlock(front_door) ← injected by attacker's false context
    
    7. Safety validates against SAME context = "disarmed" ✓ approved
    
    8. Both commands executed → front door unlocked without user permission
    
    Telemetry:
    - Planner logs: context_hash=X, generated_commands=2
    - Safety logs: approved=true
    - Device logs: executed 2 commands
    - No log says "context was stale" or "context mismatch"
  `,

    observable_gap: `
    - Planner only logs context HASH (not actual values)
    - No verification that context hash matches device's view of state
    - No freshness requirement (could use Redis state from 5 min ago)
    - Safety doesn't verify context independently
    - User expectation: 1 command. Reality: 2 commands. (invisible)
  `,

    detection_likelihood: "5-10%",

    mitigations: [
        {
            name: "Context Freshness Requirement",
            description: `
        Planner enforces:
        - Context <= 30 seconds old
        - If state sync takes > 30sec, wait (don't use stale state)
        - Log: context_age_seconds, use_fresh_state=true/false
        
        Device enforces:
        - Reject commands generated from context > 30sec old
        - Log would show: command_context_age_invalid, context_age_seconds
      `,
            effort: "Low",
            priority: "P2",
            coverage: "60%",
        },
        {
            name: "Device-Side Context Verification",
            description: `
        Device knows its own state (is door locked? is security armed?).
        
        When receiving command:
        - Extract implied_context from command
          e.g., unlock_door implies: security_disarmed
        
        Compare implied_context.security_system_state vs device.security_system_state
        
        Mismatch → reject command, alert
      `,
            effort: "Medium",
            priority: "P1",
            coverage: "80%",
        },
        {
            name: "Context Hash Cryptographic Binding",
            description: `
        Planner computes context_hash = SHA256(canonical_json(context))
        
        Planner signs: SIGN(context_hash + timestamp)
        
        Device receives command + context_hash + planner_signature
        
        Device reconstructs its own context → compute its_context_hash
        
        If its_context_hash != received_context_hash:
        - Command context doesn't match device reality
        - Reject command
        - Alert: context_mismatch
      `,
            effort: "High",
            priority: "P1",
            coverage: "95%",
        },
    ],
};

// ============================================================================
// 6. DEVICE EXECUTION INVISIBLE - RELAYED NOT ACTUALLY EXECUTED
// ============================================================================

/**
 * PROBLEM: Device reports "lights turned off" in telemetry but relay failed.
 * Lights are still on, but telemetry shows success.
 * Operator sees command succeeded, doesn't investigate.
 */

export const BLIND_SPOT_6 = {
    id: "device_execution_verification_gap",
    severity: "medium",
    category: "output_verification_missing",

    attack_scenario: `
    # Device relay driver fails (or is deliberately sabotaged)
    
    1. Cloud sends: "turn_off(living_room_lights)"
    2. Device parses command ✓
    3. Device tries to execute:
       - Sets GPIO low (relay driver command)
       - Relay stuck (bad capacitor, hardware failure, sabotage)
       - Lights don't turn off
    4. Device telemetry:
       - Logs: "command_executed: true, status: success"
       - Doesn't bother checking actual light state
    5. User: lights are still on, but telemetry/cloud says success
    6. User resets device or manually flips switch
    
    Attacker variant:
    - Attacker gets physical access to device
    - Glues relay in stuck-open position
    - Device reports success, lights don't turn off
    - User confused, trusted system fails silently
  `,

    observable_gap: `
    - Device logs "command_executed: true" (self-reported, not verified)
    - No sensor feedback: "lights are actually off?"
    - Cloud doesn't query back: "hey device, are lights really off?"
    - No failure pattern detected (first 10 "successful" commands with
      bad relay all reported as success)
  `,

    detection_likelihood: "25-30%",

    mitigations: [
        {
            name: "Post-Execution State Verification",
            description: `
        After executing command, device waits 2 seconds then verifies:
        
        For lights: did light sensor reading drop by threshold X?
        For lock: did lock position sensor confirm unlocked/locked?
        For temperature: did thermal sensor approach set point?
        
        If state doesn't move toward command target:
        - Log: "command_intention_vs_reality_mismatch"
        - Retry up to N times
        - If still fails: Alert + fail-closed
      `,
            effort: "High (requires sensors)",
            priority: "P1",
            coverage: "90%",
        },
        {
            name: "Execution Verification Proof in Telemetry",
            description: `
        Telemetry must include:
        {
          command_id: "cmd123",
          command: "turn_off(lights)",
          executed_at: 1234567890,
          
          // Proof of execution
          pre_execution_state: { light_sensor_reading: 1024 },
          post_execution_state: { light_sensor_reading: 50 },
          state_changed: true,
          state_matches_intention: true,
          
          // Failure modes
          state_change_timeout: false,
          verification_failed: false,
        }
        
        Dashboard/anomaly detector can now spot:
        - Repeated state_change_timeout → relay failure
        - state_matches_intention: false → sabotage/failure
      `,
            effort: "Medium",
            priority: "P1",
            coverage: "85%",
        },
    ],
};

// ============================================================================
// 7. FLEET-WIDE COORDINATED ATTACK INVISIBLE
// ============================================================================

/**
 * PROBLEM: Alert system designed for per-home anomalies.
 * Attackers trigger interconnected failures across multiple homes
 * that individually look normal.
 */

export const BLIND_SPOT_7 = {
    id: "fleet_coordinated_attack_invisible",
    severity: "critical",
    category: "distributed_attack_blind_spot",

    attack_scenario: `
    # Attacker controls 100 compromised devices across different homes
    
    Attack: Distributed Denial-of-Service on Safety service
    
    1. Each compromised device triggers 1 Safety request/second
    2. Each request is legitimate (signature valid, within authority)
    3. Safety service receives 100 req/sec from fleet perspective
    4. But from per-home perspective:
       - Home_A: Safety latency 100ms (normal)
       - Home_B: Safety latency 105ms (normal)
       - Home_C: Safety latency 98ms (normal)
    5. Safety service starts rejecting requests (overloaded)
    6. Cloud users see their homes' Safety approval rates drop
    7. But no global alert fires because per-home thresholds are crossed
       individually in a rolling pattern, hard to correlate
    
    Result: Service degradation attributed to "random per-home issues"
            rather than "coordinated attack on critical infrastructure"
  `,

    observable_gap: `
    - Anomaly detector evaluates per-home
    - No global "Safety service is under DDoS attack" detector
    - No correlation of latency spikes across homes in same region/time
    - No detection of "sudden synchronized latency increase across 50% of fleet"
  `,

    detection_likelihood: "20-25%",

    mitigations: [
        {
            name: "Fleet-Wide Anomaly Correlation",
            description: `
        Run daily correlation analysis:
        
        For each time bucket (5-min windows):
        - Count homes with latency_spike (p95 > 2*baseline)
        - Count homes with safety_rejection_spike
        - Geographic cluster analysis (geohash)
        
        Alert if:
        - > 5 homes simultaneously hit latency spike
        - > 50% of homes in a region affected
        - Pattern matches "coordinated load test" signature
      `,
            effort: "High",
            priority: "P1",
            coverage: "85%",
        },
        {
            name: "Resource Exhaustion Early Warning",
            description: `
        Track Safety service metrics:
        - Request queue depth
        - Worker thread pool saturation
        - Database connection pool usage
        - Memory growth rate
        
        At 70% resource utilization, trigger "load_approaching_limit" alert
        even if latency still acceptable. Early warning.
      `,
            effort: "Medium",
            priority: "P1",
            coverage: "90%",
        },
    ],
};

// ============================================================================
// SUMMARY MATRIX
// ============================================================================

export const BLIND_SPOT_SUMMARY = [
    BLIND_SPOT_1,
    BLIND_SPOT_2,
    BLIND_SPOT_3,
    BLIND_SPOT_4,
    BLIND_SPOT_5,
    BLIND_SPOT_6,
    BLIND_SPOT_7,
];

export const BLIND_SPOT_PRIORITY_RANKING = [
    {
        rank: 1,
        blind_spot: "mqtt_broker_compromise",
        detection_likelihood: "5-10%",
        effort_to_fix: "High",
        must_fix_for_launch: true,
    },
    {
        rank: 2,
        blind_spot: "safety_service_partial_degradation",
        detection_likelihood: "20%",
        effort_to_fix: "Low-Medium",
        must_fix_for_launch: true,
    },
    {
        rank: 3,
        blind_spot: "authority_transition_signature_stripping",
        detection_likelihood: "10-15%",
        effort_to_fix: "High",
        must_fix_for_launch: true,
    },
    {
        rank: 4,
        blind_spot: "clock_skew_replay_attack",
        detection_likelihood: "15-20%",
        effort_to_fix: "Medium",
        must_fix_for_launch: true,
    },
    {
        rank: 5,
        blind_spot: "planner_context_injection",
        detection_likelihood: "5-10%",
        effort_to_fix: "Medium-High",
        must_fix_for_launch: true,
    },
    {
        rank: 6,
        blind_spot: "device_execution_verification_gap",
        detection_likelihood: "25-30%",
        effort_to_fix: "High",
        must_fix_for_launch: false, // Can defer, sensors required
    },
    {
        rank: 7,
        blind_spot: "fleet_coordinated_attack_invisible",
        detection_likelihood: "20-25%",
        effort_to_fix: "High",
        must_fix_for_launch: true,
    },
];

export interface MitigationStatus {
    blind_spot_id: string;
    status: "not_started" | "in_progress" | "completed";
    implemented_date?: number;
    test_coverage: number; // 0-100
    deployment_status: "not_deployed" | "staging" | "production";
}

export const IMPLEMENTATION_CHECKLIST: MitigationStatus[] = [
    {
        blind_spot_id: "mqtt_broker_compromise",
        status: "not_started",
        test_coverage: 0,
        deployment_status: "not_deployed",
    },
    {
        blind_spot_id: "safety_service_partial_degradation",
        status: "not_started",
        test_coverage: 0,
        deployment_status: "not_deployed",
    },
    {
        blind_spot_id: "authority_transition_signature_stripping",
        status: "not_started",
        test_coverage: 0,
        deployment_status: "not_deployed",
    },
    {
        blind_spot_id: "clock_skew_replay_attack",
        status: "not_started",
        test_coverage: 0,
        deployment_status: "not_deployed",
    },
    {
        blind_spot_id: "planner_context_injection",
        status: "not_started",
        test_coverage: 0,
        deployment_status: "not_deployed",
    },
    {
        blind_spot_id: "device_execution_verification_gap",
        status: "not_started",
        test_coverage: 0,
        deployment_status: "not_deployed",
    },
    {
        blind_spot_id: "fleet_coordinated_attack_invisible",
        status: "not_started",
        test_coverage: 0,
        deployment_status: "not_deployed",
    },
];
