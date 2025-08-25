import React, { useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";

// --- Utility helpers ---
const currency = (n) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(isFinite(n) ? n : 0);

const number = (n) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    isFinite(n) ? n : 0
  );

const pct = (n) => (isFinite(n) ? `${((n || 0) * 100).toFixed(2)}%` : "—");

function pctSig2(n) {
  if (!isFinite(n)) return "—";
  const x = (n || 0) * 100;
  const ax = Math.abs(x);
  if (ax === 0) return "0%";
  const digits = Math.floor(Math.log10(ax)) + 1;
  const factor = Math.pow(10, Math.max(0, digits - 2));
  const rounded = Math.round(x / factor) * factor;
  const dr = Math.floor(Math.log10(Math.abs(rounded))) + 1;
  const decimals = Math.max(0, 2 - dr);
  return `${rounded.toFixed(decimals)}%`;
}

const pct0 = (n) => (isFinite(n) ? `${Math.round((n || 0) * 100)}%` : "—");

const pct0Capped = (n) => {
  if (!isFinite(n)) return "—";
  const r = Math.round((n || 0) * 100);
  const capped = r > 99 ? 99 : r;
  return `${capped}%`;
};

const isHex = (s) => typeof s === "string" && /^#?[0-9a-fA-F]{6}$/.test(s);
const hexify = (s, fallback) => {
  if (!isHex(s)) return fallback;
  return s.startsWith("#") ? s : `#${s}`;
};
const isDataUrl = (s) => typeof s === "string" && s.startsWith("data:");

