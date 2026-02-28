'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Workflow, Plus, Trash2, Play, Pause, ArrowRight, Zap, Filter, Target } from 'lucide-react';

type TriggerType = 'device_state' | 'heartbeat_timeout' | 'firmware_update' | 'schedule' | 'command_ack';
type ConditionOp = 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
type ActionType = 'send_command' | 'notify' | 'revoke_device' | 'trigger_ota' | 'webhook';

interface RuleTrigger {
  type: TriggerType;
  device_type?: string;
  field?: string;
  value?: string;
}

interface RuleCondition {
  field: string;
  op: ConditionOp;
  value: string;
}

interface RuleAction {
  type: ActionType;
  target?: string;
  params?: Record<string, string>;
}

interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  created_at: string;
}

const triggerLabels: Record<TriggerType, string> = {
  device_state: 'Device State Change',
  heartbeat_timeout: 'Heartbeat Timeout',
  firmware_update: 'Firmware Update Complete',
  schedule: 'Scheduled (Cron)',
  command_ack: 'Command Acknowledged',
};

const actionLabels: Record<ActionType, string> = {
  send_command: 'Send Command',
  notify: 'Send Notification',
  revoke_device: 'Revoke Device',
  trigger_ota: 'Trigger OTA Update',
  webhook: 'Call Webhook',
};

const conditionOps: Record<ConditionOp, string> = {
  equals: '==',
  not_equals: '!=',
  greater_than: '>',
  less_than: '<',
  contains: 'contains',
};

