"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Building2, Download, Landmark, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PayrollRun = {
  id: string;
  periodLabel: string;
  payDate: string;
  status: string;
  totalNetPay: number;
  employeeCount: number;
};

const integrations = [
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    description:
      "Export a balanced payroll journal ready for QuickBooks import.",
    badge: "QB",
    color: "bg-transparent",
  },
  {
    id: "xero",
    name: "Xero",
    description:
      "Generate a Xero manual-journal CSV from a completed payroll run.",
    badge: "X",
    color: "bg-transparent",
  },
  {
    id: "bank",
    name: "Banking",
    description:
      "Create a payment instruction file using employee bank details and net pay.",
    badge: "",
    color: "bg-[#ff5900]",
  },
] as const;

function peso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

export function PayrollExportsClient() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [runId, setRunId] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/integrations");
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not load integrations");
      setRuns(data.runs ?? []);
      setRunId((current) => current || data.runs?.[0]?.id || "");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load integrations",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function download(type: string) {
    if (!runId) return toast.error("Select a payroll run first.");
    setDownloading(type);
    try {
      const response = await fetch(
        `/api/integrations?runId=${encodeURIComponent(runId)}&type=${encodeURIComponent(type)}`,
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not generate export");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? `${type}-payroll.csv`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Export generated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not generate export",
      );
    } finally {
      setDownloading(null);
    }
  }

  const selected = runs.find((run) => run.id === runId);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#759b00]">
            Business
          </p>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Move approved payroll data into accounting and banking workflows.
          </p>
        </div>
        <span className="rounded-full bg-[#ff5900]/20 px-3 py-1 text-xs font-semibold text-[#9a3412]">
          Highest tier
        </span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4" /> Payroll source
          </CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="h-10 w-full rounded-md border bg-white px-3 text-sm md:max-w-xl"
            value={runId}
            disabled={loading}
            onChange={(event) => setRunId(event.target.value)}
          >
            <option value="">
              {loading
                ? "Loading payroll runs…"
                : "Select approved payroll run"}
            </option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.periodLabel} · {run.employeeCount} employees ·{" "}
                {peso(run.totalNetPay)}
              </option>
            ))}
          </select>
          {selected && (
            <p className="mt-2 text-xs text-slate-500">
              Pay date {new Date(selected.payDate).toLocaleDateString("en-PH")}{" "}
              · {selected.status}
            </p>
          )}
          {!loading && runs.length === 0 && (
            <p className="mt-2 text-sm text-amber-700">
              Approve or lock a payroll run before creating an integration
              export.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {integrations.map((integration) => (
          <Card key={integration.id} className="overflow-hidden">
            <CardContent className="p-5">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-black text-white ${integration.color}`}
              >
                {integration.id === "bank" ? (
                  <Landmark className="h-7 w-7 text-primary" />
                ) : (
                  <Image src={integration.id === "quickbooks" ? "/integrations/quickbooks.png" : "/integrations/xero.webp"} alt={integration.name} width={56} height={56} className="h-14 w-14 rounded-full object-contain" />
                )}
              </div>
              <div className="mt-5 flex items-start justify-between gap-2">
                <h2 className="font-bold">{integration.name}</h2>
                <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-500">
                  CSV
                </span>
              </div>
              <p className="mt-2 min-h-10 text-sm text-slate-500">
                {integration.description}
              </p>
              <Button
                className="mt-5 w-full"
                disabled={!runId || downloading !== null}
                onClick={() => void download(integration.id)}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloading === integration.id
                  ? "Generating…"
                  : "Generate export"}
              </Button>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <Building2 className="h-3.5 w-3.5" /> Direct connection coming
                next
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <b>Export controls:</b> Only approved or locked payroll runs are
        available. Accounting files are balanced summaries; bank files contain
        one payment row per employee. Review account mappings and bank details
        before importing.
      </div>
    </div>
  );
}
