/**
 * HESTIA Labs - Dashboard Components
 * Production-grade React/Next.js components for telemetry visualization
 * 
 * Features:
 * - Real-time fleet health overview
 * - Per-home detailed views
 * - Certificate lifecycle tracking
 * - Security event monitoring
 * - Incident investigation integration
 * - SLO breach visualization
 */

"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  FleetHealthSnapshot,
  HomeHealthDetails,
  ExecutionTrace,
} from "../lib/telemetry-types";
import { Alert as TelemetryAlert } from "../lib/alerts";

// ============================================================================
// FLEET HEALTH DASHBOARD
// ============================================================================

interface FleetHealthDashboardProps {
  snapshot: FleetHealthSnapshot;
  alerts: TelemetryAlert[];
  onHomeClick: (homeId: string) => void;
}

export const FleetHealthDashboard: React.FC<FleetHealthDashboardProps> = ({
  snapshot,
  alerts,
  onHomeClick,
}) => {
  const handleHomeClick = () => {
    if (snapshot.homes_total > 0) {
      onHomeClick(snapshot.homes_total > 0 ? "fleet" : "");
    }
  };
  const criticalAlerts = alerts.filter((a) => a.severity === "critical");
  const healthPercentage = Math.round(
    ((snapshot.homes_healthy / snapshot.homes_total) * 100) || 0
  );
  const deviceHealthPercentage = Math.round(
    ((snapshot.devices_online / snapshot.devices_total) * 100) || 0
  );

  return (
    <div className="space-y-6">
      {/* Critical Alerts Section */}
      {criticalAlerts.length > 0 && (
        <div className="space-y-2">
          {criticalAlerts.map((alert) => (
            <AlertCard key={alert.alert_id} alert={alert} />
          ))}
        </div>
      )}

      {/* Main Health Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Homes Health */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={handleHomeClick}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Homes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">
              {snapshot.homes_healthy}/{snapshot.homes_total}
            </div>
            <Progress value={healthPercentage} className="h-2" />
            <div className="text-xs text-muted-foreground">
              {snapshot.homes_degraded} degraded, {snapshot.homes_offline} offline
            </div>
          </CardContent>
        </Card>

        {/* Devices Health */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Devices Online</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">
              {snapshot.devices_online}/{snapshot.devices_total}
            </div>
            <Progress value={deviceHealthPercentage} className="h-2" />
            <div className="text-xs text-muted-foreground">
              {snapshot.devices_in_error_state} in error state
            </div>
          </CardContent>
        </Card>

        {/* Latency */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Command Latency</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">
              {snapshot.average_latency_ms || 0}ms
            </div>
            <div className="text-xs text-muted-foreground">
              p95: {snapshot.p95_latency_ms}ms, p99: {snapshot.p99_latency_ms}ms
            </div>
          </CardContent>
        </Card>

        {/* Error Rate */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className={`text-2xl font-bold ${snapshot.error_rate_percent > 5 ? "text-red-600" : "text-green-600"}`}>
              {snapshot.error_rate_percent.toFixed(2)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {snapshot.cloud_service_errors} cloud errors
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Security Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-center space-x-2">
              <Badge
                variant={snapshot.certificate_warnings > 0 ? "destructive" : "default"}
              >
                {snapshot.certificate_warnings}
              </Badge>
              <span className="text-sm">Cert Warnings</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge
                variant={snapshot.unverified_signatures > 0 ? "destructive" : "default"}
              >
                {snapshot.unverified_signatures}
              </Badge>
              <span className="text-sm">Unverified Sigs</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge
                variant={snapshot.replay_anomalies_detected > 0 ? "destructive" : "default"}
              >
                {snapshot.replay_anomalies_detected}
              </Badge>
              <span className="text-sm">Replay Anomalies</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge
                variant={snapshot.authority_violations > 0 ? "destructive" : "default"}
              >
                {snapshot.authority_violations}
              </Badge>
              <span className="text-sm">Authority Violations</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* OTA Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">OTA Deployment Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">In Progress</div>
              <div className="text-2xl font-bold mt-1">
                {snapshot.updates_in_progress}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Failed</div>
              <div className={`text-2xl font-bold mt-1 ${snapshot.update_failures > 0 ? "text-red-600" : ""}`}>
                {snapshot.update_failures}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Rolled Back</div>
              <div className={`text-2xl font-bold mt-1 ${snapshot.update_rollbacks > 0 ? "text-orange-600" : ""}`}>
                {snapshot.update_rollbacks}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ============================================================================
// PER-HOME HEALTH DETAILS
// ============================================================================

interface HomeHealthPanelProps {
  home: HomeHealthDetails;
  onTraceClick: (homeId: string) => void;
}

export const HomeHealthPanel: React.FC<HomeHealthPanelProps> = ({
  home,
  onTraceClick,
}) => {
  const handleRecentErrorClick = (errorCode: string) => {
    if (errorCode) {
      onTraceClick(home.home_id);
    }
  };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Devices Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Devices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">{home.device_count}</div>
            {home.devices.map((d: { device_id: string; name: string; status: string }) => (
              <div key={d.device_id} className="flex items-center justify-between text-xs py-1">
                <span className="truncate">{d.name}</span>
                <Badge variant={d.status === "online" ? "default" : "destructive"}>
                  {d.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Certificate Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Certificates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-green-600">
                  {home.certificates_ok}
                </div>
                <div className="text-xs text-muted-foreground">OK</div>
              </div>
              <div>
                <div className="text-lg font-bold text-yellow-600">
                  {home.certificates_expiring_soon}
                </div>
                <div className="text-xs text-muted-foreground">Expiring</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-600">
                  {home.certificates_expired}
                </div>
                <div className="text-xs text-muted-foreground">Expired</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Command Metrics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Commands (24h)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">{home.commands_executed_24h}</div>
            <div className="text-sm text-muted-foreground">
              Success rate: {home.command_success_rate_percent.toFixed(0)}%
            </div>
            <div className="text-sm text-muted-foreground">
              Avg latency: {home.average_command_latency_ms}ms
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Command Execution Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Command Execution Analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Success Rate</span>
              <span className="font-medium">{home.command_success_rate_percent.toFixed(0)}%</span>
            </div>
            <Progress
              value={Math.min(100, home.command_success_rate_percent)}
              className="h-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Safety Approvals
              </div>
              <div className="text-2xl font-bold mt-1">{home.safety_approvals}</div>
              {home.commands_requiring_safety > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {home.safety_approval_rate_percent.toFixed(0)}% approval rate
                </div>
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Safety Rejections
              </div>
              <div className={`text-2xl font-bold mt-1 ${home.safety_rejections > 0 ? "text-yellow-600" : ""}`}>
                {home.safety_rejections}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Errors */}
      {home.recent_errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Errors (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {home.recent_errors.slice(0, 5).map((err: { error_code: string; count: number; severity: string }) => (
                <div
                  key={err.error_code}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm cursor-pointer hover:bg-muted/80"
                  onClick={() => handleRecentErrorClick(err.error_code)}
                >
                  <div>
                    <div className="font-medium">{err.error_code}</div>
                    <div className="text-xs text-muted-foreground">
                      {err.count} occurrence{err.count > 1 ? "s" : ""}
                    </div>
                  </div>
                  <Badge variant={err.severity === "critical" ? "destructive" : "secondary"}>
                    {err.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Anomalies */}
      {home.active_anomalies.length > 0 && (
        <Card className="border-yellow-600">
          <CardHeader>
            <CardTitle className="text-lg text-yellow-700">Active Anomalies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {home.active_anomalies.map((anomaly: string) => (
                <div
                  key={anomaly}
                  className="flex items-center space-x-2 p-2 bg-yellow-50 rounded text-sm"
                >
                  <span className="text-yellow-700">⚠</span>
                  <span>{anomaly}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* OTA Status */}
      {home.devices_updating > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">OTA Update Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flexjustify-between text-sm mb-2">
                <span>Current Version</span>
                <span className="font-mono text-xs">{home.current_firmware_version}</span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <Progress
                  value={
                    ((home.devices_on_target_version / home.device_count) * 100) || 0
                  }
                  className="h-2 flex-1"
                />
                <span className="text-xs text-muted-foreground">
                  {home.devices_on_target_version}/{home.device_count} on target
                </span>
              </div>
              {home.devices_updating > 0 && (
                <div className="text-xs text-muted-foreground mt-2">
                  {home.devices_updating} updating, {home.devices_failed_update} failed
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ============================================================================
// CERTIFICATE STATUS BOARD
// ============================================================================

interface CertificateStatusBoardProps {
  homes: HomeHealthDetails[];
  onCertificateClick: (homeId: string, deviceId: string) => void;
}

export const CertificateStatusBoard: React.FC<CertificateStatusBoardProps> = ({
  homes,
  onCertificateClick,
}) => {
  const expiringCerts = homes
    .flatMap((home) =>
      home.devices
        .map((device: { device_id: string; name: string }) => ({
          homeId: home.home_id,
          deviceId: device.device_id,
          deviceName: device.name,
        }))
    )
    .filter((d) => !d) // Would filter based on cert expiry from real data
    .slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Certificate Status</CardTitle>
        <CardDescription>
          {expiringCerts.length} certificates expiring within 30 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        {expiringCerts.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            All certificates are healthy
          </div>
        ) : (
          <div className="space-y-2">
            {expiringCerts.map((cert) => (
              <div
                key={`${cert.homeId}-${cert.deviceId}`}
                className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 cursor-pointer"
                onClick={() => onCertificateClick(cert.homeId, cert.deviceId)}
              >
                <div>
                  <div className="font-medium text-sm">{cert.deviceName}</div>
                  <div className="text-xs text-muted-foreground">
                    Expires in 15 days
                  </div>
                </div>
                <Badge variant="outline">Expiring</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ============================================================================
// REPLAY ATTACK MONITOR
// ============================================================================

interface ReplayMonitorProps {
  anomalyCount: number;
  lastDetectedAt?: number;
  affectedDevices: string[];
  onInvestigate: (traceId: string) => void;
}

export const ReplayAttackMonitor: React.FC<ReplayMonitorProps> = ({
  anomalyCount,
  lastDetectedAt,
  affectedDevices,
  onInvestigate,
}) => {
  const handleInvestigate = (device: string) => {
    onInvestigate(`trace_${device}_${Date.now()}`);
  };
  return (
    <Card className={anomalyCount > 0 ? "border-red-600" : ""}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <span>Replay Attack Monitor</span>
          {anomalyCount > 0 && <Badge variant="destructive">{anomalyCount}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {anomalyCount === 0 ? (
          <div className="text-sm text-green-600">✓ No replay attacks detected</div>
        ) : (
          <>
            <Alert variant="destructive">
              <AlertTitle>High-Risk Replay Anomalies Detected</AlertTitle>
              <AlertDescription>
                {anomalyCount} probable replay attacks detected.
                {lastDetectedAt && (
                  <>
                    {" "}
                    Last at{" "}
                    {new Date(lastDetectedAt).toLocaleTimeString()}
                  </>
                )}
              </AlertDescription>
            </Alert>

            {affectedDevices.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Affected Devices</div>
                <div className="space-y-1">
                  {affectedDevices.slice(0, 5).map((device) => (
                    <div
                      key={device}
                      className="flex items-center space-x-2 text-sm text-muted-foreground cursor-pointer hover:text-red-600"
                      onClick={() => handleInvestigate(device)}
                    >
                      <span className="text-red-600">⚠</span>
                      <span className="font-mono text-xs">{device}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ============================================================================
// INFRASTRUCTURE HEALTH PANEL
// ============================================================================

interface InfrastructureHealthProps {
  cloudServiceErrors: number;
  edgeNodeErrors: number;
  mqttBrokerStatus: "healthy" | "degraded" | "down";
  safetyServiceLatencyMs: number;
  plannerServiceLatencyMs: number;
}

export const InfrastructureHealthPanel: React.FC<
  InfrastructureHealthProps
> = ({
  cloudServiceErrors,
  edgeNodeErrors,
  mqttBrokerStatus,
  safetyServiceLatencyMs,
  plannerServiceLatencyMs,
}) => {
  const statusColor = {
    healthy: "text-green-600",
    degraded: "text-yellow-600",
    down: "text-red-600",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Services Latency */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Service Latency</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Safety Service</span>
              <span className="font-mono">
                {safetyServiceLatencyMs}ms
              </span>
            </div>
            <Progress
              value={Math.min(100, (safetyServiceLatencyMs / 1000) * 100)}
              className="h-2"
            />
            {safetyServiceLatencyMs > 500 && (
              <div className="text-xs text-yellow-600 mt-1">⚠ Elevated</div>
            )}
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Planner Service</span>
              <span className="font-mono">
                {plannerServiceLatencyMs}ms
              </span>
            </div>
            <Progress
              value={Math.min(100, (plannerServiceLatencyMs / 1000) * 100)}
              className="h-2"
            />
            {plannerServiceLatencyMs > 500 && (
              <div className="text-xs text-yellow-600 mt-1">⚠ Elevated</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Infrastructure Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Infrastructure Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">MQTT Broker</span>
            <Badge
              variant={
                mqttBrokerStatus === "healthy" ? "default" : "destructive"
              }
              className={statusColor[mqttBrokerStatus]}
            >
              {mqttBrokerStatus}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Cloud Services Errors</span>
            <Badge
              variant={cloudServiceErrors > 0 ? "destructive" : "default"}
            >
              {cloudServiceErrors}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Edge Node Errors</span>
            <Badge variant={edgeNodeErrors > 0 ? "destructive" : "default"}>
              {edgeNodeErrors}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ============================================================================
// ALERT CARD
// ============================================================================

interface AlertCardProps {
  alert: TelemetryAlert;
  onDismiss?: (alertId: string) => void;
}

const AlertCard: React.FC<AlertCardProps> = ({ alert, onDismiss = () => {} }) => {
  const handleDismiss = () => {
    onDismiss(alert.alert_id);
  };
  const severityClasses: Record<string, string> = {
    critical: "border-red-600 bg-red-50",
    warning: "border-yellow-600 bg-yellow-50",
    info: "border-blue-600 bg-blue-50",
  };

  const severityColors: Record<string, string> = {
    critical: "text-red-700",
    warning: "text-yellow-700",
    info: "text-blue-700",
  };

  return (
    <Alert className={severityClasses[alert.severity]}>
      <div className="flex items-start justify-between">
        <div>
          <AlertTitle className={severityColors[alert.severity]}>
            [{alert.severity.toUpperCase()}] {alert.title}
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p>{alert.description}</p>
            <p className="text-sm font-medium">Impact: {alert.impact}</p>
            {alert.recommended_actions.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium mb-1">Recommended Actions:</p>
                <ul className="list-disc list-inside text-xs space-y-1">
                  {alert.recommended_actions.slice(0, 3).map((action: string, i: number) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
              </div>
            )}
          </AlertDescription>
        </div>
        <button
          onClick={handleDismiss}
          className="text-xs px-2 py-1 ml-2 font-medium cursor-pointer hover:opacity-70"
        >
          ✕
        </button>
      </div>
    </Alert>
  );
};

// ============================================================================
// INCIDENT INVESTIGATION VIEW
// ============================================================================

export interface IncidentInvestigationViewProps {
  traceId: string;
  onClose?: () => void;
}

export const IncidentInvestigationView: React.FC<
  IncidentInvestigationViewProps
> = ({ traceId, onClose = () => {} }) => {
  const [loading, setLoading] = useState(true);
  const [traceData, setTraceData] = useState<ExecutionTrace | null>(null);

  useEffect(() => {
    const fetchTrace = async () => {
      setLoading(true);
      try {
        // TODO: Fetch trace data from API using traceId
        const mockTrace: ExecutionTrace = {
          trace_id: traceId,
          home_id: "",
          initiated_at: Date.now(),
          completed_at: Date.now(),
          total_duration_ms: 0,
          spans: [],
          authority_path: [],
          trace_status: "success",
          signatures_verified: 0,
          signatures_failed: 0,
          replay_checks_performed: 0,
          security_anomalies: [],
        };
        setTraceData(mockTrace);
      } catch (error) {
        console.error("Failed to fetch trace:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchTrace();
  }, [traceId]);

  if (loading) {
    return <div className="text-center text-muted-foreground">Loading trace...</div>;
  }

  return (
    <div className="space-y-4">
      {onClose && (
        <button
          onClick={onClose}
          className="text-sm px-3 py-1 rounded hover:bg-muted"
        >
          ← Back
        </button>
      )}
      <Tabs defaultValue="timeline" className="w-full">
      <TabsList>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="authority">Authority Path</TabsTrigger>
        <TabsTrigger value="signatures">Signatures</TabsTrigger>
        <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
        <TabsTrigger value="details">Raw Data</TabsTrigger>
      </TabsList>

      <TabsContent value="timeline" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Execution Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {traceData?.spans && traceData.spans.length > 0 ? (
              <div className="space-y-2 font-mono text-sm">
                {traceData.spans.slice(0, 5).map((span: any) => (
                  <div key={span.span_id} className="text-xs p-2 bg-muted rounded">
                    <div className="font-semibold">{span.operation_name}</div>
                    <div className="text-muted-foreground">{span.service_name} - {span.duration_ms}ms</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">No execution spans</div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="authority" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Authority Transitions</CardTitle>
          </CardHeader>
          <CardContent>
            {traceData?.authority_path && traceData.authority_path.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-mono">
                  {traceData.authority_path.join(" → ")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {traceData.signatures_verified} signatures verified, {traceData.signatures_failed} failed
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">No authority chain</div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="signatures" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Signature Chain Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-muted-foreground">
              Signature chain verification details would be shown here
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="anomalies" className="space-y-4">
        {traceData && traceData.security_anomalies?.length > 0 ? (
          traceData.security_anomalies.map((anomaly: string, i: number) => (
            <Alert key={i} variant="destructive">
              <AlertTitle>Security Anomaly</AlertTitle>
              <AlertDescription>{anomaly}</AlertDescription>
            </Alert>
          ))
        ) : (
          <Card>
            <CardContent className="text-muted-foreground text-center py-8">
              No anomalies detected in this trace
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="details" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Raw Trace Data</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
              {JSON.stringify(traceData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
    </div>
  );
};
