'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Cpu, Activity, Shield, Wifi } from 'lucide-react';

export default function DashboardOverview() {
  const { token } = useAuth();
  const [devices, setDevices] = useState<api.Device[]>([]);
  const [homes, setHomes] = useState<api.Home[]>([]);
  const [rooms, setRooms] = useState<api.Room[]>([]);
  const [health, setHealth] = useState<api.HealthResponse | null>(null);
  const [systemStatus, setSystemStatus] = useState<{ version: string; protocol: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [devRes, homeRes, healthRes, statusRes] = await Promise.all([
        api.listDevices(token),
        api.listHomes(token),
        api.getHealth().catch(() => null),
        api.getSystemStatus().catch(() => null),
      ]);

      setDevices(devRes.data.devices);
      setHomes(homeRes.data.homes);

      // Load rooms for all homes
      if (homeRes.data.homes.length > 0) {
        const roomPromises = homeRes.data.homes.map(h => api.listRooms(token, h.id));
        const roomResults = await Promise.all(roomPromises);
        const allRooms = roomResults.flatMap(r => r.data.rooms);
        setRooms(allRooms);
      }

      if (healthRes) setHealth(healthRes.data);
      if (statusRes) setSystemStatus(statusRes.data);
    } catch {
      // Errors handled gracefully
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onlineCount = devices.filter((d) => d.active && !d.revoked).length;
  const revokedCount = devices.filter((d) => d.revoked).length;

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold uppercase tracking-tighter">Infrastructure Overview</h1>
        <p className="text-sm text-muted-foreground font-mono">
          {systemStatus ? `${systemStatus.protocol} — ${systemStatus.status}` : 'Connecting...'}
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
              Homes
            </CardTitle>
            <Shield className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{homes.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Registered environments
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
              Rooms
            </CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{rooms.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Organizational units
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
              Devices
            </CardTitle>
            <Cpu className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{devices.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {onlineCount} active · {revokedCount} revoked
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
              Connectivity
            </CardTitle>
            <Wifi className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">
              {health ? (
                <Badge variant={health.status === 'ok' ? 'success' : 'warning'}>
                  {health.status.toUpperCase()}
                </Badge>
              ) : (
                <Badge variant="outline">UNKNOWN</Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              System health status
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Devices */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest">Recent Devices</h2>
        <div className="border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/50">
                <th className="text-left p-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">ID</th>
                <th className="text-left p-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Type</th>
                <th className="text-left p-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Firmware</th>
                <th className="text-left p-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Key Version</th>
                <th className="text-left p-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {devices.slice(0, 10).map((device) => (
                <tr key={device.id} className="border-b border-border/50 hover:bg-card/30">
                  <td className="p-3 font-mono text-xs">{device.id.slice(0, 12)}...</td>
                  <td className="p-3 text-xs">{device.device_type}</td>
                  <td className="p-3 font-mono text-xs">{device.firmware}</td>
                  <td className="p-3 font-mono text-xs">v{device.key_version}</td>
                  <td className="p-3">
                    {device.revoked ? (
                      <Badge variant="destructive" className="text-[8px]">REVOKED</Badge>
                    ) : device.active ? (
                      <Badge variant="success" className="text-[8px]">ACTIVE</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[8px]">INACTIVE</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground text-xs">
                    No devices registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
