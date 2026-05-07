import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/NavRail";
import { Button } from "@/components/ui/button";
import { Upload, Activity, Heart, Footprints, Moon, Loader2 } from "lucide-react";
import { Markdown } from "@/components/chat/Markdown";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadSettings } from "@/components/chat/Settings";

export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [
      { title: "Health — void" },
      { name: "description", content: "Upload your wearables data and get an AI readout of your health." },
    ],
  }),
  component: HealthPage,
});

function HealthPage() {
  const [fileName, setFileName] = useState<string>("");
  const [analysis, setAnalysis] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Please use an export under 5 MB (or trim to a recent window).");
      return;
    }
    setFileName(file.name);
    setLoading(true);
    setAnalysis("");
    try {
      const text = await file.text();
      // Trim to keep request small
      const sample = text.length > 200_000 ? text.slice(0, 100_000) + "\n\n[...truncated...]\n\n" + text.slice(-50_000) : text;

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
            { role: "system", content: "You are a careful health analyst. Read the wearables/health export. Summarize key vitals, trends, anomalies, and give 3 concrete, kind suggestions. Use markdown with headings. Always remind user you are not a doctor." },
            { role: "user", content: `My health export (${file.name}):\n\n${sample}` },
          ],
        }),
      });
      if (!res.ok || !res.body) throw new Error("Analysis failed");
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
      toast.error(e.message ?? "Failed to analyze");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell title="Health" subtitle="Drop an Apple Health, Fitbit, or Garmin export. void reads it and tells you what it sees.">
      <div className="grid sm:grid-cols-4 gap-3 mb-8">
        {[
          { icon: Heart, label: "Heart" },
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

      <label className="block">
        <div className="border-2 border-dashed border-border/70 hover:border-white/30 rounded-2xl p-10 text-center cursor-pointer transition-colors bg-card/30">
          <Upload className="size-6 mx-auto mb-3 text-muted-foreground" />
          <div className="font-medium text-[14px]">Upload health export</div>
          <div className="mt-1 text-[12px] text-muted-foreground">.xml, .csv, .json — up to 5 MB</div>
          {fileName && <div className="mt-3 text-[12px] text-white">{fileName}</div>}
        </div>
        <input
          type="file"
          accept=".xml,.csv,.json,.txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </label>

      {loading && (
        <div className="mt-8 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" /> Analyzing your data…
        </div>
      )}

      {analysis && (
        <div className="mt-8 p-6 rounded-2xl border border-border/60 bg-card/40">
          <Markdown content={analysis} />
        </div>
      )}

      <p className="mt-6 text-[11px] text-muted-foreground/70">
        void is not a medical professional. Consult a doctor for medical decisions. Your data is sent to the AI model only for this analysis.
      </p>
    </PageShell>
  );
}