async function copyToClipboard(text) {
  try {
    if (
      typeof window !== "undefined" &&
      window.isSecureContext &&
      navigator?.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // fall through to legacy
  }
  try {
    if (typeof document !== "undefined") {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

const FormLabel = ({ title, helper }) => (
  <div className="flex items-baseline justify-between mb-1">
    <Label className="text-sm font-medium text-foreground">{title}</Label>
    {helper ? <div className="text-xs text-muted-foreground">{helper}</div> : null}
  </div>
);

const TextInput = ({ value = "", onChange, title, helper, placeholder }) => (
  <div className="space-y-2">
    <FormLabel title={title} helper={helper} />
    <Input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const ColorInput = ({ value = "", onChange, title, helper }) => (
  <div className="space-y-2">
    <FormLabel title={title} helper={helper} />
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={hexify(value, "#2D6BFF")}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-14 rounded-lg border border-border"
      />
      <Input
        type="text"
        className="flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#2D6BFF"
      />
    </div>
  </div>
);

const NumInput = ({ value, onChange, min = 0, step = 1, suffix, prefix, title, helper }) => (
  <div className="space-y-2">
    <FormLabel title={title} helper={helper} />
    <div className="relative">
      {prefix ? (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {prefix}
        </span>
      ) : null}
      <Input
        type="number"
        inputMode="decimal"
        className={`${prefix ? "pl-8" : ""} ${suffix ? "pr-12" : ""}`}
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix ? (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {suffix}
        </span>
      ) : null}
    </div>
  </div>
);

const PctInput = ({ value = 0, onChange, title, helper }) => (
  <div className="space-y-2">
    <FormLabel title={title} helper={helper} />
    <div className="flex gap-3 items-center">
      <Slider
        value={[Math.round((value || 0) * 100)]}
        onValueChange={(vals) => onChange(vals[0] / 100)}
        max={100}
        step={1}
        className="flex-1"
      />
      <Input
        type="number"
        className="w-20 text-center"
        value={Math.round((value || 0) * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
      <span className="text-muted-foreground">%</span>
    </div>
  </div>
);

function KPI({ label, value, sub }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

const Section = ({ title, children, right }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
      <CardTitle className="text-base">{title}</CardTitle>
      {right}
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </CardContent>
  </Card>
);

// --- Defaults ---
const DEFAULTS = {
  "flightsPerWeek": 5,
  "weeksPerYear": 48,
  "teamMembers": 2,
  "manualHoursPerFlight": 3.0,
  "droneHoursPerFlight": 1.0,
  "hourlyRate": 75,
  "travelHoursSavedPerFlight": 1.0,
  "avgReworkCostPerProject": 1200,
  "reworkRateBaseline": 0.12,
  "reworkRateWithDD": 0.05,
  "safetyIncidentsBaseline": 2,
  "safetyIncidentsWithDD": 1,
  "costPerSafetyIncident": 5000,
  "softwareAnnualCost": 12000,
  "hardwareAnnualCost": 5000,
  "otherAnnualCosts": 2000,
  "number_of_projects_per_year": 3.0,
  "average_construction_cost": 15000000.0,
  "pct_bids_you_win": 0.5,
  "number_of_projects_you_submit_for_bid": 6.0,
  "estimated_total_travel_costs_per_year": 139644.0,
  "estimated_total_destructive_investigation_expenses_per_year": 57600.0,
  "estimated_cost_of_organizing_and_sharing_images_per_year": 78750.0,
  "estimated_cost_of_safety_and_qa_qc_inspections_per_year": 504000.0,
  "estimated_total_insurance_costs_per_year": 1350000.0,
  "working_hours_per_day": 8,
  "revenue_per_day": 123288.0,
  "increase_in_annual_revenue_by_starting_the_next_job_sooner": 15000000.0,
  "increase_in_annual_revenue_by_winning_more_projects": 45000000.0,
  "travel_reduction_pct": 0.5,
  "investigations_reduction_pct": 0.5,
  "doc_efficiency_improvement_pct": 0.0062,
  "insurance_premium_reduction_pct": 0.1,
  "schedule_acceleration_pct": 0.3333,
  "win_rate_uplift_pct": 0.5,
  "brand_primary_hex": "#2D6BFF",
  "brand_text_hex": "#0f172a",
  "logo_url": "https://logo.clearbit.com/dronedeploy.com",
  "customer_logo_url": "",
  "inline_logos_for_pdf": false,
  "logo_data_url": "",
  "customer_logo_data_url": "",
  "prepared_for": "Acme Construction",
  "prepared_by": "Jarrod Krug",
  "prepared_by_title": "Solutions Consultant",
  "prepared_by_company": "DroneDeploy",
  "prepared_by_email": "jarrod.krug@dronedeploy.com",
  "prepared_by_phone": "",
  "legal_footer": "Confidential — Provided by DroneDeploy under NDA. Do not distribute without written consent.",
};

const KEYS = Object.keys(DEFAULTS);

export function computeCalcs(state) {
  const {
    flightsPerWeek,
    weeksPerYear,
    teamMembers,
    manualHoursPerFlight,
    droneHoursPerFlight,
    hourlyRate,
    travelHoursSavedPerFlight,
    avgReworkCostPerProject,
    reworkRateBaseline,
    reworkRateWithDD,
    safetyIncidentsBaseline,
    safetyIncidentsWithDD,
    costPerSafetyIncident,
    softwareAnnualCost,
    hardwareAnnualCost,
    otherAnnualCosts,
  } = state;

  const flightsPerYear = flightsPerWeek * weeksPerYear;
  const timeSavedPerFlight =
    Math.max(0, manualHoursPerFlight - droneHoursPerFlight) *
    Math.max(1, teamMembers);
  const hoursSavedAnnual = flightsPerYear * timeSavedPerFlight;
  const laborSavings = hoursSavedAnnual * hourlyRate;

  const travelSavings =
    flightsPerYear *
    Math.max(0, travelHoursSavedPerFlight) *
    hourlyRate *
    Math.max(1, teamMembers);

  const deltaReworkRate = Math.max(0, reworkRateBaseline - reworkRateWithDD);
  const reworkSavings =
    flightsPerYear * deltaReworkRate * Math.max(0, avgReworkCostPerProject);

  const safetyDelta = Math.max(0, safetyIncidentsBaseline - safetyIncidentsWithDD);
  const safetySavings = safetyDelta * Math.max(0, costPerSafetyIncident);

  const opsSavings = laborSavings + travelSavings + reworkSavings + safetySavings;

  const baseTravel = Math.max(0, state.estimated_total_travel_costs_per_year || 0);
  const baseInvestigations = Math.max(
    0,
    state.estimated_total_destructive_investigation_expenses_per_year || 0
  );
  const baseDoc = Math.max(
    0,
    (state.estimated_cost_of_organizing_and_sharing_images_per_year || 0) +
      (state.estimated_cost_of_safety_and_qa_qc_inspections_per_year || 0)
  );
  const baseInsurance = Math.max(0, state.estimated_total_insurance_costs_per_year || 0);

  const travelSavings2 = baseTravel * Math.max(0, state.travel_reduction_pct ?? 0);
  const diSavings = baseInvestigations * Math.max(0, state.investigations_reduction_pct ?? 0);
  const docSavings = baseDoc * Math.max(0, state.doc_efficiency_improvement_pct ?? 0);
  const insuranceSavings2 = baseInsurance * Math.max(0, state.insurance_premium_reduction_pct ?? 0);

  const workingHoursPerDay = Math.max(1, state.working_hours_per_day || 8);
  const revenuePerDay = Math.max(
    0,
    state.revenue_per_day ||
      (((state.average_construction_cost || 0) * Math.max(0, state.number_of_projects_per_year || 0)) / 365)
  );
  const scheduleDaysSaved =
    (hoursSavedAnnual / workingHoursPerDay) *
    Math.max(0, state.schedule_acceleration_pct ?? 0);
  const scheduleRevenueGain = revenuePerDay * scheduleDaysSaved;

  const winMoreRevenueGain = Math.max(
    0,
    (state.average_construction_cost || 0) *
      Math.max(0, state.number_of_projects_you_submit_for_bid || 0) *
      Math.max(0, state.win_rate_uplift_pct ?? 0)
  );

  const efficiencyGains2 =
    travelSavings2 + diSavings + docSavings + insuranceSavings2;
  const increasedRevenues2 = scheduleRevenueGain + winMoreRevenueGain;

  const totalSavings = opsSavings + efficiencyGains2 + increasedRevenues2;
  const totalCosts =
    Math.max(0, softwareAnnualCost) +
    Math.max(0, hardwareAnnualCost) +
    Math.max(0, otherAnnualCosts);
  const netAnnual = totalSavings - totalCosts;

  const roiPct = totalCosts > 0 ? netAnnual / totalCosts : Infinity;
  const paybackMonths = totalSavings > 0 ? (totalCosts / totalSavings) * 12 : Infinity;

  const breakdown = [
    { label: "Ops: Labor time saved", value: laborSavings },
    { label: "Ops: Travel time saved", value: travelSavings },
    { label: "Ops: Rework reduction", value: reworkSavings },
    { label: "Ops: Safety risk reduction", value: safetySavings },
    { label: "Travel reduction (from spreadsheet)", value: travelSavings2 },
    { label: "Destructive investigations avoided", value: diSavings },
    { label: "Documentation efficiency", value: docSavings },
    { label: "Insurance premium reduction", value: insuranceSavings2 },
    { label: "Schedule acceleration (days→revenue)", value: scheduleRevenueGain },
    { label: "Win-rate uplift (revenue)", value: winMoreRevenueGain },
  ];

  return {
    flightsPerYear,
    timeSavedPerFlight,
    hoursSavedAnnual,
    laborSavings,
    travelSavings,
    reworkSavings,
    safetySavings,
    opsSavings,
    baseTravel,
    baseInvestigations,
    baseDoc,
    baseInsurance,
    travelSavings2,
    diSavings,
    docSavings,
    insuranceSavings2,
    workingHoursPerDay,
    revenuePerDay,
    scheduleDaysSaved,
    scheduleRevenueGain,
    winMoreRevenueGain,
    efficiencyGains2,
    increasedRevenues2,
    totalSavings,
    totalCosts,
    netAnnual,
    roiPct,
    paybackMonths,
    breakdown,
  };
}

const Index = () => {
  const [state, setState] = useState(() => {
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams("");
    const obj = { ...DEFAULTS };
    KEYS.forEach((k) => {
      if (params.has(k)) {
        const raw = params.get(k);
        obj[k] = typeof DEFAULTS[k] === "number" ? Number(raw) : raw;
      }
    });
    return obj;
  });

  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const set = (k) => (v) => setState((s) => ({ ...s, [k]: v }));

  const calcs = useMemo(() => computeCalcs(state), [state]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    KEYS.forEach((k) => p.set(k, String(state[k])));
    return `?${p.toString()}`;
  }, [state]);

  const shareUrl = useMemo(
    () =>
      `${
        typeof window !== "undefined" ? window.location.origin : ""
      }${typeof window !== "undefined" ? window.location.pathname : ""}${qs}`,
    [qs]
  );

  const onePagerRef = useRef(null);
  const today = useMemo(() => new Date().toLocaleDateString(), []);

  async function handleCopy() {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      toast({
        title: "Success",
        description: "Link copied to clipboard",
      });
    } else {
      toast({
        title: "Error",
        description: "Clipboard blocked. Press Ctrl/Cmd + C",
        variant: "destructive",
      });
    }
  }

  async function downloadOnePager() {
    if (exporting) return;
    setExporting(true);

    try {
      const node = onePagerRef.current;
      if (!node) throw new Error("One‑pager not mounted");

      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false,
        removeContainer: true,
        logging: false,
        windowWidth: node.scrollWidth,
        windowHeight: node.scrollHeight,
      });

      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const maxW = pageW - margin * 2;
      let imgW = maxW;
      let imgH = (canvas.height / canvas.width) * imgW;

      if (imgH > pageH - margin * 2) {
        const scale = (pageH - margin * 2) / imgH;
        imgW = imgW * scale;
        imgH = imgH * scale;
      }

      pdf.addImage(img, "PNG", margin, margin, imgW, imgH, undefined, "FAST");
      pdf.save("DroneDeploy_ROI_OnePager.pdf");
      
      toast({
        title: "Success",
        description: "PDF downloaded",
      });
    } catch (err) {
      console.error("PDF export failed:", err);
      toast({
        title: "Error",
        description: "PDF export failed — using Print as fallback.",
        variant: "destructive",
      });
      try { 
        if (typeof window !== "undefined") window.print(); 
      } catch {}
    } finally {
      setExporting(false);
    }
  }

  const brandPrimary = hexify(state.brand_primary_hex, "#2D6BFF");
  const brandText = hexify(state.brand_text_hex, "#0f172a");

  function applyDroneDeployPreset() {
    setState((s) => ({
      ...s,
      brand_primary_hex: "#2D6BFF",
      brand_text_hex: "#0f172a",
      logo_url: "https://logo.clearbit.com/dronedeploy.com",
    }));
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-background to-muted py-8 px-4 md:px-8">
      <header className="max-w-6xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-card border border-border flex items-center justify-center overflow-hidden">
              {state.logo_url || state.logo_data_url ? (
                <img
                  src={state.logo_data_url || state.logo_url}
                  crossOrigin="anonymous"
                  alt="Logo"
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <span className="text-sm font-semibold text-primary">
                  DD
                </span>
              )}
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                DroneDeploy ROI Calculator
              </h1>
              <p className="text-muted-foreground mt-1">
                Estimate annual impact and payback based on your operations.
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="outline" onClick={handleCopy}>
              Copy share link
            </Button>
            <Button onClick={() => typeof window !== "undefined" && window.print()}>
              Print / PDF
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">Sharable</Badge>
          <Badge variant="secondary">No data stored</Badge>
          <Badge variant="secondary">Estimates only</Badge>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Section title="Quality & Safety" right={null}>
            <NumInput
              title="Avg. rework cost per project"
              value={state.avgReworkCostPerProject}
              onChange={set("avgReworkCostPerProject")}
              step={100}
              prefix="$"
              suffix=""
              helper=""
            />
            <PctInput
              title="Rework rate (before)"
              value={state.reworkRateBaseline}
              onChange={set("reworkRateBaseline")}
              helper=""
            />
            <PctInput
              title="Rework rate (with DroneDeploy)"
              value={state.reworkRateWithDD}
              onChange={set("reworkRateWithDD")}
              helper=""
            />
            <NumInput
              title="Annual safety incidents (before)"
              value={state.safetyIncidentsBaseline}
              onChange={set("safetyIncidentsBaseline")}
              step={1}
              suffix=""
              prefix=""
              helper=""
            />
            <NumInput
              title="Annual safety incidents (with DroneDeploy)"
              value={state.safetyIncidentsWithDD}
              onChange={set("safetyIncidentsWithDD")}
              step={1}
              suffix=""
              prefix=""
              helper=""
            />
            <NumInput
              title="Cost per safety incident"
              value={state.costPerSafetyIncident}
              onChange={set("costPerSafetyIncident")}
              step={500}
              prefix="$"
              suffix=""
              helper=""
            />
          </Section>

          <Section title="Annual Costs — Hardware and Software" right={null}>
            <NumInput
              title="Software subscription"
              value={state.softwareAnnualCost}
              onChange={set("softwareAnnualCost")}
              step={500}
              prefix="$"
              suffix=""
              helper=""
            />
            <NumInput
              title="Hardware & maintenance"
              value={state.hardwareAnnualCost}
              onChange={set("hardwareAnnualCost")}
              step={500}
              prefix="$"
              suffix=""
              helper=""
            />
            <NumInput
              title="Other program costs"
              value={state.otherAnnualCosts}
              onChange={set("otherAnnualCosts")}
              step={250}
              prefix="$"
              suffix=""
              helper=""
            />
            <div className="md:col-span-2 flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setState(DEFAULTS)}
              >
                Reset to defaults
              </Button>
              <span className="text-xs text-muted-foreground">
                Use realistic internal numbers for best accuracy.
              </span>
            </div>
          </Section>

          <Section
            title="ROI drivers"
            right={
              <Button
                size="sm"
                onClick={applyDroneDeployPreset}
              >
                Apply DroneDeploy preset
              </Button>
            }
          >
            <NumInput
              title="Estimated travel costs (per year)"
              value={state.estimated_total_travel_costs_per_year}
              onChange={set("estimated_total_travel_costs_per_year")}
              step={500}
              prefix="$"
              suffix=""
              helper=""
            />
            <NumInput
              title="Destructive investigation costs (per year)"
              value={state.estimated_total_destructive_investigation_expenses_per_year}
              onChange={set("estimated_total_destructive_investigation_expenses_per_year")}
              step={500}
              prefix="$"
              suffix=""
              helper=""
            />
            <NumInput
              title="Organizing & sharing images (per year)"
              value={state.estimated_cost_of_organizing_and_sharing_images_per_year}
              onChange={set("estimated_cost_of_organizing_and_sharing_images_per_year")}
              step={500}
              prefix="$"
              suffix=""
              helper=""
            />
            <NumInput
              title="Insurance costs (per year)"
              value={state.estimated_total_insurance_costs_per_year}
              onChange={set("estimated_total_insurance_costs_per_year")}
              step={1000}
              prefix="$"
              suffix=""
              helper=""
            />
            <PctInput
              title="Travel reduction with DroneDeploy"
              value={state.travel_reduction_pct}
              onChange={set("travel_reduction_pct")}
              helper=""
            />
            <PctInput
              title="Fewer destructive investigations"
              value={state.investigations_reduction_pct}
              onChange={set("investigations_reduction_pct")}
              helper=""
            />
          </Section>

          <Section title="Branding & Signature" right={null}>
            <ColorInput
              title="Brand primary color"
              value={state.brand_primary_hex}
              onChange={set("brand_primary_hex")}
              helper=""
            />
            <ColorInput
              title="Brand text color"
              value={state.brand_text_hex}
              onChange={set("brand_text_hex")}
              helper=""
            />
            <TextInput
              title="DroneDeploy logo URL"
              helper="Use a PNG/SVG with CORS enabled for PDF export."
              value={state.logo_url}
              onChange={set("logo_url")}
              placeholder="https://.../logo.png"
            />
            <TextInput
              title="Customer logo URL"
              helper="Optional: shows alongside DroneDeploy on the PDF banner."
              value={state.customer_logo_url}
              onChange={set("customer_logo_url")}
              placeholder="https://.../customer-logo.png"
            />
          </Section>
        </div>

        <div ref={onePagerRef} className="space-y-4">
          <div className="grid gap-4">
            <KPI
              label="Annual ROI"
              value={pct0Capped(calcs.roiPct)}
              sub={`${currency(calcs.netAnnual)} net benefit`}
            />
            <KPI
              label="Payback Period"
              value={`${Math.round(calcs.paybackMonths)} months`}
              sub={`${currency(calcs.totalSavings)} total savings`}
            />
            <KPI
              label="Total Investment"
              value={currency(calcs.totalCosts)}
              sub="Annual program costs"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Savings Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {calcs.breakdown
                .filter((item) => item.value > 0)
                .map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium">{currency(item.value)}</span>
                  </div>
                ))}
            </CardContent>
          </Card>

          <div className="text-center pt-4">
            <Button 
              onClick={downloadOnePager} 
              disabled={exporting}
              className="w-full"
            >
              {exporting ? "Generating PDF..." : "Download PDF Report"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
