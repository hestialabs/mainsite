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
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Globe,
  RefreshCw,
  Lock,
  Bell,
  Send,
  MailPlus,
} from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used?: string;
  active: boolean;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created_at: string;
  last_delivery?: string;
  last_status?: number;
}

const availableScopes = [
  'devices:read',
  'devices:write',
  'commands:send',
  'firmware:read',
  'firmware:upload',
  'health:read',
  'admin:read',
  'admin:write',
];

const availableEvents = [
  'device.created',
  'device.revoked',
  'device.state_change',
  'command.sent',
  'command.acked',
  'firmware.uploaded',
  'firmware.update_started',
  'key.rotated',
  'session.login',
  'session.logout',
];

export default function ApiKeysPage() {
  const { token } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [newKeyRevealed, setNewKeyRevealed] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [adminKey, setAdminKey] = useState('');

  // Load existing API keys and webhooks
  useEffect(() => {
    const loadData = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const res = await api.listApiKeys(token);
        setKeys(res.data.keys);
      } catch (err) {
        toast.error('Failed to load keys');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [token]);

  const handleCreateKey = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;

    const fd = new FormData(e.currentTarget);
    const name = fd.get('key_name') as string;
    const scopeStr = fd.get('scopes') as string;

    if (!name || !scopeStr) {
      toast.error('Name and scopes are required');
      return;
    }

    const scopes = scopeStr.split(',').map((s) => s.trim()).filter(Boolean);

    try {
      const res = await api.createApiKey(token, { name, scopes });

      const newKey: ApiKey = {
        id: res.data.key, // Using raw key temporarily for the UI list if needed, or we re-fetch
        name: res.data.name,
        prefix: res.data.prefix,
        scopes,
        created_at: new Date().toISOString(),
        active: true,
      };

      setKeys((prev) => [newKey, ...prev]);
      setNewKeyRevealed(res.data.key);
      setKeyDialogOpen(false);
      toast.success(`API key "${name}" created`);
    } catch (err) {
      toast.error('Failed to create API key');
    }
  }, [token]);

  const handleCreateWebhook = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get('webhook_name') as string;
    const url = fd.get('webhook_url') as string;
    const eventsStr = fd.get('events') as string;

    if (!name || !url || !eventsStr) {
      toast.error('Name, URL, and events are required');
      return;
    }

    const events = eventsStr.split(',').map((s) => s.trim()).filter(Boolean);
    const secret = `whsec_${Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`;

    const newWebhook: Webhook = {
      id: `wh_${Date.now()}`,
      name,
      url,
      events,
      secret,
      active: true,
      created_at: new Date().toISOString(),
    };

    setWebhooks((prev) => [...prev, newWebhook]);
    setWebhookDialogOpen(false);
    toast.success(`Webhook "${name}" created`);
  }, []);

  const revokeKey = async (id: string) => {
    if (!token) return;
    try {
      await api.revokeApiKey(token, id);
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, active: false } : k)));
      toast.success('API key revoked');
    } catch (err) {
      toast.error('Failed to revoke API key');
    }
  };

  const deleteKey = (id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    toast.success('API key deleted');
  };

  const toggleWebhook = (id: string) => {
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, active: !w.active } : w)));
  };

  const deleteWebhook = (id: string) => {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
    toast.success('Webhook deleted');
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleSendInvite = useCallback(async () => {
    if (!adminKey || !inviteEmail) {
      toast.error('Admin key and email are required');
      return;
    }
    setInviteLoading(true);
    try {
      const res = await api.sendInvite(adminKey, inviteEmail);
      toast.success(`Invite sent. Token: ${res.data.token.slice(0, 12)}...`);
      setInviteEmail('');
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.body.error : 'Failed to send invite');
    } finally {
      setInviteLoading(false);
    }
  }, [adminKey, inviteEmail]);

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
        <h1 className="text-2xl font-bold uppercase tracking-tighter">API & Webhooks</h1>
        <p className="text-xs text-muted-foreground">
          Manage API keys, scopes, webhooks, and tenant invitations
        </p>
      </div>

      {/* Revealed Key Banner */}
      {newKeyRevealed && (
        <div className="border border-green-500/30 bg-green-500/5 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-green-500" />
              <span className="text-[10px] uppercase tracking-widest font-bold text-green-400">
                New API Key — Copy it now. It will not be shown again.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                copyToClipboard(newKeyRevealed, 'API Key');
              }}
              className="text-[10px]"
            >
              <Copy className="w-3 h-3 mr-1" /> Copy
            </Button>
          </div>
          <code className="text-xs font-mono block break-all text-green-300">{newKeyRevealed}</code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNewKeyRevealed(null)}
            className="text-[9px] text-muted-foreground"
          >
            <Bell className="w-3 h-3 mr-1" /> Dismiss
          </Button>
        </div>
      )}

      {/* API Keys */}
      <Card className="bg-card/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
              <Key className="w-4 h-4" /> API Keys
            </CardTitle>
            <CardDescription>Scoped access tokens for programmatic API access</CardDescription>
          </div>
          <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-[10px] uppercase tracking-widest">
                <Plus className="w-3 h-3 mr-2" /> Generate Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="uppercase tracking-widest text-sm">Generate API Key</DialogTitle>
                <DialogDescription>
                  API keys are scoped. Grant only the permissions needed.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateKey} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold">Key Name</Label>
                  <Input name="key_name" required placeholder="ci-deploy-key" className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold">
                    Scopes (comma-separated)
                  </Label>
                  <Input
                    name="scopes"
                    required
                    placeholder="devices:read, commands:send"
                    className="font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {availableScopes.map((s) => (
                      <Badge key={s} variant="outline" className="text-[8px] font-mono cursor-default">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" className="text-[10px] uppercase tracking-widest w-full">
                    Generate
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">No API keys generated</p>
          ) : (
            <div className="border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Name</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Prefix</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Scopes</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground">Created</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-b border-border/50">
                      <td className="p-3 font-mono">{k.name}</td>
                      <td className="p-3 font-mono text-muted-foreground">{k.prefix}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.slice(0, 3).map((s) => (
                            <Badge key={s} variant="outline" className="text-[7px] font-mono">{s}</Badge>
                          ))}
                          {k.scopes.length > 3 && (
                            <Badge variant="secondary" className="text-[7px]">+{k.scopes.length - 3}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant={k.active ? 'success' : 'destructive'} className="text-[8px]">
                          {k.active ? 'ACTIVE' : 'REVOKED'}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{new Date(k.created_at).toLocaleDateString()}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {k.active && (
                            <Button variant="ghost" size="icon" onClick={() => revokeKey(k.id)} title="Revoke">
                              <RefreshCw className="w-3 h-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => deleteKey(k.id)} title="Delete">
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card className="bg-card/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
              <Globe className="w-4 h-4" /> Webhooks
            </CardTitle>
            <CardDescription>HTTP callbacks for system events. Signed with HMAC-SHA256.</CardDescription>
          </div>
          <Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-[10px] uppercase tracking-widest">
                <Plus className="w-3 h-3 mr-2" /> Create Webhook
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="uppercase tracking-widest text-sm">Create Webhook</DialogTitle>
                <DialogDescription>
                  Webhook deliveries are signed with HMAC-SHA256 using the generated secret.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateWebhook} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold">Name</Label>
                  <Input name="webhook_name" required placeholder="deploy-notifications" className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold">Endpoint URL</Label>
                  <Input name="webhook_url" required type="url" placeholder="https://example.com/webhooks/hxtp" className="font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold">
                    Events (comma-separated)
                  </Label>
                  <Input
                    name="events"
                    required
                    placeholder="device.created, command.acked"
                    className="font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {availableEvents.map((e) => (
                      <Badge key={e} variant="outline" className="text-[7px] font-mono cursor-default">
                        {e}
                      </Badge>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" className="text-[10px] uppercase tracking-widest w-full">
                    Create
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">No webhooks configured</p>
          ) : (
            <div className="space-y-3">
              {webhooks.map((wh) => (
                <div key={wh.id} className={`border border-border p-4 space-y-2 ${!wh.active ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch checked={wh.active} onCheckedChange={() => toggleWebhook(wh.id)} />
                      <span className="text-sm font-mono">{wh.name}</span>
                      <Badge variant={wh.active ? 'success' : 'secondary'} className="text-[8px]">
                        {wh.active ? 'ACTIVE' : 'PAUSED'}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteWebhook(wh.id)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">{wh.url}</div>
                  <div className="flex flex-wrap gap-1">
                    {wh.events.map((ev) => (
                      <Badge key={ev} variant="outline" className="text-[7px] font-mono">{ev}</Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                    <Lock className="w-2.5 h-2.5" />
                    Secret: <code className="font-mono">{wh.secret.slice(0, 16)}...</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4"
                      onClick={() => copyToClipboard(wh.secret, 'Webhook secret')}
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tenant Invite (Admin) */}
      <Card className="bg-card/50 border-amber-500/20">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
            <MailPlus className="w-4 h-4" /> Send Tenant Invite
          </CardTitle>
          <CardDescription>
            Requires admin key. Invite-only tenant registration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold">Admin Key</Label>
              <Input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="x-hxtp-admin-key"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold">Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="contact@hestialabs.in"
                className="text-sm"
              />
            </div>
            <Button
              onClick={handleSendInvite}
              disabled={inviteLoading}
              className="text-[10px] uppercase tracking-widest"
            >
              <Send className="w-3 h-3 mr-2" />
              {inviteLoading ? 'Sending...' : 'Send Invite'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
