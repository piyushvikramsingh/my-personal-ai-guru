import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/NavRail";
import { Button } from "@/components/ui/button";
import { Upload, Activity, Heart, Footprints, Moon, Loader2, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { Markdown } from "@/components/chat/Markdown";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadSettings } from "@/lib/void-config";
import { parseHealthFile, type ParsedHealthData } from "@/lib/health-parser";

export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [
      { title: "Health — void" },
      { name: "description", content: "Upload your wearables data and get an AI readout of your health." },
    ],
  }),
  component: HealthPage,
});

const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const SUPPORTED_FORMATS = [
  { label: "Apple Health", detail: "export.xml from Health app → export" },
  { label: "Fitbit CSV", detail: "Any Fitbit CSV export (heart_rate, sleep, steps, etc.)" },
  { label: "Garmin / JSON", detail: ".json exports from Garmin Connect or other devices" },
  { label: "Generic CSV/TXT", detail: "Any structured health data in text format" },
];

function ParseSummaryCard({ data }: { data: ParsedHealthData }) {
  const total = data.vitals.length + data.sleep.length + data.activity.length;
  return (
    <div className="mb-5 p-4 rounded-xl border border-border/60 bg-card/40 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle className="size-4 text-green-400" />
        <span className="text-[13px] font-medium">Parsed: <span className="capitalize">{data.format}</span> format · {data.rawSampleSize.toLocaleString()} records · {total} metrics extracted</span>
      </div>
      {data.errors.length > 0 && (
        <div className="flex gap-2 text-[12px] text-red-300 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          <ul className="space-y-0.5">{data.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {data.warnings.length > 0 && (
        <div className="flex gap-2 text-[12px] text-yellow-300 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <Info className="size-3.5 mt-0.5 shrink-0" />
          <ul className="space-y-0.5">{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      {total > 0 && (
        <div className="grid grid-cols-3 gap-2 pt-1">
          {[
            { label: "Vitals", items: data.vitals, icon: Heart },
            { label: "Sleep", items: data.sleep, icon: Moon },
            { label: "Activity", items: data.activity, icon: Footprints },
          ].map(({ label, items, icon: Icon }) => (
            <div key={label} className="p-3 rounded-lg bg-white/5 border border-border/60">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
              </div>
              {items.slice(0, 3).map((m) => (
                <div key={m.name} className="text-[12px] text-white/80 flex justify-between gap-2 mb-0.5">
                  <span className="text-muted-foreground truncate">{m.name}</span>
                  <span className="font-mono shrink-0">{m.value}{m.unit ? <span className="text-muted-foreground/70 ml-0.5 text-[10px]">{m.unit}</span> : null}</span>
                </div>
              ))}
              {items.length > 3 && <div className="text-[11px] text-muted-foreground mt-1">+{items.length - 3} more</div>}
              {items.length === 0 && <div className="text-[11px] text-muted-foreground/50 italic">No data</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HealthPage() {
  const [fileName, setFileName] = useState<string>("");
  const [analysis, setAnalysis] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedHealthData | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is ${MAX_MB} MB. Try exporting a shorter date range.`);
      return;
    }

    setFileName(file.name);
    setLoading(true);
    setAnalysis("");
    setParsedData(null);

    try {
      const text = await file.text();
      const { data: parsed, normalizedText } = parseHealthFile(text, file.name, file.type);
      setParsedData(parsed);

      if (parsed.errors.length > 0 && parsed.vitals.length === 0 && parsed.sleep.length === 0 && parsed.activity.length === 0) {
        toast.error(parsed.errors[0]);
        setLoading(false);
        return;
      }

      const settings = loadSettings();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            {
              role: "system",
              content: `You are a careful, empathetic health analyst. You have been given pre-parsed health data. 
Analyze the normalized metrics, identify patterns, trends, and anomalies. 
Give 3–5 concrete, actionable, kind suggestions grounded in the data. 
Use markdown with clear headings (##). Format numbers clearly. 
Always remind the user you are not a doctor and cannot replace medical advice.`,
            },
            {
              role: "user",
              content: normalizedText,
            },
          ],
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        let msg = "Analysis failed";
        try { msg = JSON.parse(errText).error || msg; } catch {}
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const j = JSON.parse(data);
            const delta = j.choices?.[0]?.delta?.content;
            if (delta) { acc += delta; setAnalysis(acc); }
          } catch {}
        }
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to analyze health data");
    } finally {
      setLoading(false);
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  return (
    <PageShell title="Health" subtitle="Drop an Apple Health, Fitbit, Garmin, or CSV export. void reads and normalizes it before analysis.">
      <div className="grid sm:grid-cols-4 gap-3 mb-8">
        {[
          { icon: Heart, label: "Vitals" },
          { icon: Footprints, label: "Activity" },
          { icon: Moon, label: "Sleep" },
          { icon: Activity, label: "Trends" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="p-4 rounded-xl border border-border/60 bg-card/40 flex items-center gap-3">
            <Icon className="size-4 text-muted-foreground" />
            <span className="text-[13px]">{label}</span>
          </div>
        ))}
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="block cursor-pointer"
      >
        <div className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
          dragOver
            ? "border-white/50 bg-white/5"
            : "border-border/70 hover:border-white/30 bg-card/30"
        }`}>
          <Upload className="size-6 mx-auto mb-3 text-muted-foreground" />
          <div className="font-medium text-[14px]">Upload or drop health export</div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            Apple Health <code className="text-xs bg-white/5 px-1 rounded">export.xml</code> · Fitbit CSV · Garmin JSON · up to {MAX_MB} MB
          </div>
          {fileName && <div className="mt-3 text-[12px] text-white font-medium">{fileName}</div>}
        </div>
        <input
          type="file"
          accept=".xml,.csv,.json,.txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </label>

      <div className="mt-5 grid sm:grid-cols-2 gap-2">
        {SUPPORTED_FORMATS.map((f) => (
          <div key={f.label} className="flex items-start gap-2 p-3 rounded-lg border border-border/40 bg-card/20">
            <CheckCircle className="size-3.5 text-green-400/70 mt-0.5 shrink-0" />
            <div>
              <div className="text-[12px] font-medium text-white/80">{f.label}</div>
              <div className="text-[11px] text-muted-foreground">{f.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="mt-8 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          {parsedData ? "Sending to model for analysis…" : "Parsing health data…"}
        </div>
      )}

      {parsedData && !loading && <div className="mt-8"><ParseSummaryCard data={parsedData} /></div>}

      {analysis && (
        <div className="mt-4 p-6 rounded-2xl border border-border/60 bg-card/40">
          <Markdown content={analysis} />
        </div>
      )}

      <p className="mt-6 text-[11px] text-muted-foreground/70">
        void is not a medical professional. Consult a doctor for medical decisions. Data is parsed on your device — only the normalized summary and a raw sample are sent to the AI model.
      </p>
    </PageShell>
  );
}
