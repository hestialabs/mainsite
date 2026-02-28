'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { QrCode, Copy, Clock, CheckCircle } from 'lucide-react';

interface ProvisioningRecord {
  id: string;
  device_id: string;
  key_version: number;
  protocol_version: string;
  mqtt_endpoint: string;
  timestamp: string;
}

export default function ProvisioningPage() {
  const { token } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const [lastClaim, setLastClaim] = useState<api.ClaimResponse | null>(null);
  const [history, setHistory] = useState<ProvisioningRecord[]>([]);

  const handleClaim = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    setClaiming(true);

    const fd = new FormData(e.currentTarget);
    const publicKey = fd.get('public_key') as string;
    const deviceType = fd.get('device_type') as string;
    const signature = fd.get('signature') as string;

    if (!publicKey || !deviceType || !signature) {
      toast.error('All fields are required');
      setClaiming(false);
      return;
    }

    const timestamp = Date.now().toString();

    try {
      const res = await api.claimDevice(token, {
        public_key: publicKey,
        device_type: deviceType,
        signature,
        timestamp,
      });
      setLastClaim(res.data);
      setHistory((prev) => [
        {
          id: res.data.device_id,
          device_id: res.data.device_id,
          key_version: res.data.key_version,
          protocol_version: res.data.protocol_version,
          mqtt_endpoint: res.data.mqtt_endpoint,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);
      toast.success(`Device claimed: ${res.data.device_id.slice(0, 12)}...`);
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold uppercase tracking-tighter">Device Provisioning</h1>
        <p className="text-xs text-muted-foreground">
          ECIES-based device claim with signed key exchange
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Claim Form */}
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
              <QrCode className="w-4 h-4" /> Claim Device
            </CardTitle>
            <CardDescription>
              Submit the device public key and signature from QR code or BLE scan.
              The backend performs ECIES key exchange — no signing in the frontend.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleClaim} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold">
                  Device Public Key (PEM)
                </Label>
                <textarea
                  name="public_key"
                  required
                  rows={4}
                  className="flex w-full border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder={"-----BEGIN PUBLIC KEY-----\nMFkw..."}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold">Device Type</Label>
                <Input name="device_type" required placeholder="helix_core_v2" className="font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold">
                  Challenge Signature (Hex)
                </Label>
                <Input name="signature" required placeholder="a1b2c3d4..." className="font-mono text-sm" />
                <p className="text-[10px] text-muted-foreground">
                  Device signs CLAIM|tenant_id|timestamp with its private key.
                </p>
              </div>
              <Button type="submit" disabled={claiming} className="w-full text-[10px] uppercase tracking-widest">
                {claiming ? 'Claiming...' : 'Claim Device'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Claim Result */}
        {lastClaim && (
          <Card className="bg-card/50 border-green-500/20">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2 text-green-400">
                <CheckCircle className="w-4 h-4" /> Claim Successful
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Device ID</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono flex-1 truncate">{lastClaim.device_id}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(lastClaim.device_id, 'Device ID')}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Key Version</div>
                <Badge variant="success">v{lastClaim.key_version}</Badge>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">MQTT Endpoint</div>
                <code className="text-xs font-mono">{lastClaim.mqtt_endpoint}</code>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Protocol</div>
                <code className="text-xs font-mono">{lastClaim.protocol_version}</code>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Encrypted Secret (ECIES)</div>
                <div className="border border-border p-3 bg-background/50 space-y-1">
                  <div className="text-[9px] text-muted-foreground">IV: <span className="font-mono">{lastClaim.encrypted_secret.iv}</span></div>
                  <div className="text-[9px] text-muted-foreground">Tag: <span className="font-mono">{lastClaim.encrypted_secret.tag}</span></div>
                  <div className="text-[9px] text-muted-foreground">Ciphertext: <span className="font-mono break-all">{lastClaim.encrypted_secret.ciphertext.slice(0, 48)}...</span></div>
                </div>
                <p className="text-[9px] text-muted-foreground">
                  This secret is ECIES-encrypted for the device only. The frontend never sees the raw secret.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
            <Clock className="w-4 h-4" /> Provisioning History (Session)
          </h2>
          <div className="border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-card/50">
                  <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Device ID</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Key Version</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Protocol</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id + entry.timestamp} className="border-b border-border/50">
                    <td className="p-3 font-mono">{entry.device_id.slice(0, 16)}...</td>
                    <td className="p-3">v{entry.key_version}</td>
                    <td className="p-3 font-mono">{entry.protocol_version}</td>
                    <td className="p-3 text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
