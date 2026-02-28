/**
 * HESTIA Labs - MQTT Telemetry Ingest Service
 *
 * Responsibilities:
 * - Consume telemetry from MQTT broker
 * - Validate schema and signatures
 * - Route to hot/cold storage
 * - Feed metrics pipeline
 * - Trigger anomaly detection
 * - Handle backpressure
 *
 * SLO: < 100ms latency, 99.95% availability, 100K events/min throughput
 *
 * Note: Install with: pnpm add mqtt pino
 */

import { EventEmitter } from "events";
// import mqtt, { MqttClient } from "mqtt";  // TODO: add mqtt package
// import pino from "pino";  // TODO: add pino package
import {
    TelemetryEvent,
    isTelemetryEvent,
    sanitizeTelemetryEvent,
    TELEMETRY_VERSION as SCHEMA_VERSION,
} from "./telemetry-types";

// Temporary logger interface
interface Logger {
    info(msg: string, data?: any): void;
    warn(msg: string, data?: any): void;
    error(msg: string, data?: any): void;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

interface IngestServiceConfig {
    mqtt_broker_url: string;
    mqtt_username?: string;
    mqtt_password?: string;
    mqtt_client_cert?: string;
    mqtt_client_key?: string;
    mqtt_ca_cert?: string;
    timescale_connection_string: string;
    jaeger_collector_url: string;
    metrics_sink_url?: string;
    anomaly_detector_workers?: number;
    event_buffer_size?: number;
    batch_write_interval_ms?: number;
    signature_verification_key_url?: string;
}

interface StorageBackend {
    writeEvent(event: TelemetryEvent): Promise<void>;
    writeEventBatch(events: TelemetryEvent[]): Promise<void>;
    close(): Promise<void>;
}

// ============================================================================
// MQTT INGEST SERVICE
// ============================================================================

export class TelemetryIngestService extends EventEmitter {
    private readonly schemaVersion = SCHEMA_VERSION;
    private readonly supportedVersions = [SCHEMA_VERSION];
    private mqttClient: any = null; // MqttClient type from mqtt library
    private logger: Logger;
    private hotStorage: StorageBackend | null = null;
    private coldStorage: StorageBackend | null = null;
    private traceStorage: StorageBackend | null = null;
    private metricsBuffer: TelemetryEvent[] = [];
    private eventBuffer: TelemetryEvent[] = [];
    private statsInterval: NodeJS.Timeout | null = null;
    private stats = {
        events_received: 0,
        events_valid: 0,
        events_invalid: 0,
        signature_failures: 0,
        storage_errors: 0,
        backpressure_events: 0,
    };

