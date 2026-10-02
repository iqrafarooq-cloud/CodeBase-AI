"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import { saveProfile, type ProfileInput } from "@/lib/profile-actions";
import { cn } from "@/lib/utils";

const LEVELS = [
  { value: "beginner", label: "Beginner", hint: "New to professional codebases" },
  { value: "intermediate", label: "Intermediate", hint: "Comfortable shipping features" },
  { value: "advanced", label: "Advanced", hint: "Experienced; want the big picture fast" },
] as const;

const ROLES = [
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "fullstack", label: "Full Stack" },
  { value: "mobile", label: "Mobile" },
  { value: "devops", label: "DevOps" },
  { value: "other", label: "Other" },
] as const;

type Values = {
  display_name: string;
  experience_level: ProfileInput["experience_level"];
  developer_role: ProfileInput["developer_role"];
  learning_style: string;
  learning_goal: string;
  weekly_hours: string;
};

function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  name,
}: {
  options: readonly { value: T; label: string; hint?: string }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === o.value}
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
            value === o.value ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-muted",
          )}
        >
          <span className="font-medium">{o.label}</span>
          {o.hint && <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function ProfileForm({ initial, mode }: { initial: Partial<Values>; mode: "wizard" | "settings" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Values>({
    display_name: initial.display_name ?? "",
    experience_level: initial.experience_level ?? null,
    developer_role: initial.developer_role ?? null,
    learning_style: initial.learning_style ?? "",
    learning_goal: initial.learning_goal ?? "",
    weekly_hours: initial.weekly_hours ?? "",
  });
  const set = <K extends keyof Values>(k: K, value: Values[K]) => setV((s) => ({ ...s, [k]: value }));

  const submit = (skipOptional = false) =>
    startTransition(async () => {
      const res = await saveProfile({
        display_name: v.display_name,
        experience_level: v.experience_level,
        developer_role: v.developer_role,
        learning_style: skipOptional ? null : v.learning_style,
        learning_goal: v.learning_goal,
        weekly_hours: skipOptional || !v.weekly_hours ? null : Number(v.weekly_hours),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(mode === "wizard" ? "Profile saved - welcome aboard!" : "Profile updated");
      if (mode === "wizard") router.push("/dashboard");
      else router.refresh();
    });

  const steps = [
    {
      title: "What should we call you?",
      valid: v.display_name.trim().length > 0,
      body: (
        <div className="space-y-2">
          <Label htmlFor="display_name">Display name</Label>
          <Input id="display_name" value={v.display_name} onChange={(e) => set("display_name", e.target.value)} maxLength={80} autoFocus />
        </div>
      ),
    },
    {
      title: "Your experience and role",
      valid: Boolean(v.experience_level && v.developer_role),
      body: (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Experience level</Label>
            <ChoiceGrid name="Experience level" options={LEVELS} value={v.experience_level} onChange={(x) => set("experience_level", x)} />
          </div>
          <div className="space-y-2">
            <Label>Primary role</Label>
            <ChoiceGrid name="Primary role" options={ROLES} value={v.developer_role} onChange={(x) => set("developer_role", x)} />
          </div>
        </div>
      ),
    },
    {
      title: "Your onboarding goal",
      valid: true,
      body: (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="learning_goal">Main onboarding goal</Label>
            <Textarea
              id="learning_goal"
              rows={3}
              maxLength={500}
              placeholder="e.g. Ship my first backend ticket in the payments service"
              value={v.learning_goal}
              onChange={(e) => set("learning_goal", e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="learning_style">Preferred learning style (optional)</Label>
              <Input id="learning_style" maxLength={200} placeholder="e.g. Hands-on, diagrams first" value={v.learning_style} onChange={(e) => set("learning_style", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weekly_hours">Hours per week (optional)</Label>
              <Input id="weekly_hours" type="number" min={1} max={80} value={v.weekly_hours} onChange={(e) => set("weekly_hours", e.target.value)} />
            </div>
          </div>
        </div>
      ),
    },
  ];

  if (mode === "settings") {
    return (
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {steps.map((s) => (
          <section key={s.title} className="space-y-3">
            <h2 className="text-sm font-semibold">{s.title}</h2>
            {s.body}
          </section>
        ))}
        <Button type="submit" disabled={pending || !v.display_name.trim()}>
          {pending && <Loader2 className="animate-spin" />} Save changes
        </Button>
      </form>
    );
  }

  const current = steps[step];
  const last = step === steps.length - 1;
  return (
    <div>
      <div className="mb-6 flex gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((_, i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
          <h2 className="mb-4 text-lg font-semibold">{current.title}</h2>
          {current.body}
        </motion.div>
      </AnimatePresence>
      <div className="mt-8 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || pending}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex gap-2">
          {step > 0 && !last && (
            <Button variant="ghost" onClick={() => submit(true)} disabled={pending || !v.display_name.trim()}>
              Skip for now
            </Button>
          )}
          {last ? (
            <Button onClick={() => submit()} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Finish
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!current.valid}>
              Continue <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
