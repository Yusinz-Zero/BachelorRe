import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { usePoll } from "../hooks";
import { api, type StatusResponse } from "../lib/api";
import { AnimateYFade } from "../components/layout";
import { PcHookCard } from "../components/pc-hook";
import { Button, Card, CardHead, Badge, Field, Switch, inputCls } from "../components/ui";

export function SettingsPage() {
  const { data } = usePoll<StatusResponse>(() => api.status(), 8000);
  const s = data?.settings || {};

  const [form, setForm] = useState({
    ServerPort: 8443,
    TrainerPort: 9443,
    GamePath: "",
    RosterMode: "none",
    FreshStartPatchEnabled: false,
    AutoUpdate: false,
    RollbackOnFail: true,
    CheckForUpdateOnStart: false,
    MinimizeToTrayOnClose: true,
    BgEnabled: true,
  });
  const [saved, setSaved] = useState<null | boolean>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm((f) => ({
      ...f,
      ServerPort: Number(s.ServerPort ?? f.ServerPort),
      TrainerPort: Number(s.TrainerPort ?? f.TrainerPort),
      GamePath: String(s.GamePath ?? f.GamePath),
      RosterMode: String(s.RosterMode ?? f.RosterMode),
      FreshStartPatchEnabled: !!s.FreshStartPatchEnabled,
      AutoUpdate: !!s.AutoUpdate,
      RollbackOnFail: s.RollbackOnFail !== false && s.RollbackOnFail !== undefined ? !!s.RollbackOnFail : f.RollbackOnFail,
      CheckForUpdateOnStart: !!s.CheckForUpdateOnStart,
      MinimizeToTrayOnClose: s.MinimizeToTrayOnClose !== false && s.MinimizeToTrayOnClose !== undefined ? !!s.MinimizeToTrayOnClose : f.MinimizeToTrayOnClose,
      BgEnabled: s.BgEnabled !== false && s.BgEnabled !== undefined ? !!s.BgEnabled : f.BgEnabled,
    }));
  }, [data, s]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const [browsing, setBrowsing] = useState(false);
  const browse = async () => {
    setBrowsing(true);
    try {
      const res = await api.browseGamePath();
      const p = res.path?.trim();
      if (p) {
        set("GamePath", p);
        const savedRes = await api.saveSettings({ GamePath: p });
        setSaved(!!savedRes.ok && !savedRes.error);
        setTimeout(() => setSaved(null), 2000);
      }
    } catch {
      setSaved(false);
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setBrowsing(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.saveSettings({
        ServerPort: Number(form.ServerPort),
        TrainerPort: Number(form.TrainerPort),
        GamePath: form.GamePath.trim(),
        RosterMode: form.RosterMode,
        FreshStartPatchEnabled: form.FreshStartPatchEnabled,
        AutoUpdate: form.AutoUpdate,
        RollbackOnFail: form.RollbackOnFail,
        CheckForUpdateOnStart: form.CheckForUpdateOnStart,
        MinimizeToTrayOnClose: form.MinimizeToTrayOnClose,
        BgEnabled: !!form.BgEnabled,
      });
      setSaved(!!res.ok && !res.error);
    } catch {
      setSaved(false);
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(null), 2000);
    }
  };

  return (
    <AnimateYFade className="w-full max-w-xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Stored in launcher-settings.json · Region/Version locked by manifest</p>
      </div>

      <Card>
        <CardHead title="Runtime" right={saved === null ? null : <Badge tone={saved ? "ok" : "bad"}>{saved ? "saved ✓" : "failed ✖"}</Badge>} />

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Server port (S uvicorn)">
              <input className={inputCls} type="number" value={form.ServerPort} onChange={(e) => set("ServerPort", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Trainer port (C)">
              <input className={inputCls} type="number" value={form.TrainerPort} onChange={(e) => set("TrainerPort", Number(e.target.value) || 0)} />
            </Field>
          </div>

          <Field label="Game path (Arknights.exe)" hint="used by pc-setup + PC attach">
            <div className="flex gap-2">
              <input
                className={inputCls + " font-mono text-xs"}
                placeholder="C:\…\Arknights\game\Arknights.exe"
                value={form.GamePath}
                onChange={(e) => set("GamePath", e.target.value)}
                spellCheck={false}
              />
              <Button variant="outline" onClick={browse} loading={browsing} className="shrink-0">
                <FolderOpen className="size-4" /> Browse
              </Button>
            </div>
          </Field>

          <Field label="Roster mode (fresh-start patch)">
            <select className={inputCls} value={form.RosterMode} onChange={(e) => set("RosterMode", e.target.value)}>
              <option value="none">none</option>
              <option value="starter">starter</option>
              <option value="all">all</option>
            </select>
          </Field>

          <div className="space-y-3 border-t border-border pt-4">
            {(
              [
                ["FreshStartPatchEnabled", "Fresh-start patch", "starter roster mode for new accounts"],
                ["AutoUpdate", "Auto update", "fetch new S/C releases automatically"],
                ["CheckForUpdateOnStart", "Check on start", "check for updates when the launcher opens"],
                ["RollbackOnFail", "Rollback on fail", "restore the previous version if an update/patch breaks"],
                ["MinimizeToTrayOnClose", "Minimize to tray", "closing keeps the app in the system tray — game + launcher server keep running; the tray icon has Open / Quit"],
              ] as const
            ).map(([key, label, hint]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{label}</div>
                  <div className="text-xs text-muted-foreground">{hint}</div>
                </div>
                <Switch checked={form[key]} onChange={(v) => set(key, v as never)} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={save} loading={saving}>Save settings</Button>
        </div>
      </Card>

      <PcHookCard className="mt-4" />

      <Card className="mt-4">
        <CardHead title="Environment (locked)" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Region">
            <input className={inputCls} value={String(s.Region ?? "EN")} disabled />
          </Field>
          <Field label="Client version">
            <input className={inputCls} value={String(s.ClientVersion ?? "37.7.41")} disabled />
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">These values come from the manifest (openbatch S/C) — only updates change them</p>
      </Card>
    </AnimateYFade>
  );
}