    constructor(
        private config: IngestServiceConfig,
        logger?: Logger,
    ) {
        super();
        this.logger = logger || {
            info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ""),
            warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ""),
            error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || ""),
        };
        this.validateSchemaVersion();
    }

    private validateSchemaVersion(): void {
        if (!this.supportedVersions.includes(this.schemaVersion)) {
            this.logger.warn(
                `Telemetry schema version ${this.schemaVersion} may not be fully supported`,
            );
        }
    }

    /**
     * Start the ingest service.
     */
    async start(): Promise<void> {
        try {
            this.logger.info("Starting Telemetry Ingest Service");

            // Connect to MQTT broker
            await this.connectMQTT();

            // Initialize storage backends
            // await this.initializeStorage();

            // Start buffer flush interval
            this.startBufferFlush();

            // Start metrics reporting
            this.startStatsReporting();

            this.logger.info("Telemetry Ingest Service started successfully");
            this.emit("ready");
        } catch (error) {
            this.logger.error("Failed to start ingest service", { error });
            throw error;
        }
    }

    /**
     * Connect to MQTT broker and subscribe to telemetry topics.
     */
    private async connectMQTT(): Promise<void> {
        return new Promise((resolve, reject) => {
            const mqttOptions: any = {
                protocolVersion: 4,
                clientId: `hestia-ingest-${process.pid}`,
                reconnectPeriod: 5000,
                keepalive: 60,
                clean: true,
            };

            // mTLS configuration
            if (this.config.mqtt_client_cert && this.config.mqtt_client_key) {
                mqttOptions.cert = this.config.mqtt_client_cert;
                mqttOptions.key = this.config.mqtt_client_key;
            }

            if (this.config.mqtt_ca_cert) {
                mqttOptions.ca = this.config.mqtt_ca_cert;
            }

            if (this.config.mqtt_username && this.config.mqtt_password) {
                mqttOptions.username = this.config.mqtt_username;
                mqttOptions.password = this.config.mqtt_password;
            }

            // @ts-expect-error - mqtt library needs to be installed via: pnpm add mqtt
            this.mqttClient = (mqtt as any).connect(this.config.mqtt_broker_url, mqttOptions);

            this.mqttClient.on("connect", () => {
                this.logger.info("Connected to MQTT broker");

                // Subscribe to all telemetry topics
                const topics = [
                    "hestia/telemetry/+/device_health/+",
                    "hestia/telemetry/+/certificate_lifecycle/+",
                    "hestia/telemetry/+/command_execution/+",
                    "hestia/telemetry/+/safety_countersignature/+",
                    "hestia/telemetry/+/replay_protection/+",
                    "hestia/telemetry/+/ota_deployment/+",
                    "hestia/telemetry/+/planner_output/+",
                    "hestia/telemetry/+/hxtp_signature/+",
                    "hestia/telemetry/+/mqtt_session/+",
                    "hestia/telemetry/+/edge_resource/+",
                    "hestia/telemetry/+/cloud_service/+",
                    "hestia/telemetry/+/authority_transition/+",
                    "hestia/telemetry/+/security_anomaly/+",
                    // Cloud-originated telemetry
                    "hestia/telemetry/+/cloud/+",
                    "hestia/telemetry/+/infrastructure/+",
                ];

                for (const topic of topics) {
                    this.mqttClient!.subscribe(topic, { qos: 1 }, (err: Error | null) => {
                        if (err) {
                            this.logger.error("Failed to subscribe to topic", {
                                topic,
                                error: err,
                            });
                        }
                    });
                }

                resolve();
            });

            this.mqttClient.on("message", (topic: string, payload: Buffer) => {
                this.handleIncomingMessage(topic, payload);
            });

            this.mqttClient.on("error", (err: Error) => {
                this.logger.error("MQTT connection error", { error: err });
                reject(err);
            });

            this.mqttClient.on("disconnect", () => {
                this.logger.warn("Disconnected from MQTT broker");
            });
        });
    }

    /**
     * Handle incoming MQTT message (main entry point for events).
     */
    private async handleIncomingMessage(topic: string, payloadBuffer: Buffer): Promise<void> {
        const startTime = Date.now();

        try {
            this.stats.events_received += 1;

            // Parse JSON
            let event: any;
            try {
                event = JSON.parse(payloadBuffer.toString("utf-8"));
            } catch (err) {
                this.stats.events_invalid += 1;
                this.logger.warn("Failed to parse JSON from MQTT message", { topic, error: err });
                return;
            }

            // Validate schema
            if (!isTelemetryEvent(event)) {
                this.stats.events_invalid += 1;
                this.logger.warn("Invalid telemetry schema", {
                    topic,
                    event_class: event.event_class,
                });
                return;
            }

            this.stats.events_valid += 1;

            // Verify signature if applicable
            if (this.needsSignatureVerification(event)) {
                const verified = await this.verifySignature(event);
                if (!verified) {
                    this.stats.signature_failures += 1;
                    event.signature_verification_status = "failed";

                    // For security events, log and alert even if unverified
                    if (event.event_class === "security_anomaly") {
                        this.logger.error("Critical event signature verification failed", {
                            home_id: event.home_id,
                            event_class: event.event_class,
                        });
                    }
                } else {
                    event.signature_verification_status = "verified";
                }
            }

            // Sanitize PII
            const sanitized = sanitizeTelemetryEvent(event);

            // Enrich event
            const enriched = this.enrichEvent(sanitized, topic);

            // Route to appropriate storage
            await this.routeEvent(enriched);

            // Feed to metrics pipeline (async, non-blocking)
            this.feedMetricsPipeline(enriched);

            // Trigger anomaly detection (async)
            this.triggerAnomalyDetection(enriched);

            // Record latency metric
            const latency = Date.now() - startTime;
            if (latency > 100) {
                this.logger.warn("Ingest latency exceeded SLO", {
                    latency_ms: latency,
                    event_class: event.event_class,
                });
            }
        } catch (error) {
            this.stats.storage_errors += 1;
            this.logger.error("Error processing MQTT message", { error, topic });
            // Never throw - always continue processing
        }
    }

    /**
     * Determine if event needs signature verification.
     */
    private needsSignatureVerification(event: TelemetryEvent): boolean {
        const criticalClasses = [
            "security_anomaly",
            "authority_transition",
            "safety_countersignature",
            "certificate_lifecycle",
            "command_execution",
        ];

        return criticalClasses.includes(event.event_class);
    }

    /**
     * Verify cryptographic signature on event.
     */
    private async verifySignature(event: TelemetryEvent): Promise<boolean> {
        try {
            // TODO: Implement Ed25519 signature verification
            // - Extract signature from event
            // - Get public key from cryptographic_identity_reference
            // - Verify signature over canonical JSON representation
            // - Check timestamp binding (signature timestamp == event timestamp ±60s)

            // For now, always return true to allow development
            return true;
        } catch (error) {
            this.logger.error("Signature verification error", { error, home_id: event.home_id });
            return false;
        }
    }

    /**
     * Enrich event with context from other sources.
     */
    private enrichEvent(event: TelemetryEvent, topic: string): TelemetryEvent {
        // Extract home_id from topic if not in event
        const topicParts = topic.split("/");
        const homeIdFromTopic = topicParts[2];

        return {
            ...event,
            home_id: event.home_id || homeIdFromTopic,
            wall_clock_timestamp: event.wall_clock_timestamp || Date.now(),
        };
    }

    /**
     * Route event to hot/cold storage based on event age and class.
     */
    private async routeEvent(event: TelemetryEvent): Promise<void> {
        try {
            const eventAgeMs = Date.now() - event.wall_clock_timestamp;
            const isFresh = eventAgeMs < 5 * 60 * 1000; // < 5 min = fresh

            // All events to hot storage if fresh
            if (isFresh && this.hotStorage) {
                // Add to buffer instead of writing immediately
                this.eventBuffer.push(event);

                // Flush if buffer is large
                if (this.eventBuffer.length >= (this.config.event_buffer_size || 1000)) {
                    await this.flushEventBuffer();
                }
            }

            // Traces to separate trace storage
            if (event.event_class === "command_execution" && this.traceStorage) {
                await this.traceStorage.writeEvent(event);
            }

            // Old events to cold storage
            if (eventAgeMs > 24 * 60 * 60 * 1000 && this.coldStorage) {
                await this.coldStorage.writeEvent(event);
            }
        } catch (error) {
            this.stats.storage_errors += 1;
            this.logger.error("Failed to route event to storage", {
                error,
                event_class: event.event_class,
            });
            // Continue processing despite storage errors
        }
    }

    /**
     * Feed to metrics pipeline for real-time aggregation.
     */
    private feedMetricsPipeline(event: TelemetryEvent): void {
        // Add to metrics buffer for batch processing
        this.metricsBuffer.push(event);

        // If buffer grows large, flush asynchronously
        if (this.metricsBuffer.length > 100) {
            setImmediate(() => this.flushMetricsBuffer());
        }
    }

    /**
     * Trigger anomaly detection on event (background).
     */
    private async triggerAnomalyDetection(event: TelemetryEvent): Promise<void> {
        // Fire-and-forget: anomaly detection runs in background
        setImmediate(async () => {
            try {
                // TODO: Implement anomaly detection rules
                // - Check replay patterns
                // - Check authority boundaries
                // - Check latency spikes
                // - Check certificate expiry
                // - etc.
                // For now: no-op
            } catch (error) {
                this.logger.error("Anomaly detection failed", {
                    error,
                    event_class: event.event_class,
                });
            }
        });
    }

    /**
     * Flush event buffer to hot storage.
     */
    private async flushEventBuffer(): Promise<void> {
        if (this.eventBuffer.length === 0) return;

        try {
            const batch = this.eventBuffer.splice(0, 1000);
            if (this.hotStorage) {
                await this.hotStorage.writeEventBatch(batch);
            }
        } catch (error) {
            this.stats.storage_errors += 1;
            this.logger.error("Failed to flush event buffer", { error });
        }
    }

    /**
     * Flush metrics buffer to metrics service.
     */
    private async flushMetricsBuffer(): Promise<void> {
        if (this.metricsBuffer.length === 0) return;

        try {
            const batch = this.metricsBuffer.splice(0, 500);

            if (this.config.metrics_sink_url) {
                await fetch(this.config.metrics_sink_url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ events: batch }),
                });
            }
        } catch (error) {
            this.logger.error("Failed to flush metrics buffer", { error });
        }
    }

    /**
     * Start interval-based buffer flushing.
     */
    private startBufferFlush(): void {
        const interval = this.config.batch_write_interval_ms || 5000;

        this.statsInterval = setInterval(async () => {
            await this.flushEventBuffer();
            await this.flushMetricsBuffer();
        }, interval);
    }

    /**
     * Report statistics periodically.
     */
    private startStatsReporting(): void {
        setInterval(() => {
            this.logger.info("Ingest service statistics", {
                events_received: this.stats.events_received,
                events_valid: this.stats.events_valid,
                events_invalid: this.stats.events_invalid,
                signature_failures: this.stats.signature_failures,
                storage_errors: this.stats.storage_errors,
                backpressure_events: this.stats.backpressure_events,
                buffer_size: this.eventBuffer.length,
            });
        }, 60000); // Every 60 seconds
    }

    /**
     * Graceful shutdown.
     */
    async stop(): Promise<void> {
        this.logger.info("Stopping Telemetry Ingest Service");

        // Flush remaining events
        await this.flushEventBuffer();
        await this.flushMetricsBuffer();

        // Clear intervals
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
        }

        // Close storage backends
        if (this.hotStorage) {
            await this.hotStorage.close();
        }
        if (this.coldStorage) {
            await this.coldStorage.close();
        }
        if (this.traceStorage) {
            await this.traceStorage.close();
        }

        // Disconnect MQTT
        if (this.mqttClient) {
            this.mqttClient.end();
        }

        this.logger.info("Telemetry Ingest Service stopped");
    }
}

