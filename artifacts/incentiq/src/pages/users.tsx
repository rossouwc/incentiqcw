import { useState, useEffect } from "react";
import { useListUsers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, MoreHorizontal, Pencil, Trash2, UserCheck, UserX, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/format";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  { value: "ADMIN",           label: "Admin" },
  { value: "MANAGER",         label: "Manager" },
  { value: "SALES_EXECUTIVE", label: "Sales Executive" },
  { value: "FINANCE",         label: "Finance" },
  { value: "EXECUTIVE",       label: "Executive" },
  { value: "PAYROLL",         label: "Payroll" },
];

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN:     "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  ADMIN:           "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  MANAGER:         "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  FINANCE:         "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  SALES_EXECUTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  EXECUTIVE:       "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  PAYROLL:         "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

// ─── Auth helper ──────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("incentiq_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Add User Dialog ──────────────────────────────────────────────────────────

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

function AddUserDialog({ open, onOpenChange, onSuccess }: AddUserDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", role: "", password: "", confirmPassword: "",
  });

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: "" }));
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = "Required";
    if (!form.lastName.trim()) errs.lastName = "Required";
    if (!form.email.trim()) errs.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Invalid email";
    if (!form.role) errs.role = "Required";
    if (form.password && form.password.length < 8) errs.password = "Minimum 8 characters";
    if (form.password && form.confirmPassword && form.password !== form.confirmPassword)
      errs.confirmPassword = "Passwords do not match";
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role,
          password: form.password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) setErrors({ email: "This email is already registered" });
        else toast({ title: "Failed to create user", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "User created", description: `${form.firstName} ${form.lastName} has been added to the system.` });
      setForm({ firstName: "", lastName: "", email: "", role: "", password: "", confirmPassword: "" });
      setErrors({});
      onSuccess();
      onOpenChange(false);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (saving) return;
    setForm({ firstName: "", lastName: "", email: "", role: "", password: "", confirmPassword: "" });
    setErrors({});
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>
            Create a new user account. They can log in immediately with the password you set, or the default if left blank.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required error={errors.firstName}>
              <Input value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="Jane" autoFocus />
            </Field>
            <Field label="Last Name" required error={errors.lastName}>
              <Input value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Smith" />
            </Field>
          </div>
          <Field label="Email Address" required error={errors.email}>
            <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="jane@company.co.za" />
          </Field>
          <Field label="Role" required error={errors.role}>
            <Select value={form.role} onValueChange={v => set("role", v)}>
              <SelectTrigger className={errors.role ? "border-red-500" : ""}>
                <SelectValue placeholder="Select a role…" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Password" error={errors.password}>
              <Input
                type="password"
                value={form.password}
                onChange={e => set("password", e.target.value)}
                placeholder="Min 8 characters"
              />
            </Field>
            <Field label="Confirm Password" error={errors.confirmPassword}>
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={e => set("confirmPassword", e.target.value)}
                placeholder="Repeat password"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave password blank to use the default: <code className="bg-muted px-1 rounded">Incentiq@2024!</code>
          </p>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit User Dialog ─────────────────────────────────────────────────────────

