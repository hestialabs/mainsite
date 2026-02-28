'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Upload,
  Package,
  CheckCircle,
  AlertTriangle,
  ArrowUpCircle,
  FileText,
  HardDrive,
} from 'lucide-react';

interface FirmwareRelease {
  version: string;
  device_type: string;
  checksum: string;
  ed25519_signature: string | null;
  created_at: string;
  size?: number;
}

export default function FirmwarePage() {
  const { token } = useAuth();
  const [releases, setReleases] = useState<FirmwareRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkResult, setCheckResult] = useState<api.FirmwareCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadReleases = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.checkFirmware(token, {
        device_type: '_all',
        current_version: '0.0.0',
      });
      if (res.data.version) {
        setReleases([
          {
            version: res.data.version,
            device_type: '_all',
            checksum: res.data.checksum ?? '',
            ed25519_signature: res.data.ed25519_signature ?? null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      // No releases yet, that's fine
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadReleases();
  }, [loadReleases]);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;

    const fd = new FormData(e.currentTarget);
    const file = fd.get('firmware') as File;
    const version = fd.get('version') as string;
    const deviceType = fd.get('device_type') as string;
    const signature = fd.get('ed25519_signature') as string;

    if (!file || !version || !deviceType) {
      toast.error('File, version, and device type are required');
      return;
    }

    const uploadForm = new FormData();
    uploadForm.append('firmware', file);
    uploadForm.append('version', version);
    uploadForm.append('device_type', deviceType);
    if (signature) {
      uploadForm.append('ed25519_signature', signature);
    }

    setUploading(true);
    setUploadProgress(0);

    const progressInterval = setInterval(() => {
      setUploadProgress((p) => Math.min(p + 8, 90));
    }, 200);

    try {
      const res = await api.uploadFirmware(token, uploadForm);
      clearInterval(progressInterval);
      setUploadProgress(100);
      toast.success(`Firmware ${res.data.version} uploaded (${res.data.checksum.slice(0, 12)}...)`);
      setDialogOpen(false);
      setReleases((prev) => [
        {
          version: res.data.version,
          device_type: res.data.device_type,
          checksum: res.data.checksum,
          ed25519_signature: null,
          created_at: new Date().toISOString(),
          size: file.size,
        },
        ...prev,
      ]);
    } catch (err) {
      clearInterval(progressInterval);
      toast.error(err instanceof api.ApiError ? err.body.error : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCheck = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    setChecking(true);
    setCheckResult(null);

    const fd = new FormData(e.currentTarget);
    const deviceType = fd.get('check_device_type') as string;
    const currentVersion = fd.get('check_current_version') as string;
    const deviceId = fd.get('check_device_id') as string;

    try {
      const res = await api.checkFirmware(token, {
        device_type: deviceType,
        current_version: currentVersion,
        ...(deviceId ? { device_id: deviceId } : {}),
      });
      setCheckResult(res.data);
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Check failed');
    } finally {
      setChecking(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold uppercase tracking-tighter">Firmware & OTA</h1>
          <p className="text-xs text-muted-foreground">
            Upload, version, and deploy firmware. Backend signs binaries — never the frontend.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="text-[10px] uppercase tracking-widest">
              <Upload className="w-3 h-3 mr-2" /> Upload Firmware
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest text-sm">Upload Firmware</DialogTitle>
              <DialogDescription>
                Binary is stored in R2/S3. Backend computes checksum and optionally verifies Ed25519 signature.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold">Firmware Binary</Label>
                <Input ref={fileRef} name="firmware" type="file" required accept=".bin,.hex,.uf2,.elf" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold">Version</Label>
                  <Input name="version" required placeholder="1.2.0" className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold">Device Type</Label>
                  <Input name="device_type" required placeholder="helix_core_v2" className="font-mono" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold">
                  Ed25519 Signature (Hex, Optional)
                </Label>
                <Input name="ed25519_signature" placeholder="Optional pre-signed signature" className="font-mono text-xs" />
                <p className="text-[9px] text-muted-foreground">
                  If provided, backend verifies against the known signing key. Otherwise backend generates its own checksum.
                </p>
              </div>
              {uploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} className="h-1" />
                  <p className="text-[9px] text-muted-foreground text-center">{uploadProgress}%</p>
                </div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={uploading} className="text-[10px] uppercase tracking-widest w-full">
                  {uploading ? 'Uploading...' : 'Upload'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Releases List */}
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
            <Package className="w-4 h-4" /> Firmware Releases
          </CardTitle>
          <CardDescription>All uploaded firmware versions</CardDescription>
        </CardHeader>
        <CardContent>
          {releases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <HardDrive className="w-8 h-8 text-muted-foreground/40 mb-4" />
              <p className="text-xs text-muted-foreground">No firmware uploaded yet</p>
            </div>
          ) : (
            <div className="border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Version</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Device Type</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Checksum</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Signed</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Size</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {releases.map((r) => (
                    <tr key={r.version + r.device_type} className="border-b border-border/50">
                      <td className="p-3">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {r.version}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono">{r.device_type}</td>
                      <td className="p-3 font-mono text-muted-foreground">{r.checksum.slice(0, 16)}...</td>
                      <td className="p-3">
                        {r.ed25519_signature ? (
                          <CheckCircle className="w-3 h-3 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-amber-500/60" />
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{r.size ? formatBytes(r.size) : '—'}</td>
                      <td className="p-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update Checker */}
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4" /> Check for Update
          </CardTitle>
          <CardDescription>
            Simulate an OTA update check as a device would. Returns available firmware if newer version exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCheck} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold">Device Type</Label>
              <Input name="check_device_type" required placeholder="helix_core_v2" className="font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold">Current Version</Label>
              <Input name="check_current_version" required placeholder="1.0.0" className="font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold">Device ID (Optional)</Label>
              <Input name="check_device_id" placeholder="Optional" className="font-mono text-sm" />
            </div>
            <Button type="submit" disabled={checking} className="text-[10px] uppercase tracking-widest">
              {checking ? 'Checking...' : 'Check'}
            </Button>
          </form>

          {checkResult && (
            <div className="border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                {checkResult.update_available ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-bold text-green-400">Update Available</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">No update available</span>
                  </>
                )}
              </div>
              {checkResult.update_available && checkResult.version && (
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Version: </span>
                    <code className="font-mono">{checkResult.version}</code>
                  </div>
                  {checkResult.checksum && (
                    <div>
                      <span className="text-muted-foreground">Checksum: </span>
                      <code className="font-mono">{checkResult.checksum.slice(0, 24)}...</code>
                    </div>
                  )}
                  {checkResult.ed25519_signature && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Ed25519: </span>
                      <code className="font-mono text-[10px]">{checkResult.ed25519_signature.slice(0, 48)}...</code>
                    </div>
                  )}
                  {checkResult.download_url && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Download URL: </span>
                      <code className="font-mono text-[10px] break-all">{checkResult.download_url}</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
