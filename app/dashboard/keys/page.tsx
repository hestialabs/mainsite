'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Key, RefreshCw, Copy, Shield, AlertTriangle } from 'lucide-react';

interface KeyRecord {
  version: number;
  created_at: string;
  algorithm?: string;
  status?: string;
}

export default function DeveloperKeysPage() {
  const { token } = useAuth();
  const [devices, setDevices] = useState<api.Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [keyHistory, setKeyHistory] = useState<KeyRecord[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [rotating, setRotating] = useState(false);

  const loadDevices = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.listDevices(token);
      setDevices(res.data.devices);
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const loadKeyHistory = async (deviceId: string) => {
    if (!token) return;
    setSelectedDevice(deviceId);
    setLoadingKeys(true);
    try {
      const res = await api.getKeyHistory(token, deviceId);
      setCurrentVersion(res.data.current_version);
      setKeyHistory(res.data.history as unknown as KeyRecord[]);
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Failed to load key history');
    } finally {
      setLoadingKeys(false);
    }
  };

  const handleRotate = async () => {
    if (!token || !selectedDevice) return;
    setRotating(true);
    try {
      const res = await api.rotateDeviceSecret(token, selectedDevice);
      toast.success(`Secret rotated to key version ${res.data.key_version}`);
      await loadKeyHistory(selectedDevice);
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Rotation failed');
    } finally {
      setRotating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold uppercase tracking-tighter">Developer Keys</h1>
        <p className="text-xs text-muted-foreground">
          Device key versions, rotation, and audit trail. Never expose private keys.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Device Selector */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            Select Device
          </h2>
          <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {devices.length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">No devices registered</p>
            )}
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() => loadKeyHistory(d.id)}
                className={`w-full text-left p-3 border transition-colors ${
                  selectedDevice === d.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <div className="text-xs font-mono truncate">{d.id}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={d.revoked ? 'destructive' : 'outline'} className="text-[9px]">
                    {d.revoked ? 'REVOKED' : d.device_type}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground">v{d.key_version}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Key Details */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedDevice ? (
            <Card className="bg-card/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Key className="w-8 h-8 text-muted-foreground/40 mb-4" />
                <p className="text-xs text-muted-foreground">Select a device to view key information</p>
              </CardContent>
            </Card>
          ) : loadingKeys ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <>
              {/* Current Key */}
              <Card className="bg-card/50">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
                      <Shield className="w-4 h-4" /> Current Key Version
                    </CardTitle>
                    <CardDescription>Active key for this device</CardDescription>
                  </div>
                  <Badge variant="success" className="text-sm px-3 py-1">
                    v{currentVersion}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-muted-foreground flex-1 truncate">
                      {selectedDevice}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(selectedDevice, 'Device ID')}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleRotate}
                      disabled={rotating}
                      variant="outline"
                      className="text-[10px] uppercase tracking-widest"
                    >
                      <RefreshCw className={`w-3 h-3 mr-2 ${rotating ? 'animate-spin' : ''}`} />
                      {rotating ? 'Rotating...' : 'Rotate Secret'}
                    </Button>
                    <div className="flex items-center gap-1 text-[9px] text-amber-500/80">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Rotation creates a transition window. Old key remains valid temporarily.</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Key History */}
              <Card className="bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-widest">Key Version History</CardTitle>
                  <CardDescription>All key versions for this device, latest first</CardDescription>
                </CardHeader>
                <CardContent>
                  {keyHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No key history available</p>
                  ) : (
                    <div className="border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/20">
                            <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Version</th>
                            <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Created</th>
                            <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keyHistory.map((k) => (
                            <tr key={k.version} className="border-b border-border/50">
                              <td className="p-3 font-mono">v{k.version}</td>
                              <td className="p-3 text-muted-foreground">
                                {k.created_at ? new Date(k.created_at).toLocaleString() : '—'}
                              </td>
                              <td className="p-3">
                                <Badge
                                  variant={k.version === currentVersion ? 'success' : 'secondary'}
                                  className="text-[9px]"
                                >
                                  {k.version === currentVersion ? 'ACTIVE' : 'RETIRED'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Security Notice */}
              <div className="border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-amber-500">
                      Security Notice
                    </div>
                    <p className="text-[10px] text-amber-500/80 leading-relaxed">
                      Private keys never leave the device. Key rotation happens via the backend
                      authority service. The dashboard shows version metadata only — never raw
                      cryptographic material. All key operations are recorded in the audit log.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