interface EditUserDialogProps {
  user: any | null;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

function EditUserDialog({ user, onOpenChange, onSuccess }: EditUserDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ firstName: "", lastName: "", role: "", status: "" });

  useEffect(() => {
    if (user) {
      setForm({ firstName: user.firstName, lastName: user.lastName, role: user.role, status: user.status });
      setErrors({});
    }
  }, [user?.id]);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: "" }));
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = "Required";
    if (!form.lastName.trim()) errs.lastName = "Required";
    if (!form.role) errs.role = "Required";
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), role: form.role, status: form.status }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Failed to update user", description: data.error, variant: "destructive" }); return; }
      toast({ title: "User updated", description: `${form.firstName} ${form.lastName}'s profile has been saved.` });
      onSuccess();
      onOpenChange(false);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={v => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update profile details, role, or account status.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required error={errors.firstName}>
              <Input value={form.firstName} onChange={e => set("firstName", e.target.value)} />
            </Field>
            <Field label="Last Name" required error={errors.lastName}>
              <Input value={form.lastName} onChange={e => set("lastName", e.target.value)} />
            </Field>
          </div>
          <Field label="Email Address">
            <Input value={user?.email ?? ""} disabled className="opacity-60 cursor-not-allowed" />
            <p className="text-xs text-muted-foreground">Email cannot be changed</p>
          </Field>
          <Field label="Role" required error={errors.role}>
            <Select value={form.role} onValueChange={v => set("role", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Account Status">
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

interface DeleteUserDialogProps {
  user: any | null;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

function DeleteUserDialog({ user, onOpenChange, onSuccess }: DeleteUserDialogProps) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json();
        toast({ title: "Could not delete user", description: d.error, variant: "destructive" });
        return;
      }
      toast({ title: "User removed", description: `${user.firstName} ${user.lastName} has been deleted.` });
      onSuccess();
      onOpenChange(false);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={!!user} onOpenChange={v => { if (!deleting) onOpenChange(v); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {user?.firstName} {user?.lastName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove <strong>{user?.email}</strong> and all their associated data from the system. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white gap-2"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete User
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Users() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [addOpen, setAddOpen]   = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [deleteUser, setDeleteUser] = useState<any | null>(null);

  const { data: usersData, isLoading } = useListUsers();
  const users: any[] = Array.isArray(usersData) ? usersData : (usersData as any)?.data ?? [];

  const filtered = users.filter((u: any) => {
    const matchSearch = !search ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "ALL" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
  }

  const stats = [
    { label: "Total Users",  value: users.length,                                                  accent: "border-l-primary" },
    { label: "Active",       value: users.filter((u: any) => u.status !== "INACTIVE").length,      accent: "border-l-emerald-500" },
    { label: "Sales Reps",   value: users.filter((u: any) => u.role === "SALES_EXECUTIVE").length, accent: "border-l-blue-400" },
    { label: "Managers",     value: users.filter((u: any) => u.role === "MANAGER").length,         accent: "border-l-amber-400" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <p className="text-muted-foreground">Manage your company's users and roles</p>
        </div>
        <Button className="gap-2 w-fit" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className={`border-l-4 ${s.accent} shadow-sm`}>
            <CardHeader className="pb-2">
              <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{s.value}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Roles</SelectItem>
                {ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">User</th>
                    <th className="px-6 py-4 font-medium">Role</th>
                    <th className="px-6 py-4 font-medium">Joined</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        {search || roleFilter !== "ALL" ? "No users match your search" : "No users yet — add one to get started"}
                      </td>
                    </tr>
                  ) : filtered.map((u: any) => {
                    const isActive = u.status !== "INACTIVE";
                    return (
                      <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        {/* Avatar + Name */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                              isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                            }`}>
                              {u.firstName?.charAt(0)}{u.lastName?.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-foreground">{u.firstName} {u.lastName}</div>
                              <div className="text-xs text-muted-foreground">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        {/* Role */}
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-800"}`}>
                            {u.role?.replace(/_/g, " ")}
                          </span>
                        </td>
                        {/* Joined */}
                        <td className="px-6 py-4 text-muted-foreground">
                          {u.createdAt ? formatDate(u.createdAt) : "—"}
                        </td>
                        {/* Status */}
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                                     : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}>
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() => setEditUser(u)}
                                className="gap-2 cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit User
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  const newStatus = isActive ? "INACTIVE" : "ACTIVE";
                                  const res = await fetch(`/api/users/${u.id}`, {
                                    method: "PATCH",
                                    headers: authHeaders(),
                                    body: JSON.stringify({ status: newStatus }),
                                  });
                                  if (res.ok) {
                                    refetch();
                                  }
                                }}
                                className="gap-2 cursor-pointer"
                              >
                                {isActive
                                  ? <><UserX className="h-3.5 w-3.5" /> Deactivate</>
                                  : <><UserCheck className="h-3.5 w-3.5" /> Activate</>
                                }
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteUser(u)}
                                className="gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} onSuccess={refetch} />
      <EditUserDialog user={editUser} onOpenChange={v => { if (!v) setEditUser(null); }} onSuccess={refetch} />
      <DeleteUserDialog user={deleteUser} onOpenChange={v => { if (!v) setDeleteUser(null); }} onSuccess={refetch} />
    </div>
  );
}
