import { useState, useEffect } from "react";
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
import { Search, Plus, MoreHorizontal, Pencil, Trash2, Loader2, Building2 } from "lucide-react";
import { formatDate } from "@/lib/format";

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("incentiq_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

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

function AddCustomerDialog({ open, onOpenChange, onSuccess }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function handleClose() {
    if (saving) return;
    setName(""); setError(""); onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Customer name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) setError("A customer with this name already exists");
        else toast({ title: "Failed to add customer", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Customer added", description: `"${name.trim()}" has been saved.` });
      setName(""); setError("");
      onSuccess(); onOpenChange(false);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
          <DialogDescription>Add a new customer to the database for autocomplete in deals.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Field label="Customer Name" required error={error}>
            <Input
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
              placeholder="e.g. Acme Corporation"
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditCustomerDialog({ customer, onOpenChange, onSuccess }: {
  customer: any | null; onOpenChange: (v: boolean) => void; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (customer) { setName(customer.name); setError(""); }
  }, [customer?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Customer name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) setError("A customer with this name already exists");
        else toast({ title: "Failed to update customer", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Customer updated" });
      onSuccess(); onOpenChange(false);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!customer} onOpenChange={v => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Field label="Customer Name" required error={error}>
            <Input
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
              autoFocus
            />
          </Field>
          <DialogFooter>
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

function DeleteCustomerDialog({ customer, onOpenChange, onSuccess }: {
  customer: any | null; onOpenChange: (v: boolean) => void; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json();
        toast({ title: "Could not delete", description: d.error, variant: "destructive" });
        return;
      }
      toast({ title: "Customer deleted", description: `"${customer.name}" has been removed.` });
      onSuccess(); onOpenChange(false);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={!!customer} onOpenChange={v => { if (!deleting) onOpenChange(v); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{customer?.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the customer from the autocomplete list. Existing deals referencing this customer are not affected.
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
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function Customers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<any | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<any | null>(null);

  async function fetchCustomers() {
    setLoading(true);
    try {
      const res = await fetch("/api/customers", { headers: authHeaders() });
      if (res.ok) setCustomers(await res.json());
    } catch {
      toast({ title: "Failed to load customers", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCustomers(); }, []);

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground">Manage the customer list used for deal autocomplete</p>
        </div>
        <Button className="gap-2 w-fit" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Customer
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="pb-2">
            <p className="text-sm font-medium text-muted-foreground">Total Customers</p>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{customers.length}</div>}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2">
            <p className="text-sm font-medium text-muted-foreground">Search Results</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{search ? filtered.length : customers.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Customer Name</th>
                    <th className="px-6 py-4 font-medium">Date Added</th>
                    <th className="px-6 py-4 font-medium w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Building2 className="h-8 w-8 opacity-30" />
                          <span>{search ? "No customers match your search" : "No customers yet — they are saved automatically when deals are created"}</span>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.map((c: any) => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {c.createdAt ? formatDate(c.createdAt) : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={() => setEditCustomer(c)}
                              className="gap-2 cursor-pointer"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit Name
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteCustomer(c)}
                              className="gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} onSuccess={fetchCustomers} />
      <EditCustomerDialog customer={editCustomer} onOpenChange={v => { if (!v) setEditCustomer(null); }} onSuccess={fetchCustomers} />
      <DeleteCustomerDialog customer={deleteCustomer} onOpenChange={v => { if (!v) setDeleteCustomer(null); }} onSuccess={fetchCustomers} />
    </div>
  );
}
