'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toast } from 'sonner';
import { Cpu, Plus, Link2, Pencil, Trash2, Save } from 'lucide-react';

interface Capability {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  device_types: string[];
  created_at: string;
}

export default function CapabilitiesPage() {
  const { token } = useAuth();
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [devices, setDevices] = useState<api.Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPermissions, setEditPermissions] = useState('');
  const [editDeviceTypes, setEditDeviceTypes] = useState('');

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.listDevices(token);
      setDevices(res.data.devices);

      const uniqueTypes = [...new Set(res.data.devices.map((d) => d.device_type))];
      const defaultCaps: Capability[] = uniqueTypes.map((type, i) => ({
        id: `cap_${i}`,
        name: `${type}_default`,
        description: `Default capability profile for ${type} devices`,
        permissions: ['read_state', 'write_command', 'ota_receive'],
        device_types: [type],
        created_at: new Date().toISOString(),
      }));
      setCapabilities(defaultCaps);
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get('name') as string;
    const description = fd.get('description') as string;
    const permissions = (fd.get('permissions') as string).split(',').map((s) => s.trim()).filter(Boolean);
    const deviceTypes = (fd.get('device_types') as string).split(',').map((s) => s.trim()).filter(Boolean);

    if (!name || permissions.length === 0) {
      toast.error('Name and at least one permission are required');
      return;
    }

    const newCap: Capability = {
      id: `cap_${Date.now()}`,
      name,
      description,
      permissions,
      device_types: deviceTypes,
      created_at: new Date().toISOString(),
    };

    setCapabilities((prev) => [...prev, newCap]);
    setCreateOpen(false);
    toast.success(`Profile "${name}" created`);
  };

  const startEdit = (cap: Capability) => {
    setEditingId(cap.id);
    setEditName(cap.name);
    setEditDescription(cap.description);
    setEditPermissions(cap.permissions.join(', '));
    setEditDeviceTypes(cap.device_types.join(', '));
  };

  const saveEdit = () => {
    if (!editingId) return;
    setCapabilities((prev) =>
      prev.map((c) =>
        c.id === editingId
          ? {
              ...c,
              name: editName,
              description: editDescription,
              permissions: editPermissions.split(',').map((s) => s.trim()).filter(Boolean),
              device_types: editDeviceTypes.split(',').map((s) => s.trim()).filter(Boolean),
            }
          : c,
      ),
    );
    setEditingId(null);
    toast.success('Profile updated');
  };

  const deleteCapability = (id: string) => {
    setCapabilities((prev) => prev.filter((c) => c.id !== id));
    toast.success('Profile removed');
  };

  const assignedDeviceCount = (cap: Capability): number => {
    return devices.filter((d) => cap.device_types.includes(d.device_type)).length;
  };

  const availablePermissions = [
    'read_state',
    'write_command',
    'ota_receive',
    'ota_initiate',
    'key_rotate',
    'telemetry_publish',
    'telemetry_subscribe',
    'config_read',
    'config_write',
    'firmware_report',
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold uppercase tracking-tighter">Capability Profiles</h1>
          <p className="text-xs text-muted-foreground">
            Define and assign device capability sets — permissions, allowed operations, OTA eligibility
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="text-[10px] uppercase tracking-widest">
              <Plus className="w-3 h-3 mr-2" /> New Profile
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest text-sm">Create Capability Profile</DialogTitle>
              <DialogDescription>
                Define a reusable set of permissions and device type bindings.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold">Profile Name</Label>
                <Input name="name" required placeholder="sensor_basic" className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold">Description</Label>
                <Input name="description" placeholder="Basic sensor read/write profile" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold">
                  Permissions (comma-separated)
                </Label>
                <Input
                  name="permissions"
                  required
                  placeholder="read_state, write_command, ota_receive"
                  className="font-mono text-xs"
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {availablePermissions.map((p) => (
                    <Badge key={p} variant="outline" className="text-[8px] font-mono cursor-default">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold">
                  Device Types (comma-separated)
                </Label>
                <Input name="device_types" placeholder="helix_core_v2, sensor_v1" className="font-mono text-xs" />
              </div>
              <DialogFooter>
                <Button type="submit" className="text-[10px] uppercase tracking-widest w-full">
                  Create Profile
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Profiles Grid */}
      {capabilities.length === 0 ? (
        <Card className="bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Cpu className="w-8 h-8 text-muted-foreground/40 mb-4" />
            <p className="text-xs text-muted-foreground">No capability profiles defined</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {capabilities.map((cap) => (
            <Card key={cap.id} className="bg-card/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-mono">
                    {editingId === cap.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-sm font-mono"
                      />
                    ) : (
                      cap.name
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    {editingId === cap.id ? (
                      <Button variant="ghost" size="icon" onClick={saveEdit}>
                        <Save className="w-3 h-3" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => startEdit(cap)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteCapability(cap.id)}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="text-[10px]">
                  {editingId === cap.id ? (
                    <Input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="h-6 text-[10px]"
                    />
                  ) : (
                    cap.description
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Permissions</div>
                  {editingId === cap.id ? (
                    <Input
                      value={editPermissions}
                      onChange={(e) => setEditPermissions(e.target.value)}
                      className="h-6 text-[10px] font-mono"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {cap.permissions.map((p) => (
                        <Badge key={p} variant="outline" className="text-[8px] font-mono">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Device Types</div>
                  {editingId === cap.id ? (
                    <Input
                      value={editDeviceTypes}
                      onChange={(e) => setEditDeviceTypes(e.target.value)}
                      className="h-6 text-[10px] font-mono"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {cap.device_types.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[8px] font-mono">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                  <Link2 className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground">
                    {assignedDeviceCount(cap)} device{assignedDeviceCount(cap) !== 1 ? 's' : ''} matched
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
