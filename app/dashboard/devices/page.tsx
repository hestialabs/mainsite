'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, RefreshCw, Ban, Key, Send, History, Cpu, Copy, Download, AlertTriangle, Check, Terminal } from 'lucide-react';

export default function DevicesPage() {
  const { token, isAdmin, isOperator } = useAuth();
  const [devices, setDevices] = useState<api.Device[]>([]);
  const [homes, setHomes] = useState<api.Home[]>([]);
  const [rooms, setRooms] = useState<api.Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<api.Device | null>(null);
  const [commandHistory, setCommandHistory] = useState<Array<Record<string, unknown>>>([]);
  const [filterType, setFilterType] = useState<string>('all');

  // Registration selection state
  const [regHomeId, setRegHomeId] = useState<string>('');
  const [regRoomId, setRegRoomId] = useState<string>('none');

  // Success state
  const [regResult, setRegResult] = useState<api.RegisterDeviceResponse | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [devRes, homeRes] = await Promise.all([
        api.listDevices(token),
        api.listHomes(token),
      ]);
      setDevices(devRes.data.devices);
      setHomes(homeRes.data.homes);

      if (homeRes.data.homes.length > 0) {
        setRegHomeId(homeRes.data.homes[0].id);
        const roomPromises = homeRes.data.homes.map(h => api.listRooms(token, h.id));
        const roomResults = await Promise.all(roomPromises);
        setRooms(roomResults.flatMap(r => r.data.rooms));
      }
    } catch {
      toast.error('Failed to load infrastructure data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    const fd = new FormData(e.currentTarget);
    const deviceType = fd.get('device_type') as string;

    if (!deviceType || !regHomeId) {
      toast.error('Device type and home are required');
      return;
    }

    try {
      const res = await api.registerDevice(token, {
        device_type: deviceType,
        home_id: regHomeId,
        room_id: regRoomId === 'none' ? undefined : regRoomId
      });
      setRegResult(res.data);
      setSuccessOpen(true);
      setRegisterOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Registration failed');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const downloadProvisioningJson = () => {
    if (!regResult) return;
    const data = JSON.stringify({
      device_id: regResult.device_id,
      tenant_id: regResult.tenant_id,
      api_base_url: regResult.api_base_url,
      device_secret: regResult.device_secret,
      initial_sequence: regResult.initial_sequence
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `provisioning_${regResult.device_id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleRevoke = async (deviceId: string) => {
    if (!token) return;
    try {
      await api.revokeDevice(token, deviceId);
      toast.success('Device revoked');
      load();
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Revoke failed');
    }
  };

  const handleRotateKey = async (deviceId: string) => {
    if (!token) return;
    try {
      const res = await api.rotateDeviceSecret(token, deviceId);
      toast.success(`Key rotated to v${res.data.key_version}`);
      load();
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Rotation failed');
    }
  };

  const handleCommand = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token || !selectedDevice) return;
    const fd = new FormData(e.currentTarget);
    const action = fd.get('action') as string;
    const paramsRaw = fd.get('params') as string;

    let params: Record<string, unknown> = {};
    if (paramsRaw) {
      try {
        params = JSON.parse(paramsRaw);
      } catch {
        toast.error('Invalid JSON params');
        return;
      }
    }

    try {
      await api.sendCommand(token, selectedDevice.id, { action, params });
      toast.success('Command dispatched');
      setCommandOpen(false);
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Dispatch failed');
    }
  };

  const handleTestCommand = async (device: api.Device) => {
    if (!token) return;
    try {
      const res = await api.sendCommand(token, device.id, {
        action: 'ping',
        params: { test: true, timestamp: Date.now() }
      });
      toast.success(`Test ping sent: ${res.data.command_id.slice(0, 8)}`);
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Test command failed');
    }
  };

  const openHistory = async (device: api.Device) => {
    if (!token) return;
    setSelectedDevice(device);
    try {
      const res = await api.getCommandHistory(token, device.id);
      setCommandHistory(res.data.commands);
      setHistoryOpen(true);
    } catch {
      toast.error('Failed to load history');
    }
  };

  const filtered = filterType === 'all'
    ? devices
    : devices.filter((d) => d.device_type === filterType);

  const deviceTypes = [...new Set(devices.map((d) => d.device_type))];

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold uppercase tracking-tighter">Device Management</h1>
          <p className="text-xs text-muted-foreground">{devices.length} device(s) in tenant</p>
        </div>
        <div className="flex gap-3">
          {deviceTypes.length > 0 && (
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48 text-xs">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {deviceTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={load} className="text-[10px] uppercase tracking-widest">
            <RefreshCw className="w-3 h-3 mr-2" /> Refresh
          </Button>
          {isAdmin && (
            <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="text-[10px] uppercase tracking-widest">
                  <Plus className="w-3 h-3 mr-2" /> Register Device
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="uppercase tracking-tighter">Register New Device</DialogTitle>
                  <DialogDescription>
                    Register a device into your tenant. A secret is required for HMAC authentication.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest font-bold">Target Home</Label>
                    <Select value={regHomeId} onValueChange={(v) => { setRegHomeId(v); setRegRoomId('none'); }}>
                      <SelectTrigger className="font-mono text-sm">
                        <SelectValue placeholder="Select Home" />
                      </SelectTrigger>
                      <SelectContent>
                        {homes.map(h => (
                          <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest font-bold">Target Room (Optional)</Label>
                    <Select value={regRoomId} onValueChange={setRegRoomId}>
                      <SelectTrigger className="font-mono text-sm">
                        <SelectValue placeholder="Select Room" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned / Main</SelectItem>
                        {rooms.filter(r => r.home_id === regHomeId).map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest font-bold">Device Type</Label>
                    <Input name="device_type" placeholder="helix_retrofit_node" required className="font-mono text-sm" />
                  </div>
                  <DialogFooter>
                    <Button type="submit" className="text-[10px] uppercase tracking-widest">Register</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {/* Success Dialog */}
          <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-success/20 p-2 rounded-full">
                    <Check className="w-5 h-5 text-success" />
                  </div>
                  <DialogTitle className="uppercase tracking-tighter text-xl">Device Registered Successfully</DialogTitle>
                </div>
                <DialogDescription className="text-destructive font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  IMPORTANT: This is the ONLY time you can view the Device Secret. Save it now!
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="grid gap-4 p-4 border border-border bg-card/50 rounded-md">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Device ID</Label>
                    <div className="font-mono text-sm flex items-center justify-between bg-background p-2 border border-border/50 rounded">
                      <span>{regResult?.device_id}</span>
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(regResult?.device_id || '')}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Device Secret</Label>
                    <div className="font-mono text-sm flex items-center justify-between bg-destructive/5 p-2 border border-destructive/20 rounded">
                      <span className="text-destructive font-bold">{regResult?.device_secret}</span>
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(regResult?.device_secret || '')}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase tracking-widest font-bold">Provisioning JSON Payload</Label>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-[9px] uppercase tracking-widest" onClick={copyToClipboard.bind(null, JSON.stringify({
                        device_id: regResult?.device_id,
                        tenant_id: regResult?.tenant_id,
                        api_base_url: regResult?.api_base_url,
                        device_secret: regResult?.device_secret,
                        initial_sequence: 0
                      }, null, 2))}>
                        <Copy className="w-3 h-3 mr-1" /> Copy JSON
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-[9px] uppercase tracking-widest" onClick={downloadProvisioningJson}>
                        <Download className="w-3 h-3 mr-1" /> Download
                      </Button>
                    </div>
                  </div>
                  <pre className="p-4 bg-muted font-mono text-[10px] overflow-auto max-h-[150px] border border-border/50 rounded">
                    {JSON.stringify({
                      device_id: regResult?.device_id,
                      tenant_id: regResult?.tenant_id,
                      api_base_url: regResult?.api_base_url,
                      device_secret: regResult?.device_secret,
                      initial_sequence: 0
                    }, null, 2)}
                  </pre>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={() => setSuccessOpen(false)} className="text-[10px] uppercase tracking-widest">
                  I have saved the credentials
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Device Table */}
      <div className="border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card/50">
              <th className="text-left p-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Device ID</th>
              <th className="text-left p-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Location</th>
              <th className="text-left p-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Type</th>
              <th className="text-left p-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Firmware</th>
              <th className="text-left p-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Status</th>
              <th className="text-right p-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((device) => {
              const home = homes.find(h => h.id === device.home_id);
              const room = rooms.find(r => r.id === device.room_id);

              return (
                <tr key={device.id} className="border-b border-border/50 hover:bg-card/30">
                  <td className="p-3 font-mono text-xs">
                    <div className="font-bold">{device.id.slice(0, 16)}...</div>
                    <div className="text-[9px] text-muted-foreground uppercase">Key v{device.key_version}</div>
                  </td>
                  <td className="p-3">
                    <div className="text-xs font-bold">{home?.name || 'Unknown Home'}</div>
                    <div className="text-[10px] text-muted-foreground">{room?.name || 'Unassigned'}</div>
                  </td>
                  <td className="p-3 text-xs flex items-center gap-2 h-full py-5">
                    <Cpu className="w-3 h-3 text-muted-foreground" /> {device.device_type}
                  </td>
                  <td className="p-3 font-mono text-xs">{device.firmware}</td>
                  <td className="p-3">
                    {device.revoked ? (
                      <Badge variant="destructive" className="text-[8px]">REVOKED</Badge>
                    ) : device.active ? (
                      <Badge variant="success" className="text-[8px]">ACTIVE</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[8px]">INACTIVE</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      {isOperator && !device.revoked && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Test Command"
                            onClick={() => handleTestCommand(device)}
                          >
                            <Terminal className="w-3 h-3 text-success" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Send Command"
                            onClick={() => { setSelectedDevice(device); setCommandOpen(true); }}
                          >
                            <Send className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Command History"
                        onClick={() => openHistory(device)}
                      >
                        <History className="w-3 h-3" />
                      </Button>
                      {isAdmin && !device.revoked && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Rotate Secret"
                            onClick={() => handleRotateKey(device.id)}
                          >
                            <Key className="w-3 h-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Revoke">
                                <Ban className="w-3 h-3 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="uppercase tracking-tighter">Revoke Device?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently blacklist device {device.id.slice(0, 12)}. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleRevoke(device.id)}>
                                  Revoke
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground text-xs">
                  No devices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Send Command Dialog */}
      <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="uppercase tracking-tighter">Dispatch Command</DialogTitle>
            <DialogDescription>
              Send a signed command to {selectedDevice?.id.slice(0, 12)}...
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCommand} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold">Action</Label>
              <Input name="action" placeholder="SET_STATE" required className="font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold">Parameters (JSON)</Label>
              <Input name="params" placeholder='{"brightness": 75}' className="font-mono text-sm" />
            </div>
            <DialogFooter>
              <Button type="submit" className="text-[10px] uppercase tracking-widest">Dispatch</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Command History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-tighter">Command History</DialogTitle>
            <DialogDescription>
              Recent commands for {selectedDevice?.id.slice(0, 12)}...
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-auto border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-card/50">
                  <th className="text-left p-2 text-[9px] uppercase tracking-widest text-muted-foreground">Action</th>
                  <th className="text-left p-2 text-[9px] uppercase tracking-widest text-muted-foreground">Status</th>
                  <th className="text-left p-2 text-[9px] uppercase tracking-widest text-muted-foreground">Time</th>
                </tr>
              </thead>
              <tbody>
                {commandHistory.map((cmd, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="p-2 font-mono">{String(cmd.action)}</td>
                    <td className="p-2">
                      <Badge variant={cmd.status === 'acked' ? 'success' : 'outline'} className="text-[8px]">
                        {String(cmd.status)}
                      </Badge>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {cmd.created_at ? new Date(String(cmd.created_at)).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
                {commandHistory.length === 0 && (
                  <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">No commands found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
