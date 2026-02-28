'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { FileText, Filter, ChevronLeft, ChevronRight, AlertTriangle, Terminal, Shield } from 'lucide-react';

type LogCategory = 'commands' | 'device' | 'security';

interface CommandLogEntry {
  id: string;
  action: string;
  status: string;
  device_id: string;
  created_at: string;
  params?: Record<string, unknown>;
}

interface DeviceLogEntry {
  id: string;
  device_id: string;
  device_type: string;
  firmware: string;
  active: boolean;
  revoked: boolean;
  last_heartbeat: string;
  created_at: string;
}

export default function LogsPage() {
  const { token } = useAuth();
  const [category, setCategory] = useState<LogCategory>('commands');
  const [devices, setDevices] = useState<api.Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [commandLogs, setCommandLogs] = useState<CommandLogEntry[]>([]);
  const [deviceLogs, setDeviceLogs] = useState<DeviceLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filterText, setFilterText] = useState('');
  const pageSize = 25;

  const loadDevices = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.listDevices(token);
      setDevices(res.data.devices);
      setDeviceLogs(
        res.data.devices.map((d) => ({
          id: d.id,
          device_id: d.id,
          device_type: d.device_type,
          firmware: d.firmware,
          active: d.active,
          revoked: d.revoked,
          last_heartbeat: d.last_heartbeat ?? '',
          created_at: d.created_at,
        })),
      );
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const loadCommandLogs = useCallback(async (deviceId: string) => {
    if (!token || !deviceId) return;
    setLogsLoading(true);
    try {
      const res = await api.getCommandHistory(token, deviceId);
      setCommandLogs(res.data.commands as unknown as CommandLogEntry[]);
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Failed to load commands');
    } finally {
      setLogsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (category === 'commands' && selectedDevice) {
      loadCommandLogs(selectedDevice);
    }
  }, [category, selectedDevice, loadCommandLogs]);

  const filteredCommandLogs = commandLogs.filter((l) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.status.toLowerCase().includes(q) ||
      l.device_id.toLowerCase().includes(q)
    );
  });

  const filteredDeviceLogs = deviceLogs.filter((l) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (
      l.device_id.toLowerCase().includes(q) ||
      l.device_type.toLowerCase().includes(q) ||
      l.firmware.toLowerCase().includes(q)
    );
  });

  const paginatedCommands = filteredCommandLogs.slice((page - 1) * pageSize, page * pageSize);
  const paginatedDevices = filteredDeviceLogs.slice((page - 1) * pageSize, page * pageSize);

  const totalPages =
    category === 'commands'
      ? Math.max(1, Math.ceil(filteredCommandLogs.length / pageSize))
      : Math.max(1, Math.ceil(filteredDeviceLogs.length / pageSize));

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold uppercase tracking-tighter">Logs</h1>
        <p className="text-xs text-muted-foreground">
          Command history, device events, and security audit trail
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-widest font-bold">Category</Label>
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v as LogCategory);
              setPage(1);
              setFilterText('');
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="commands">
                <span className="flex items-center gap-2">
                  <Terminal className="w-3 h-3" /> Command History
                </span>
              </SelectItem>
              <SelectItem value="device">
                <span className="flex items-center gap-2">
                  <FileText className="w-3 h-3" /> Device Events
                </span>
              </SelectItem>
              <SelectItem value="security">
                <span className="flex items-center gap-2">
                  <Shield className="w-3 h-3" /> Security
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {category === 'commands' && (
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest font-bold">Device</Label>
            <Select value={selectedDevice} onValueChange={setSelectedDevice}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select device" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <span className="font-mono text-xs">{d.id.slice(0, 16)}...</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2 flex-1 min-w-48">
          <Label className="text-[10px] uppercase tracking-widest font-bold">
            <Filter className="w-3 h-3 inline mr-1" /> Filter
          </Label>
          <Input
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              setPage(1);
            }}
            placeholder="Search logs..."
            className="text-sm"
          />
        </div>
      </div>

      {/* Log Content */}
      {category === 'commands' && (
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
              <Terminal className="w-4 h-4" /> Command Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedDevice ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Select a device to view command history</p>
            ) : logsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : paginatedCommands.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">No commands recorded</p>
            ) : (
              <div className="border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Action</th>
                      <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Status</th>
                      <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Params</th>
                      <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCommands.map((cmd) => (
                      <tr key={cmd.id} className="border-b border-border/50">
                        <td className="p-3 font-mono">{cmd.action}</td>
                        <td className="p-3">
                          <Badge
                            variant={
                              cmd.status === 'delivered' || cmd.status === 'acked'
                                ? 'success'
                                : cmd.status === 'failed'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                            className="text-[9px]"
                          >
                            {cmd.status}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground max-w-48 truncate">
                          {cmd.params ? JSON.stringify(cmd.params) : '—'}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {cmd.created_at ? new Date(cmd.created_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {category === 'device' && (
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
              <FileText className="w-4 h-4" /> Device Event Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paginatedDevices.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">No device events</p>
            ) : (
              <div className="border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Device ID</th>
                      <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Type</th>
                      <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Firmware</th>
                      <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Status</th>
                      <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Last Heartbeat</th>
                      <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDevices.map((d) => (
                      <tr key={d.id} className="border-b border-border/50">
                        <td className="p-3 font-mono">{d.device_id.slice(0, 16)}...</td>
                        <td className="p-3 font-mono">{d.device_type}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[9px] font-mono">{d.firmware}</Badge>
                        </td>
                        <td className="p-3">
                          {d.revoked ? (
                            <Badge variant="destructive" className="text-[9px]">REVOKED</Badge>
                          ) : d.active ? (
                            <Badge variant="success" className="text-[9px]">ACTIVE</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px]">INACTIVE</Badge>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {d.last_heartbeat ? new Date(d.last_heartbeat).toLocaleString() : '—'}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(d.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {category === 'security' && (
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
              <Shield className="w-4 h-4" /> Security Audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="w-8 h-8 text-amber-500/40 mb-4" />
              <p className="text-xs text-muted-foreground mb-2">
                Security audit logs are available via the backend audit_log table.
              </p>
              <p className="text-[10px] text-muted-foreground">
                Login attempts, key rotations, revocations, and signature failures are recorded server-side.
                Use the admin API or direct database access for full audit trail.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
