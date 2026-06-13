import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCommissionRuleGroups,
  useCreateCommissionRuleGroup,
  useUpdateCommissionRuleGroup,
  useDeleteCommissionRuleGroup,
  getListCommissionRuleGroupsQueryKey,
  useListUsers,
} from "@workspace/api-client-react";
import type { CommissionRuleGroup, CommissionRuleInline } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Search, Users, Pencil, Trash2, Power, PowerOff,
  Layers, CheckCircle2, Globe, X, Sliders, CalendarIcon,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  format, parseISO, isValid, startOfMonth, endOfMonth,
  eachDayOfInterval, addMonths, subMonths, isSameMonth,
  isSameDay, isToday, getDay, addDays, subDays,
} from "date-fns";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ─── constants ────────────────────────────────────────────────────────────────

const DEAL_TYPES = [
  { value: "NET_NEW",    label: "Net New",    color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  { value: "RENEWAL",   label: "Renewal",    color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { value: "UPSELL",    label: "Upsell",     color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { value: "CROSS_SELL",label: "Cross-Sell", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
] as const;

function dealTypeColor(dt: string) {
  return DEAL_TYPES.find(d => d.value === dt)?.color ?? "bg-slate-500/20 text-slate-300 border-slate-500/30";
}
function dealTypeLabel(dt: string) {
  return DEAL_TYPES.find(d => d.value === dt)?.label ?? dt;
}
function formatGP(v: number | null | undefined) {
  if (v == null) return "—";
  return `R${v.toLocaleString("en-ZA")}`;
}
function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

// ─── date picker ─────────────────────────────────────────────────────────────

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function DatePickerField({
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value && isValid(parseISO(value)) ? parseISO(value) : null;
  const [month, setMonth] = useState<Date>(() =>
    startOfMonth(selected ?? new Date())
  );

  // Sync month when value changes externally
  if (selected && !isSameMonth(selected, month) && !open) {
    // only sync when closed to avoid jumpy nav
  }

  const display = selected ? format(selected, "d MMM yyyy") : null;

  // Build 6-row grid always (42 cells)
  const firstOfMonth = month;
  const lastOfMonth = endOfMonth(month);
  const gridStart = subDays(firstOfMonth, getDay(firstOfMonth));
  const gridEnd = addDays(lastOfMonth, 6 - getDay(lastOfMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function pickDay(day: Date) {
    onChange(format(day, "yyyy-MM-dd"));
    setMonth(startOfMonth(day));
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border px-2.5 text-xs text-left",
            "bg-slate-900/50 border-slate-700 transition-colors",
            "hover:border-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
            open && "border-indigo-500 ring-1 ring-indigo-500/30",
          )}
        >
          <CalendarIcon className="h-3 w-3 shrink-0 text-slate-500" />
          <span className={display ? "text-slate-200" : "text-slate-500"}>
            {display ?? placeholder}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[268px] p-0 bg-slate-900 border border-slate-700 shadow-2xl rounded-xl overflow-hidden"
      >
        {/* Month navigation */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setMonth(m => subMonths(m, 1))}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/70 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-slate-100 tracking-wide">
            {format(month, "MMMM yyyy")}
          </span>
          <button
            type="button"
            onClick={() => setMonth(m => addMonths(m, 1))}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/70 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 pb-3 pt-2">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="h-8 flex items-center justify-center text-[11px] font-medium text-slate-500 tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {days.map(day => {
              const inMonth = isSameMonth(day, month);
              const sel = selected && isSameDay(day, selected);
              const tod = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={cn(
                    "h-8 w-full rounded-lg text-xs font-medium transition-colors",
                    sel
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/50 hover:bg-indigo-500"
                      : tod && inMonth
                      ? "bg-slate-700/70 text-slate-100 ring-1 ring-slate-600 hover:bg-slate-600/70"
                      : inMonth
                      ? "text-slate-200 hover:bg-slate-700/60"
                      : "text-slate-600 hover:bg-slate-800/60",
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => pickDay(new Date())}
            className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Today
          </button>
          {clearable && value && (
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── types ────────────────────────────────────────────────────────────────────

interface RuleRow {
  _key: string;
  id?: string;
  dealType: string;
  commissionPercentage: string;
  minGrossProfit: string;
  maxGrossProfit: string;
  effectiveFrom: string;
  effectiveTo: string;
}

function newRow(): RuleRow {
  return {
    _key: crypto.randomUUID(),
    dealType: "NET_NEW",
    commissionPercentage: "",
    minGrossProfit: "",
    maxGrossProfit: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: "",
  };
}

function ruleToRow(r: CommissionRuleInline): RuleRow {
  return {
    _key: r.id,
    id: r.id,
    dealType: r.dealType,
    commissionPercentage: String(r.commissionPercentage),
    minGrossProfit: r.minGrossProfit != null ? String(r.minGrossProfit) : "",
    maxGrossProfit: r.maxGrossProfit != null ? String(r.maxGrossProfit) : "",
    effectiveFrom: r.effectiveFrom.slice(0, 10),
    effectiveTo: r.effectiveTo ? r.effectiveTo.slice(0, 10) : "",
  };
}

// ─── inline rules editor ─────────────────────────────────────────────────────

function RulesEditor({
  rows,
  onChange,
}: {
  rows: RuleRow[];
  onChange: (rows: RuleRow[]) => void;
}) {
  function updateRow(key: string, patch: Partial<RuleRow>) {
    onChange(rows.map(r => r._key === key ? { ...r, ...patch } : r));
  }
  function removeRow(key: string) {
    onChange(rows.filter(r => r._key !== key));
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-sm text-slate-500 py-2 text-center">No rules yet — add one below.</p>
      )}

      {rows.map((row) => (
        <div
          key={row._key}
          className="grid gap-2 p-3 rounded-lg border border-slate-700/50 bg-slate-800/40"
          style={{ gridTemplateColumns: "1fr 90px 110px 110px 120px 120px 36px" }}
        >
          {/* Deal Type */}
          <Select value={row.dealType} onValueChange={v => updateRow(row._key, { dealType: v })}>
            <SelectTrigger className="h-8 text-xs bg-slate-900/50 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEAL_TYPES.map(d => (
                <SelectItem key={d.value} value={d.value}>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium border ${d.color}`}>
                    {d.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Commission % */}
          <div className="relative">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              placeholder="0"
              value={row.commissionPercentage}
              onChange={e => updateRow(row._key, { commissionPercentage: e.target.value })}
              className="h-8 text-xs pr-6 bg-slate-900/50 border-slate-700"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
          </div>

          {/* Min GP */}
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">R</span>
            <Input
              type="number"
              min={0}
              placeholder="Min GP"
              value={row.minGrossProfit}
              onChange={e => updateRow(row._key, { minGrossProfit: e.target.value })}
              className="h-8 text-xs pl-5 bg-slate-900/50 border-slate-700"
            />
          </div>

          {/* Max GP */}
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">R</span>
            <Input
              type="number"
              min={0}
              placeholder="Max GP"
              value={row.maxGrossProfit}
              onChange={e => updateRow(row._key, { maxGrossProfit: e.target.value })}
              className="h-8 text-xs pl-5 bg-slate-900/50 border-slate-700"
            />
          </div>

          {/* Eff. From */}
          <DatePickerField
            value={row.effectiveFrom}
            onChange={v => updateRow(row._key, { effectiveFrom: v })}
            placeholder="From"
          />

          {/* Eff. To */}
          <DatePickerField
            value={row.effectiveTo}
            onChange={v => updateRow(row._key, { effectiveTo: v })}
            placeholder="To (optional)"
            clearable
          />

          {/* Remove */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
            onClick={() => removeRow(row._key)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      {/* Column labels — only show if there are rows */}
      {rows.length > 0 && (
        <div
          className="grid gap-2 px-3 text-[10px] text-slate-500"
          style={{ gridTemplateColumns: "1fr 90px 110px 110px 120px 120px 36px" }}
        >
          <span>Deal Type</span>
          <span>Comm %</span>
          <span>Min GP</span>
          <span>Max GP</span>
          <span>Eff. From</span>
          <span>Eff. To</span>
          <span />
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed border-slate-600 text-slate-400 hover:text-slate-200 hover:border-indigo-500 mt-1"
        onClick={() => onChange([...rows, newRow()])}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Rule
      </Button>
    </div>
  );
}

// ─── group card ───────────────────────────────────────────────────────────────

function GroupCard({
  group,
  onEdit,
  onToggle,
  onDelete,
}: {
  group: CommissionRuleGroup;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isActive = group.status === "ACTIVE";

  return (
    <Card className="bg-slate-800/50 border-slate-700/50 hover:border-slate-600/60 transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base font-semibold text-slate-100">{group.groupName}</CardTitle>
              <Badge
                variant="outline"
                className={isActive
                  ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px] px-1.5"
                  : "border-slate-600 text-slate-400 bg-slate-700/40 text-[10px] px-1.5"}
              >
                {isActive ? "Active" : "Inactive"}
              </Badge>
              {group.assignToAll && (
                <Badge variant="outline" className="border-indigo-500/40 text-indigo-400 bg-indigo-500/10 text-[10px] px-1.5">
                  <Globe className="h-2.5 w-2.5 mr-1" />
                  All Executives
                </Badge>
              )}
            </div>
            {group.description && (
              <p className="text-xs text-slate-400 mt-1">{group.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-indigo-400" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${isActive ? "text-slate-400 hover:text-amber-400" : "text-slate-500 hover:text-emerald-400"}`}
              onClick={onToggle}
            >
              {isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Rules table */}
        {group.rules.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No commission rules defined yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-700/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-900/30">
                  <th className="text-left px-3 py-2 text-slate-400 font-medium">Deal Type</th>
                  <th className="text-right px-3 py-2 text-slate-400 font-medium">Commission</th>
                  <th className="text-right px-3 py-2 text-slate-400 font-medium">Min GP</th>
                  <th className="text-right px-3 py-2 text-slate-400 font-medium">Max GP</th>
                  <th className="text-right px-3 py-2 text-slate-400 font-medium">Effective From</th>
                </tr>
              </thead>
              <tbody>
                {group.rules.map((rule, i) => (
                  <tr
                    key={rule.id}
                    className={`border-b border-slate-700/30 last:border-0 ${i % 2 === 0 ? "bg-slate-900/10" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${dealTypeColor(rule.dealType)}`}>
                        {dealTypeLabel(rule.dealType)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-indigo-400">
                      {rule.commissionPercentage}%
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">{formatGP(rule.minGrossProfit)}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{formatGP(rule.maxGrossProfit)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{formatDate(rule.effectiveFrom)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Members footer */}
        {!group.assignToAll && group.members.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Users className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            {group.members.map(m => (
              <span key={m.id} className="text-[10px] bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded-full">
                {m.firstName} {m.lastName}
              </span>
            ))}
          </div>
        )}
        {!group.assignToAll && group.members.length === 0 && (
          <p className="text-[10px] text-slate-600 italic">No members assigned.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── group dialog ─────────────────────────────────────────────────────────────

interface GroupFormState {
  groupName: string;
  description: string;
  assignToAll: boolean;
  memberUserIds: string[];
  rules: RuleRow[];
}

function GroupDialog({
  open,
  editing,
  onClose,
  onSave,
  isSaving,
  salesExecs,
}: {
  open: boolean;
  editing: CommissionRuleGroup | null;
  onClose: () => void;
  onSave: (state: GroupFormState) => void;
  isSaving: boolean;
  salesExecs: { id: string; firstName: string; lastName: string; email: string }[];
}) {
  const [form, setForm] = useState<GroupFormState>(() => ({
    groupName: "",
    description: "",
    assignToAll: false,
    memberUserIds: [],
    rules: [],
  }));
  const [errors, setErrors] = useState<{ groupName?: string; rules?: string }>({});

  // Sync form when dialog opens / editing changes
  useState(() => {});
  const [synced, setSynced] = useState<string | null>(null);
  if (open) {
    const key = editing ? editing.id : "__new__";
    if (synced !== key) {
      setSynced(key);
      if (editing) {
        setForm({
          groupName: editing.groupName,
          description: editing.description ?? "",
          assignToAll: editing.assignToAll,
          memberUserIds: editing.members.map(m => m.id),
          rules: editing.rules.map(ruleToRow),
        });
      } else {
        setForm({ groupName: "", description: "", assignToAll: false, memberUserIds: [], rules: [] });
      }
      setErrors({});
    }
  }

  function handleClose() {
    setSynced(null);
    onClose();
  }

  function validate() {
    const e: typeof errors = {};
    if (!form.groupName.trim()) e.groupName = "Group name is required.";
    if (form.rules.length === 0) e.rules = "Add at least one commission rule.";
    for (const r of form.rules) {
      if (!r.commissionPercentage || isNaN(parseFloat(r.commissionPercentage))) {
        e.rules = "All rules need a valid commission %.";
        break;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function toggleMember(id: string) {
    setForm(f => ({
      ...f,
      memberUserIds: f.memberUserIds.includes(id)
        ? f.memberUserIds.filter(x => x !== id)
        : [...f.memberUserIds, id],
    }));
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl bg-slate-900 border-slate-700 text-slate-100 p-0 max-h-[90vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-700/50 shrink-0">
          <DialogTitle className="text-lg font-semibold">
            {editing ? `Edit: ${editing.groupName}` : "Create Commission Group"}
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-sm">
            Define the group's commission rules directly and assign sales executives.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-6">
            {/* Name + Description */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Group Name <span className="text-red-400">*</span></Label>
                <Input
                  value={form.groupName}
                  onChange={e => setForm(f => ({ ...f, groupName: e.target.value }))}
                  placeholder="e.g. Enterprise Team"
                  className="bg-slate-800 border-slate-600 text-slate-100"
                />
                {errors.groupName && <p className="text-xs text-red-400">{errors.groupName}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Description</Label>
                <Input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                  className="bg-slate-800 border-slate-600 text-slate-100"
                />
              </div>
            </div>

            {/* Commission Rules */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-slate-300 text-sm">
                  Commission Rules <span className="text-red-400">*</span>
                </Label>
                <span className="text-xs text-slate-500">{form.rules.length} rule{form.rules.length !== 1 ? "s" : ""}</span>
              </div>
              <RulesEditor
                rows={form.rules}
                onChange={rows => {
                  setForm(f => ({ ...f, rules: rows }));
                  if (errors.rules) setErrors(e => ({ ...e, rules: undefined }));
                }}
              />
              {errors.rules && <p className="text-xs text-red-400">{errors.rules}</p>}
            </div>

            {/* Assignment */}
            <div className="space-y-3">
              <Label className="text-slate-300 text-sm">Assignment</Label>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
                <Switch
                  checked={form.assignToAll}
                  onCheckedChange={v => setForm(f => ({ ...f, assignToAll: v, memberUserIds: v ? [] : f.memberUserIds }))}
                />
                <div>
                  <p className="text-sm text-slate-200 font-medium">Apply to all sales executives</p>
                  <p className="text-xs text-slate-500">When enabled, this group applies to every sales exec in your organisation.</p>
                </div>
              </div>

              {!form.assignToAll && salesExecs.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-slate-400 text-xs">Select executives for this group</Label>
                  <ScrollArea className="h-40 rounded-lg border border-slate-700/50 bg-slate-800/20 p-2">
                    {salesExecs.map(u => (
                      <label key={u.id} className="flex items-center gap-3 px-2 py-2 rounded hover:bg-slate-700/30 cursor-pointer">
                        <Checkbox
                          checked={form.memberUserIds.includes(u.id)}
                          onCheckedChange={() => toggleMember(u.id)}
                          className="border-slate-600"
                        />
                        <div className="flex items-center gap-2">
                          <span className="h-6 w-6 rounded-full bg-indigo-600/40 text-indigo-300 text-[10px] font-semibold flex items-center justify-center">
                            {u.firstName[0]}{u.lastName[0]}
                          </span>
                          <div>
                            <p className="text-xs text-slate-200 font-medium">{u.firstName} {u.lastName}</p>
                            <p className="text-[10px] text-slate-500">{u.email}</p>
                          </div>
                        </div>
                        {form.memberUserIds.includes(u.id) && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-indigo-400 ml-auto" />
                        )}
                      </label>
                    ))}
                  </ScrollArea>
                  <p className="text-[10px] text-slate-500">
                    {form.memberUserIds.length} of {salesExecs.length} selected
                  </p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-slate-700/50 shrink-0">
          <Button variant="ghost" onClick={handleClose} className="text-slate-400 hover:text-slate-200">
            Cancel
          </Button>
          <Button
            onClick={() => { if (validate()) onSave(form); }}
            disabled={isSaving}
            className="bg-indigo-600 hover:bg-indigo-500"
          >
            {isSaving ? "Saving…" : editing ? "Save Changes" : "Create Group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function CommissionGroupsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: groups = [], isLoading } = useListCommissionRuleGroups<CommissionRuleGroup[]>();
  const { data: usersData } = useListUsers({ role: "SALES_EXECUTIVE" });
  const salesExecs = (usersData as any)?.users ?? (usersData as any) ?? [];

  const createGroup = useCreateCommissionRuleGroup();
  const updateGroup = useUpdateCommissionRuleGroup();
  const deleteGroup = useDeleteCommissionRuleGroup();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CommissionRuleGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommissionRuleGroup | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListCommissionRuleGroupsQueryKey() });

  const filtered = groups.filter(g =>
    g.groupName.toLowerCase().includes(search.toLowerCase()) ||
    (g.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = groups.filter(g => g.status === "ACTIVE").length;
  const globalCount = groups.filter(g => g.assignToAll).length;
  const totalRules = groups.reduce((s, g) => s + g.rules.length, 0);

  function openCreate() { setEditing(null); setDialogOpen(true); }
  function openEdit(g: CommissionRuleGroup) { setEditing(g); setDialogOpen(true); }

  async function handleSave(form: GroupFormState) {
    setIsSaving(true);
    const rules = form.rules.map(r => ({
      id: r.id,
      dealType: r.dealType,
      commissionPercentage: parseFloat(r.commissionPercentage),
      minGrossProfit: r.minGrossProfit !== "" ? parseFloat(r.minGrossProfit) : null,
      maxGrossProfit: r.maxGrossProfit !== "" ? parseFloat(r.maxGrossProfit) : null,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo || null,
    }));

    try {
      if (editing) {
        await updateGroup.mutateAsync({
          groupId: editing.id,
          data: {
            groupName: form.groupName.trim(),
            description: form.description.trim() || null,
            assignToAll: form.assignToAll,
            memberUserIds: form.assignToAll ? [] : form.memberUserIds,
            rules,
          } as any,
        });
        toast({ title: "Group updated", description: `"${form.groupName}" has been saved.` });
      } else {
        await createGroup.mutateAsync({
          data: {
            groupName: form.groupName.trim(),
            description: form.description.trim() || undefined,
            assignToAll: form.assignToAll,
            memberUserIds: form.assignToAll ? [] : form.memberUserIds,
            rules,
          } as any,
        });
        toast({ title: "Group created", description: `"${form.groupName}" is now active.` });
      }
      invalidate();
      setDialogOpen(false);
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(group: CommissionRuleGroup) {
    const next = group.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await updateGroup.mutateAsync({ groupId: group.id, data: { status: next } });
      invalidate();
      toast({ title: `Group ${next === "ACTIVE" ? "activated" : "deactivated"}`, description: `"${group.groupName}" is now ${next.toLowerCase()}.` });
    } catch {
      toast({ title: "Error", description: "Could not update group status.", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteGroup.mutateAsync({ groupId: deleteTarget.id });
      invalidate();
      toast({ title: "Group deleted", description: `"${deleteTarget.groupName}" and its rules have been removed.` });
    } catch {
      toast({ title: "Error", description: "Could not delete group.", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Commission Groups</h1>
          <p className="text-sm text-slate-400 mt-0.5">Define commission rules per group and assign them to sales executives.</p>
        </div>
        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-500 gap-2">
          <Plus className="h-4 w-4" />
          New Group
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Groups",   value: groups.length,  icon: <Layers className="h-4 w-4" />, color: "text-indigo-400" },
          { label: "Active Groups",  value: activeCount,    icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-400" },
          { label: "Global Groups",  value: globalCount,    icon: <Globe className="h-4 w-4" />, color: "text-blue-400" },
          { label: "Total Rules",    value: totalRules,     icon: <Sliders className="h-4 w-4" />, color: "text-amber-400" },
        ].map(s => (
          <Card key={s.label} className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-4 flex items-center gap-3">
              <span className={s.color}>{s.icon}</span>
              <div>
                <p className="text-2xl font-bold text-slate-100">{s.value}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search groups…"
          className="pl-9 bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500"
        />
      </div>

      {/* Groups grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-56 rounded-xl bg-slate-800/50" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Layers className="h-10 w-10 text-slate-600 mx-auto" />
          <p className="text-slate-400">{search ? "No groups match your search." : "No groups yet."}</p>
          {!search && (
            <Button onClick={openCreate} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
              <Plus className="h-4 w-4 mr-2" />
              Create your first group
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(g => (
            <GroupCard
              key={g.id}
              group={g}
              onEdit={() => openEdit(g)}
              onToggle={() => handleToggle(g)}
              onDelete={() => setDeleteTarget(g)}
            />
          ))}
        </div>
      )}

      {/* Group create/edit dialog */}
      <GroupDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        isSaving={isSaving}
        salesExecs={salesExecs}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Delete group?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete <strong className="text-slate-200">"{deleteTarget?.groupName}"</strong> and
              all its commission rules. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

