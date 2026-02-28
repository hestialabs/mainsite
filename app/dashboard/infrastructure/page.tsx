'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Home, MapPin, ChevronRight, Hash } from 'lucide-react';

export default function InfrastructurePage() {
    const { token, isAdmin } = useAuth();
    const [homes, setHomes] = useState<api.Home[]>([]);
    const [rooms, setRooms] = useState<api.Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [homeOpen, setHomeOpen] = useState(false);
    const [roomOpen, setRoomOpen] = useState(false);
    const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!token) return;
        try {
            const homeRes = await api.listHomes(token);
            setHomes(homeRes.data.homes);

            if (homeRes.data.homes.length > 0) {
                const roomPromises = homeRes.data.homes.map(h => api.listRooms(token, h.id));
                const roomResults = await Promise.all(roomPromises);
                setRooms(roomResults.flatMap(r => r.data.rooms));
            }
        } catch {
            toast.error('Failed to load infrastructure');
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { load(); }, [load]);

    const handleCreateHome = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!token) return;
        const fd = new FormData(e.currentTarget);
        const name = fd.get('name') as string;

        try {
            await api.createHome(token, { name });
            toast.success('Home created');
            setHomeOpen(false);
            load();
        } catch (err) {
            toast.error('Failed to create home');
        }
    };

    const handleCreateRoom = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!token || !selectedHomeId) return;
        const fd = new FormData(e.currentTarget);
        const name = fd.get('name') as string;

        try {
            await api.createRoom(token, selectedHomeId, { name });
            toast.success('Room created');
            setRoomOpen(false);
            load();
        } catch (err) {
            toast.error('Failed to create room');
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-48" />
                <div className="grid gap-6 md:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold uppercase tracking-tighter text-foreground">Infrastructure</h1>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest">Manage your organizational hierarchy</p>
                </div>
                {isAdmin && (
                    <Dialog open={homeOpen} onOpenChange={setHomeOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="text-[10px] uppercase tracking-widest gap-2">
                                <Plus className="w-3 h-3" /> New Home
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle className="uppercase tracking-tighter">Create Home</DialogTitle>
                                <DialogDescription>Add a new top-level environment for your devices.</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateHome} className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase tracking-widest font-bold">Home Name</Label>
                                    <Input name="name" placeholder="Executive Suite" required className="font-mono text-sm" />
                                </div>
                                <DialogFooter>
                                    <Button type="submit" className="text-[10px] uppercase tracking-widest">Create</Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {homes.map((home) => (
                    <Card key={home.id} className="bg-card/30 border-border/50">
                        <CardHeader className="pb-3 border-b border-border/50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Home className="w-4 h-4 text-muted-foreground" />
                                    <CardTitle className="text-sm font-bold uppercase tracking-widest">{home.name}</CardTitle>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => { setSelectedHomeId(home.id); setRoomOpen(true); }}
                                >
                                    <Plus className="w-3 h-3" />
                                </Button>
                            </div>
                            <CardDescription className="text-[10px] font-mono uppercase truncate opacity-50">
                                {home.id}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="space-y-2">
                                <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2 flex items-center justify-between">
                                    <span>Rooms</span>
                                    <span className="opacity-50">{rooms.filter(r => r.home_id === home.id).length} units</span>
                                </div>
                                <div className="grid gap-1">
                                    {rooms.filter(r => r.home_id === home.id).map(room => (
                                        <div key={room.id} className="flex items-center justify-between p-2 rounded bg-background/50 border border-border/20 group hover:border-foreground/30 transition-all">
                                            <div className="flex items-center gap-2">
                                                <MapPin className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                                                <span className="text-xs font-medium">{room.name}</span>
                                            </div>
                                            <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                                        </div>
                                    ))}
                                    {rooms.filter(r => r.home_id === home.id).length === 0 && (
                                        <div className="text-[10px] text-muted-foreground italic p-2 text-center border border-dashed border-border/30 rounded">
                                            No rooms added yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Create Room Dialog */}
            <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-tighter">Add Room</DialogTitle>
                        <DialogDescription>Define a new organizational unit within your home.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateRoom} className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase tracking-widest font-bold">Room Name</Label>
                            <Input name="name" placeholder="Server Room A" required className="font-mono text-sm" />
                        </div>
                        <DialogFooter>
                            <Button type="submit" className="text-[10px] uppercase tracking-widest">Add Room</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
