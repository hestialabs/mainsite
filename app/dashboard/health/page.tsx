'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Activity,
  Database,
  Wifi,
  Server,
  Shield,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Cpu,
} from 'lucide-react';

interface HealthCheck {
  name: string;
  status: boolean;
  icon: React.ReactNode;
  description: string;
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<api.HealthResponse | null>(null);
  const [systemStatus, setSystemStatus] = useState<{
    system: string;
    status: string;
    beta: boolean;
    version: string;
    protocol: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadHealth = useCallback(async () => {
    try {
      const [healthRes, statusRes] = await Promise.all([
        api.getHealth(),
        api.getSystemStatus(),
      ]);
      setHealth(healthRes.data);
      setSystemStatus(statusRes.data);
      setLastRefresh(new Date());
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Failed to load health data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadHealth();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadHealth();
    setRefreshing(false);
    toast.success('Health data refreshed');
  };

  const checks: HealthCheck[] = health
    ? [
        {
          name: 'PostgreSQL',
          status: health.checks.database,
          icon: <Database className="w-5 h-5" />,
          description: 'Primary data store — devices, tenants, commands, audit',
        },
        {
          name: 'Redis',
          status: health.checks.redis,
          icon: <Server className="w-5 h-5" />,
          description: 'Rate limiting, pub/sub, WebSocket state, session cache',
        },
        {
          name: 'MQTT Broker',
          status: health.checks.mqtt,
          icon: <Wifi className="w-5 h-5" />,
          description: 'Mosquitto mTLS broker — device command transport',
        },
        {
          name: 'Protocol Engine',
          status: health.checks.protocol_ready,
          icon: <Shield className="w-5 h-5" />,
          description: 'HxTP binary protocol, sequence authority, idempotency',
        },
      ]
    : [];

  const allHealthy = checks.every((c) => c.status);
  const healthyCount = checks.filter((c) => c.status).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold uppercase tracking-tighter">System Health</h1>
          <p className="text-xs text-muted-foreground">
            Backend infrastructure status — auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            Last: {lastRefresh.toLocaleTimeString()}
          </div>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-[10px] uppercase tracking-widest"
          >
            <RefreshCw className={`w-3 h-3 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Status */}
      <div
        className={`border p-6 flex items-center justify-between ${
          allHealthy ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
        }`}
      >
        <div className="flex items-center gap-4">
          <Activity
            className={`w-8 h-8 ${allHealthy ? 'text-green-500' : 'text-red-500'}`}
          />
          <div>
            <div className={`text-lg font-bold uppercase tracking-tighter ${allHealthy ? 'text-green-400' : 'text-red-400'}`}>
              {allHealthy ? 'All Systems Operational' : `Degraded — ${healthyCount}/${checks.length} Healthy`}
            </div>
            <div className="text-xs text-muted-foreground">
              {health?.status ?? 'unknown'} • {health?.timestamp ? new Date(health.timestamp).toLocaleString() : '—'}
            </div>
          </div>
        </div>
        <Badge
          variant={allHealthy ? 'success' : 'destructive'}
          className="text-sm px-4 py-1"
        >
          {allHealthy ? 'HEALTHY' : 'DEGRADED'}
        </Badge>
      </div>

      {/* Individual Checks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {checks.map((check) => (
          <Card key={check.name} className={`bg-card/50 ${!check.status ? 'border-red-500/30' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <div className={check.status ? 'text-green-500' : 'text-red-500'}>
                  {check.icon}
                </div>
                {check.status ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
              </div>
              <div className="text-sm font-bold uppercase tracking-widest">{check.name}</div>
              <div className="text-[9px] text-muted-foreground mt-1 leading-relaxed">
                {check.description}
              </div>
              <Badge
                variant={check.status ? 'success' : 'destructive'}
                className="text-[8px] mt-3"
              >
                {check.status ? 'CONNECTED' : 'UNREACHABLE'}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* System Info */}
      {systemStatus && (
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
              <Cpu className="w-4 h-4" /> System Information
            </CardTitle>
            <CardDescription>Backend version and protocol metadata</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground">System</div>
                <div className="text-sm font-mono font-bold">{systemStatus.system}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Version</div>
                <div className="text-sm font-mono">
                  <Badge variant="outline">{systemStatus.version}</Badge>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Protocol</div>
                <div className="text-sm font-mono">{systemStatus.protocol}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Mode</div>
                <Badge variant={systemStatus.beta ? 'secondary' : 'success'} className="text-[9px]">
                  {systemStatus.beta ? 'BETA' : 'PRODUCTION'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health Endpoints Reference */}
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-widest">Health Endpoints</CardTitle>
          <CardDescription>Backend health probe endpoints for monitoring integrations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Endpoint</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Purpose</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Auth</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="p-3 font-mono">/health</td>
                  <td className="p-3 text-muted-foreground">Full health check (DB, Redis, MQTT, Protocol)</td>
                  <td className="p-3"><Badge variant="secondary" className="text-[8px]">None</Badge></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-3 font-mono">/health/live</td>
                  <td className="p-3 text-muted-foreground">Kubernetes liveness probe</td>
                  <td className="p-3"><Badge variant="secondary" className="text-[8px]">None</Badge></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-3 font-mono">/health/ready</td>
                  <td className="p-3 text-muted-foreground">Kubernetes readiness probe</td>
                  <td className="p-3"><Badge variant="secondary" className="text-[8px]">None</Badge></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-3 font-mono">/api/v1/status</td>
                  <td className="p-3 text-muted-foreground">System version and protocol info</td>
                  <td className="p-3"><Badge variant="secondary" className="text-[8px]">None</Badge></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-3 font-mono">/metrics</td>
                  <td className="p-3 text-muted-foreground">Prometheus metrics (counters, histograms)</td>
                  <td className="p-3"><Badge variant="secondary" className="text-[8px]">None</Badge></td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