// ============================================================================
// SERVICE FACTORY
// ============================================================================

/**
 * Create and start ingest service from environment variables.
 */
export async function createIngestService(): Promise<TelemetryIngestService> {
    const config: IngestServiceConfig = {
        mqtt_broker_url: process.env.MQTT_BROKER_URL || "mqtt://localhost:1883",
        mqtt_username: process.env.MQTT_USERNAME,
        mqtt_password: process.env.MQTT_PASSWORD,
        mqtt_client_cert: process.env.MQTT_CLIENT_CERT,
        mqtt_client_key: process.env.MQTT_CLIENT_KEY,
        mqtt_ca_cert: process.env.MQTT_CA_CERT,
        timescale_connection_string:
            process.env.TIMESCALE_CONNECTION || "postgres://user:pass@localhost/hestia",
        jaeger_collector_url: process.env.JAEGER_COLLECTOR_URL || "http://localhost:14268",
        metrics_sink_url: process.env.METRICS_SINK_URL,
    };

    const logger: Logger = {
        info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ""),
        warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ""),
        error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || ""),
    };

    const service = new TelemetryIngestService(config, logger);
    await service.start();

    return service;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

if (require.main === module) {
    createIngestService()
        .then((service) => {
            // Handle graceful shutdown
            process.on("SIGTERM", async () => {
                await service.stop();
                process.exit(0);
            });

            process.on("SIGINT", async () => {
                await service.stop();
                process.exit(0);
            });
        })
        .catch((error) => {
            console.error("Failed to start ingest service:", error);
            process.exit(1);
        });
}