export default function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Builder state
  const [newName, setNewName] = useState('');
  const [newTriggerType, setNewTriggerType] = useState<TriggerType>('device_state');
  const [newTriggerField, setNewTriggerField] = useState('');
  const [newTriggerValue, setNewTriggerValue] = useState('');
  const [newTriggerDeviceType, setNewTriggerDeviceType] = useState('');
  const [newConditions, setNewConditions] = useState<RuleCondition[]>([]);
  const [newActions, setNewActions] = useState<RuleAction[]>([]);

  // Temporary condition builder
  const [condField, setCondField] = useState('');
  const [condOp, setCondOp] = useState<ConditionOp>('equals');
  const [condValue, setCondValue] = useState('');

  // Temporary action builder
  const [actionType, setActionType] = useState<ActionType>('send_command');
  const [actionTarget, setActionTarget] = useState('');
  const [actionParamKey, setActionParamKey] = useState('');
  const [actionParamValue, setActionParamValue] = useState('');

  const addCondition = () => {
    if (!condField || !condValue) {
      toast.error('Condition field and value are required');
      return;
    }
    setNewConditions((prev) => [...prev, { field: condField, op: condOp, value: condValue }]);
    setCondField('');
    setCondValue('');
  };

  const removeCondition = (index: number) => {
    setNewConditions((prev) => prev.filter((_, i) => i !== index));
  };

  const addAction = () => {
    if (!actionType) {
      toast.error('Action type is required');
      return;
    }
    const params: Record<string, string> = {};
    if (actionParamKey && actionParamValue) {
      params[actionParamKey] = actionParamValue;
    }
    setNewActions((prev) => [...prev, { type: actionType, target: actionTarget || undefined, params: Object.keys(params).length > 0 ? params : undefined }]);
    setActionTarget('');
    setActionParamKey('');
    setActionParamValue('');
  };

  const removeAction = (index: number) => {
    setNewActions((prev) => prev.filter((_, i) => i !== index));
  };

  const createRule = () => {
    if (!newName) {
      toast.error('Rule name is required');
      return;
    }
    if (newActions.length === 0) {
      toast.error('At least one action is required');
      return;
    }

    const rule: AutomationRule = {
      id: `rule_${Date.now()}`,
      name: newName,
      enabled: true,
      trigger: {
        type: newTriggerType,
        device_type: newTriggerDeviceType || undefined,
        field: newTriggerField || undefined,
        value: newTriggerValue || undefined,
      },
      conditions: newConditions,
      actions: newActions,
      created_at: new Date().toISOString(),
    };

    setRules((prev) => [...prev, rule]);
    setCreateOpen(false);
    resetBuilder();
    toast.success(`Rule "${rule.name}" created`);
  };

  const resetBuilder = () => {
    setNewName('');
    setNewTriggerType('device_state');
    setNewTriggerField('');
    setNewTriggerValue('');
    setNewTriggerDeviceType('');
    setNewConditions([]);
    setNewActions([]);
  };

  const toggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r,
      ),
    );
  };

  const deleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    toast.success('Rule deleted');
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold uppercase tracking-tighter">Automation</h1>
          <p className="text-xs text-muted-foreground">
            Visual rule builder: Trigger → Condition → Action. No eval, no dynamic code execution.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="text-[10px] uppercase tracking-widest">
              <Plus className="w-3 h-3 mr-2" /> New Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest text-sm">Create Automation Rule</DialogTitle>
              <DialogDescription>
                Build a structured rule: when a trigger fires and conditions are met, execute actions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Rule Name */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold">Rule Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="auto_reboot_on_timeout"
                  className="font-mono"
                />
              </div>

              {/* Trigger */}
              <div className="border border-primary/20 p-4 space-y-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-primary">
                  <Zap className="w-3 h-3" /> Trigger
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[9px] uppercase tracking-widest">Type</Label>
                    <Select value={newTriggerType} onValueChange={(v) => setNewTriggerType(v as TriggerType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(triggerLabels) as [TriggerType, string][]).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] uppercase tracking-widest">Device Type (Optional)</Label>
                    <Input
                      value={newTriggerDeviceType}
                      onChange={(e) => setNewTriggerDeviceType(e.target.value)}
                      placeholder="helix_core_v2"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
                {(newTriggerType === 'device_state' || newTriggerType === 'command_ack') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[9px] uppercase tracking-widest">Field</Label>
                      <Input
                        value={newTriggerField}
                        onChange={(e) => setNewTriggerField(e.target.value)}
                        placeholder="temperature"
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[9px] uppercase tracking-widest">Value</Label>
                      <Input
                        value={newTriggerValue}
                        onChange={(e) => setNewTriggerValue(e.target.value)}
                        placeholder="online"
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Conditions */}
              <div className="border border-amber-500/20 p-4 space-y-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-amber-500">
                  <Filter className="w-3 h-3" /> Conditions (Optional)
                </div>
                {newConditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <code className="font-mono">{c.field}</code>
                    <Badge variant="outline" className="text-[8px]">{conditionOps[c.op]}</Badge>
                    <code className="font-mono">{c.value}</code>
                    <Button variant="ghost" size="icon" onClick={() => removeCondition(i)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
                <div className="grid grid-cols-4 gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-[9px]">Field</Label>
                    <Input value={condField} onChange={(e) => setCondField(e.target.value)} placeholder="status" className="font-mono text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px]">Operator</Label>
                    <Select value={condOp} onValueChange={(v) => setCondOp(v as ConditionOp)}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(conditionOps) as [ConditionOp, string][]).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px]">Value</Label>
                    <Input value={condValue} onChange={(e) => setCondValue(e.target.value)} placeholder="offline" className="font-mono text-xs h-8" />
                  </div>
                  <Button type="button" variant="outline" onClick={addCondition} className="h-8 text-[9px]">
                    Add
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="border border-green-500/20 p-4 space-y-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-green-500">
                  <Target className="w-3 h-3" /> Actions
                </div>
                {newActions.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="success" className="text-[8px]">{actionLabels[a.type]}</Badge>
                    {a.target && <code className="font-mono text-muted-foreground">→ {a.target}</code>}
                    {a.params && Object.keys(a.params).length > 0 && (
                      <code className="font-mono text-muted-foreground text-[9px]">
                        {JSON.stringify(a.params)}
                      </code>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => removeAction(i)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-[9px]">Type</Label>
                      <Select value={actionType} onValueChange={(v) => setActionType(v as ActionType)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.entries(actionLabels) as [ActionType, string][]).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[9px]">Target (Device/URL)</Label>
                      <Input value={actionTarget} onChange={(e) => setActionTarget(e.target.value)} placeholder="device_id or URL" className="font-mono text-xs h-8" />
                    </div>
                    <Button type="button" variant="outline" onClick={addAction} className="h-8 text-[9px]">
                      Add
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[9px]">Param Key</Label>
                      <Input value={actionParamKey} onChange={(e) => setActionParamKey(e.target.value)} placeholder="action" className="font-mono text-xs h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[9px]">Param Value</Label>
                      <Input value={actionParamValue} onChange={(e) => setActionParamValue(e.target.value)} placeholder="reboot" className="font-mono text-xs h-8" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={createRule} className="text-[10px] uppercase tracking-widest w-full">
                Create Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <Card className="bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Workflow className="w-8 h-8 text-muted-foreground/40 mb-4" />
            <p className="text-xs text-muted-foreground mb-1">No automation rules defined</p>
            <p className="text-[10px] text-muted-foreground">
              Create rules to automate device management: trigger → condition → action
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <Card key={rule.id} className={`bg-card/50 ${!rule.enabled ? 'opacity-50' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleRule(rule.id)}
                    />
                    <CardTitle className="text-sm font-mono">{rule.name}</CardTitle>
                    <Badge variant={rule.enabled ? 'success' : 'secondary'} className="text-[8px]">
                      {rule.enabled ? 'ACTIVE' : 'PAUSED'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleRule(rule.id)}
                    >
                      {rule.enabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="text-[9px]">
                  Created {new Date(rule.created_at).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Trigger */}
                  <div className="border border-primary/20 px-3 py-2 space-y-1">
                    <div className="text-[8px] uppercase tracking-widest text-primary font-bold flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5" /> Trigger
                    </div>
                    <div className="text-[10px] font-mono">{triggerLabels[rule.trigger.type]}</div>
                    {rule.trigger.device_type && (
                      <Badge variant="outline" className="text-[7px]">{rule.trigger.device_type}</Badge>
                    )}
                  </div>

                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

                  {/* Conditions */}
                  {rule.conditions.length > 0 && (
                    <>
                      <div className="border border-amber-500/20 px-3 py-2 space-y-1">
                        <div className="text-[8px] uppercase tracking-widest text-amber-500 font-bold flex items-center gap-1">
                          <Filter className="w-2.5 h-2.5" /> Conditions
                        </div>
                        {rule.conditions.map((c, i) => (
                          <div key={i} className="text-[10px] font-mono">
                            {c.field} {conditionOps[c.op]} {c.value}
                          </div>
                        ))}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </>
                  )}

                  {/* Actions */}
                  <div className="border border-green-500/20 px-3 py-2 space-y-1">
                    <div className="text-[8px] uppercase tracking-widest text-green-500 font-bold flex items-center gap-1">
                      <Target className="w-2.5 h-2.5" /> Actions
                    </div>
                    {rule.actions.map((a, i) => (
                      <div key={i} className="text-[10px] font-mono">
                        {actionLabels[a.type]}
                        {a.target && <span className="text-muted-foreground"> → {a.target}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
