import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTaxBrackets,
  useListTaxRebates,
  useCreateTaxBracket,
  useUpdateTaxBracket,
  useDeleteTaxBracket,
  useCreateTaxRebate,
  useUpdateTaxRebate,
  useDeleteTaxRebate,
  getListTaxBracketsQueryKey,
  getListTaxRebatesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, AlertCircle, Percent, BadgeInfo } from "lucide-react";

const ZAR = (v: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(v);

const TAX_YEARS = [2025, 2026];

type BracketForm = {
  taxYear:     number;
  fromIncome:  string;
  toIncome:    string;
  rate:        string;
  baseAmount:  string;
  description: string;
};

const emptyBracket = (year: number): BracketForm => ({
  taxYear: year, fromIncome: "", toIncome: "", rate: "", baseAmount: "", description: "",
});

type RebateForm = {
  taxYear: number;
  type:    "PRIMARY" | "SECONDARY" | "TERTIARY";
  amount:  string;
};

const REBATE_LABELS: Record<string, string> = {
  PRIMARY:   "Primary (all taxpayers)",
  SECONDARY: "Secondary (65+ years)",
  TERTIARY:  "Tertiary (75+ years)",
};

export default function TaxBrackets() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [year, setYear] = useState(2026);

  const { data: brackets = [], isLoading: loadingB } = useListTaxBrackets({ year });
  const { data: rebates  = [], isLoading: loadingR } = useListTaxRebates({ year });

  const { mutate: createBracket, isPending: creatingB } = useCreateTaxBracket();
  const { mutate: updateBracket, isPending: updatingB } = useUpdateTaxBracket();
  const { mutate: deleteBracket }                        = useDeleteTaxBracket();
  const { mutate: createRebate,  isPending: creatingR } = useCreateTaxRebate();
  const { mutate: updateRebate,  isPending: updatingR } = useUpdateTaxRebate();
  const { mutate: deleteRebate }                         = useDeleteTaxRebate();

  // ── Bracket dialog ────────────────────────────────────────────────────────
  const [bracketDialog, setBracketDialog] = useState<{ open: boolean; editId?: string; form: BracketForm }>({
    open: false, form: emptyBracket(year),
  });

  function openNewBracket() {
    setBracketDialog({ open: true, editId: undefined, form: emptyBracket(year) });
  }

  function openEditBracket(b: typeof brackets[number]) {
    setBracketDialog({
      open: true,
      editId: b.id,
      form: {
        taxYear:     b.taxYear,
        fromIncome:  String(b.fromIncome),
        toIncome:    b.toIncome != null ? String(b.toIncome) : "",
        rate:        String(b.rate),
        baseAmount:  String(b.baseAmount),
        description: b.description ?? "",
      },
    });
  }

  function saveBracket() {
    const f = bracketDialog.form;
    const payload = {
      taxYear:     Number(f.taxYear),
      fromIncome:  parseFloat(f.fromIncome) || 0,
      toIncome:    f.toIncome ? parseFloat(f.toIncome) : null,
      rate:        parseFloat(f.rate) || 0,
      baseAmount:  parseFloat(f.baseAmount) || 0,
      description: f.description || undefined,
    };

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: getListTaxBracketsQueryKey({ year }) });
      setBracketDialog((d) => ({ ...d, open: false }));
    };

    if (bracketDialog.editId) {
      updateBracket(
        { id: bracketDialog.editId, data: payload },
        { onSuccess: invalidate, onError: () => toast({ title: "Update failed", variant: "destructive" }) },
      );
    } else {
      createBracket(
        { data: payload },
        { onSuccess: invalidate, onError: () => toast({ title: "Create failed", variant: "destructive" }) },
      );
    }
  }

  function confirmDeleteBracket(id: string) {
    if (!confirm("Delete this bracket?")) return;
    deleteBracket(
      { id },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getListTaxBracketsQueryKey({ year }) }) },
    );
  }

  // ── Rebate dialog ─────────────────────────────────────────────────────────
  const [rebateDialog, setRebateDialog] = useState<{
    open: boolean; editId?: string; form: RebateForm;
  }>({ open: false, form: { taxYear: year, type: "PRIMARY", amount: "" } });

  function openNewRebate() {
    setRebateDialog({ open: true, editId: undefined, form: { taxYear: year, type: "PRIMARY", amount: "" } });
  }

  function openEditRebate(r: typeof rebates[number]) {
    setRebateDialog({
      open: true, editId: r.id,
      form: { taxYear: r.taxYear, type: r.type as "PRIMARY" | "SECONDARY" | "TERTIARY", amount: String(r.amount) },
    });
  }

  function saveRebate() {
    const f = rebateDialog.form;
    const payload = { taxYear: Number(f.taxYear), type: f.type, amount: parseFloat(f.amount) || 0 };
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: getListTaxRebatesQueryKey({ year }) });
      setRebateDialog((d) => ({ ...d, open: false }));
    };
    if (rebateDialog.editId) {
      updateRebate(
        { id: rebateDialog.editId, data: payload },
        { onSuccess: invalidate, onError: () => toast({ title: "Update failed", variant: "destructive" }) },
      );
    } else {
      createRebate(
        { data: payload },
        { onSuccess: invalidate, onError: () => toast({ title: "Create failed", variant: "destructive" }) },
      );
    }
  }

  function confirmDeleteRebate(id: string) {
    if (!confirm("Delete this rebate?")) return;
    deleteRebate(
      { id },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getListTaxRebatesQueryKey({ year }) }) },
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">PAYE Tax Brackets</h1>
          <p className="text-muted-foreground">
            Manage SARS PAYE tax brackets and rebates used for commission payout estimates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Tax Year:</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y - 1}/{y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Brackets table ────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>Tax Brackets — {year - 1}/{year}</CardTitle>
            <CardDescription>
              Marginal tax rates applied on progressive income bands. Sourced from SARS.
            </CardDescription>
          </div>
          <Button size="sm" className="gap-2" onClick={openNewBracket}>
            <Plus className="h-4 w-4" /> Add Bracket
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loadingB ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : brackets.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              No brackets configured for {year - 1}/{year}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From (ZAR)</TableHead>
                  <TableHead>To (ZAR)</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Base Tax</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brackets.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{ZAR(b.fromIncome)}</TableCell>
                    <TableCell>{b.toIncome != null ? ZAR(b.toIncome) : <Badge variant="outline">No limit</Badge>}</TableCell>
                    <TableCell>
                      <Badge className="gap-1">
                        <Percent className="h-3 w-3" />{b.rate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{ZAR(b.baseAmount)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.description ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditBracket(b)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => confirmDeleteBracket(b.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Rebates ───────────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>Tax Rebates — {year - 1}/{year}</CardTitle>
            <CardDescription>
              Annual rebates subtracted from gross PAYE. Primary rebate applies to all taxpayers.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="gap-2" onClick={openNewRebate}>
            <Plus className="h-4 w-4" /> Add Rebate
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loadingR ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : rebates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No rebates configured for {year - 1}/{year}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount (ZAR p/a)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rebates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="secondary">{r.type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {REBATE_LABELS[r.type] ?? r.type}
                    </TableCell>
                    <TableCell className="font-medium">{ZAR(r.amount)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRebate(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => confirmDeleteRebate(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Info card ─────────────────────────────────────────────────────── */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900/50 shadow-sm">
        <CardContent className="pt-5">
          <div className="flex gap-3">
            <BadgeInfo className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-800 dark:text-blue-400 text-sm">SARS PAYE Brackets</p>
              <p className="text-xs text-blue-700 dark:text-blue-400/80 mt-1 leading-relaxed">
                Tax brackets are sourced from the SARS Budget and updated annually (usually in March following the
                Budget Speech). Pre-seeded data reflects the 2024/25 and 2025/26 tax years. The calculator uses
                <strong> baseAmount</strong> (tax already computed on income up to <em>fromIncome</em>) plus the
                marginal rate on the remainder.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Bracket dialog ────────────────────────────────────────────────── */}
      <Dialog open={bracketDialog.open} onOpenChange={(o) => setBracketDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bracketDialog.editId ? "Edit" : "Add"} Tax Bracket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tax Year</Label>
                <Select
                  value={String(bracketDialog.form.taxYear)}
                  onValueChange={(v) => setBracketDialog((d) => ({ ...d, form: { ...d.form, taxYear: Number(v) } }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAX_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y - 1}/{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Rate (%)</Label>
                <Input
                  type="number" min={0} max={100}
                  value={bracketDialog.form.rate}
                  onChange={(e) => setBracketDialog((d) => ({ ...d, form: { ...d.form, rate: e.target.value } }))}
                  placeholder="e.g. 18"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>From Income (ZAR)</Label>
                <Input
                  type="number" min={0}
                  value={bracketDialog.form.fromIncome}
                  onChange={(e) => setBracketDialog((d) => ({ ...d, form: { ...d.form, fromIncome: e.target.value } }))}
                  placeholder="e.g. 237100"
                />
              </div>
              <div className="space-y-1">
                <Label>To Income (ZAR, blank = no limit)</Label>
                <Input
                  type="number" min={0}
                  value={bracketDialog.form.toIncome}
                  onChange={(e) => setBracketDialog((d) => ({ ...d, form: { ...d.form, toIncome: e.target.value } }))}
                  placeholder="e.g. 370500"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Base Amount (ZAR) — tax already computed on income up to <em>From Income</em></Label>
              <Input
                type="number" min={0}
                value={bracketDialog.form.baseAmount}
                onChange={(e) => setBracketDialog((d) => ({ ...d, form: { ...d.form, baseAmount: e.target.value } }))}
                placeholder="e.g. 42678"
              />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Input
                value={bracketDialog.form.description}
                onChange={(e) => setBracketDialog((d) => ({ ...d, form: { ...d.form, description: e.target.value } }))}
                placeholder="e.g. 26% on R237,101 – R370,500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBracketDialog((d) => ({ ...d, open: false }))}>Cancel</Button>
            <Button onClick={saveBracket} disabled={creatingB || updatingB}>
              {creatingB || updatingB ? "Saving…" : "Save Bracket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rebate dialog ─────────────────────────────────────────────────── */}
      <Dialog open={rebateDialog.open} onOpenChange={(o) => setRebateDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rebateDialog.editId ? "Edit" : "Add"} Tax Rebate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tax Year</Label>
                <Select
                  value={String(rebateDialog.form.taxYear)}
                  onValueChange={(v) => setRebateDialog((d) => ({ ...d, form: { ...d.form, taxYear: Number(v) } }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAX_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y - 1}/{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select
                  value={rebateDialog.form.type}
                  onValueChange={(v) => setRebateDialog((d) => ({ ...d, form: { ...d.form, type: v as "PRIMARY" | "SECONDARY" | "TERTIARY" } }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRIMARY">PRIMARY — all taxpayers</SelectItem>
                    <SelectItem value="SECONDARY">SECONDARY — 65+ years</SelectItem>
                    <SelectItem value="TERTIARY">TERTIARY — 75+ years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Annual Amount (ZAR)</Label>
              <Input
                type="number" min={0}
                value={rebateDialog.form.amount}
                onChange={(e) => setRebateDialog((d) => ({ ...d, form: { ...d.form, amount: e.target.value } }))}
                placeholder="e.g. 17235"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRebateDialog((d) => ({ ...d, open: false }))}>Cancel</Button>
            <Button onClick={saveRebate} disabled={creatingR || updatingR}>
              {creatingR || updatingR ? "Saving…" : "Save Rebate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
