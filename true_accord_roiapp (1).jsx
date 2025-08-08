import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Copy, Download, Presentation, Info } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ======= Unlimited.finance × TrueAccord — ROI Studio Pro (with Sources) =======
// Scenario-based, client-facing, highly configurable, and now with plain-English labels.

const STORAGE_KEY = "ta_roi_studio_scenarios_v3";

function defaultScenario(name = "Base Case") {
  return {
    id: crypto.randomUUID(),
    name,
    // Volume & mix
    disputesPerDay: 250,
    businessDays: 260,
    growthFactor: 2.5,
    manualPctBaseline: 12.5,
    imageShareWithinManual: 30,
    minutesSimple: 3,
    minutesImage: 5,
    residualManualPct: 0,

    // Cost / wages
    loadedRate: 39,

    // Non-labor savings (simple inputs)
    compliancePenalties: 25000,
    escalationFees: 15000,
    legacyLicensing: 10000,
    customSavings: [{ id: 1, label: "Avoided SLA credits", amount: 8000 }],
    customCosts: [],

    // Pricing models
    pricingModel: "flat", // flat | per-dispute | success | hybrid
    unlimitedCost: 60000, // flat
    oneTimeCost: 0,
    perDisputePrice: 0.75, // $/dispute for per-dispute
    successFeePct: 20, // % of savings for success fee
    hybridMinAnnual: 40000, // floor for hybrid; success fee applied above

    // Options
    useProjectedForROI: true,
    riskDiscountPct: 10, // safety margin on savings (conservatism)

    // --- Risk modeling details ---
    // Statutory claims (FCRA 1681n willful: $100-$1,000/violation)
    statutoryClaimsPerYear: 2,
    statutoryDamagesPerClaim: 500,
    statutoryProbabilityPct: 50, // chance those claims materialize (for expectation)

    // CFPB civil penalty exposure (12 USC 5565 tiers; editable)
    cfpbTier: 1, // 1 | 2 | 3
    cfpbDaysAtRisk: 5,
    cfpbEnforcementProbabilityPct: 1,

    // Escalation modeling (instead of a flat amount)
    useEscalationModel: false,
    escalationRatePct: 0.5, // % of all disputes
    escalationCostEach: 50, // $ per escalation (ops cost, vendor, re-investigation)
  };
}

export default function TrueAccordROIStudioPro() {
  // ---------- App state ----------
  const [scenarios, setScenarios] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      defaultScenario("Base Case"),
      { ...defaultScenario("Aggressive Growth"), growthFactor: 3.0, manualPctBaseline: 15, residualManualPct: 1 },
    ];
  });
  const [selectedId, setSelectedId] = useState(() => scenarios[0]?.id);
  const [presentMode, setPresentMode] = useState(false);
  const [clientTargetROI, setClientTargetROI] = useState(3);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  }, [scenarios]);

  const selected = scenarios.find((s) => s.id === selectedId) || scenarios[0];

  // ---------- Helpers ----------
  const num = (v) => (isNaN(Number(v)) ? 0 : Number(v));
  const fmtUsd = (n, digits = 0) =>
    (n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits });
  const fmtMul = (n) => `${(n || 0).toFixed(1)}×`;

  const updateScenario = (patch) =>
    setScenarios((prev) => prev.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)));

  const duplicateScenario = () => {
    const copy = { ...selected, id: crypto.randomUUID(), name: `${selected.name} (copy)` };
    setScenarios((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  };

  const addScenario = () => {
    const s = defaultScenario(`Scenario ${scenarios.length + 1}`);
    setScenarios((prev) => [...prev, s]);
    setSelectedId(s.id);
  };

  const removeScenario = (id) => {
    const next = scenarios.filter((s) => s.id !== id);
    setScenarios(next);
    if (!next.find((s) => s.id === selectedId) && next[0]) setSelectedId(next[0].id);
  };

  // ---------- Constants for CFPB tiers (editable by user through inputs) ----------
  const CFPB_TIER_AMOUNTS = {
    1: 7217,
    2: 36083,
    3: 1443275,
  };

  // ---------- Core Math (per-scenario) ----------
  const compute = (s) => {
    const dpdBase = num(s.disputesPerDay);
    const dpd = s.useProjectedForROI ? dpdBase * num(s.growthFactor) : dpdBase;
    const disputesPerYear = dpd * num(s.businessDays);

    const manualPct = Math.min(100, Math.max(0, num(s.manualPctBaseline))) / 100;
    const residualPct = Math.min(100, Math.max(0, num(s.residualManualPct))) / 100;
    const simpleShare = Math.max(0, 100 - num(s.imageShareWithinManual)) / 100;
    const imageShare = Math.min(100, num(s.imageShareWithinManual)) / 100;
    const minsSimpleHrs = num(s.minutesSimple) / 60;
    const minsImageHrs = num(s.minutesImage) / 60;

    // Baselines
    const baselineDailyHours = dpdBase * manualPct * (simpleShare * minsSimpleHrs + imageShare * minsImageHrs);
    const baselineAnnualLabor = baselineDailyHours * num(s.loadedRate) * num(s.businessDays);

    const projectedDailyHours = (dpdBase * num(s.growthFactor)) * manualPct * (simpleShare * minsSimpleHrs + imageShare * minsImageHrs);
    const projectedAnnualLabor = projectedDailyHours * num(s.loadedRate) * num(s.businessDays);

    const withUnlimitedDailyHours = dpd * residualPct * (simpleShare * minsSimpleHrs + imageShare * minsImageHrs);
    const withUnlimitedAnnualLabor = withUnlimitedDailyHours * num(s.loadedRate) * num(s.businessDays);

    const laborBase = s.useProjectedForROI ? projectedAnnualLabor : baselineAnnualLabor;
    const laborSavingsGross = Math.max(0, laborBase - withUnlimitedAnnualLabor);

    // --- Detailed non-labor savings ---
    // 1) Statutory damages expectation (FCRA 1681n)
    const statProb = Math.min(100, Math.max(0, num(s.statutoryProbabilityPct))) / 100;
    const statutoryExpected = num(s.statutoryClaimsPerYear) * num(s.statutoryDamagesPerClaim) * statProb;

    // 2) CFPB expected penalty avoided (Tier × days × probability)
    const cfpbDaily = CFPB_TIER_AMOUNTS[s.cfpbTier] || CFPB_TIER_AMOUNTS[1];
    const cfpbProb = Math.min(100, Math.max(0, num(s.cfpbEnforcementProbabilityPct))) / 100;
    const cfpbExpected = num(s.cfpbDaysAtRisk) * cfpbDaily * cfpbProb;

    // 3) Escalation modeling (if enabled)
    const modeledEscalations = disputesPerYear * (Math.min(100, Math.max(0, num(s.escalationRatePct))) / 100);
    const modeledEscalationCost = modeledEscalations * num(s.escalationCostEach);

    // Fee / other savings roll-up
    const baseFeeSavings = num(s.compliancePenalties) + num(s.legacyLicensing) + s.customSavings.reduce((sum, r) => sum + num(r.amount || 0), 0);
    const escalationComponent = s.useEscalationModel ? modeledEscalationCost : num(s.escalationFees);

    const feeSavings = baseFeeSavings + escalationComponent + statutoryExpected + cfpbExpected;

    const savingsGross = laborSavingsGross + feeSavings;

    // Safety margin (plain-English): reduce savings by X% to stay conservative
    const safetyMarginPct = Math.min(100, Math.max(0, num(s.riskDiscountPct))) / 100;
    const savingsAfterSafetyMargin = savingsGross * (1 - safetyMarginPct);

    // Costs by pricing model
    const customCostsTotal = s.customCosts.reduce((sum, r) => sum + num(r.amount || 0), 0);
    let annualCosts = 0;
    let priceExplainer = "";
    if (s.pricingModel === "flat") {
      annualCosts = num(s.unlimitedCost) + customCostsTotal;
      priceExplainer = `Flat annual of ${fmtUsd(s.unlimitedCost)} + ongoing ${fmtUsd(customCostsTotal)}`;
    } else if (s.pricingModel === "per-dispute") {
      annualCosts = num(s.perDisputePrice) * disputesPerYear + customCostsTotal;
      priceExplainer = `${fmtUsd(s.perDisputePrice, 2)}/dispute × ${disputesPerYear.toLocaleString()} + ${fmtUsd(customCostsTotal)}`;
    } else if (s.pricingModel === "success") {
      annualCosts = (num(s.successFeePct) / 100) * savingsAfterSafetyMargin + customCostsTotal;
      priceExplainer = `${s.successFeePct}% of savings (${fmtUsd(savingsAfterSafetyMargin)}) + ${fmtUsd(customCostsTotal)}`;
    } else if (s.pricingModel === "hybrid") {
      const fee = (num(s.successFeePct) / 100) * savingsAfterSafetyMargin;
      annualCosts = Math.max(num(s.hybridMinAnnual), fee) + customCostsTotal;
      priceExplainer = `max(${fmtUsd(s.hybridMinAnnual)}, ${s.successFeePct}% of savings) + ${fmtUsd(customCostsTotal)}`;
    }

    const roiMultiple = annualCosts > 0 ? savingsAfterSafetyMargin / annualCosts : 0;
    const monthlySavings = savingsAfterSafetyMargin / 12;
    const paybackMonths = monthlySavings > 0 ? (annualCosts + num(s.oneTimeCost)) / monthlySavings : Infinity;

    // Suggested price to hit client target ROI (flat equivalent)
    const maxAnnualCostForTarget = clientTargetROI > 0 ? savingsAfterSafetyMargin / clientTargetROI : 0;
    const disputesYearForPricing = disputesPerYear;
    const suggested = {
      flat: maxAnnualCostForTarget,
      perDispute: disputesYearForPricing > 0 ? maxAnnualCostForTarget / disputesYearForPricing : 0,
      successPct: savingsAfterSafetyMargin > 0 ? (maxAnnualCostForTarget / savingsAfterSafetyMargin) * 100 : 0,
      hybridMin: Math.min(maxAnnualCostForTarget, num(s.hybridMinAnnual)),
    };

    // Charts
    const priceCurve = [];
    const base = maxAnnualCostForTarget || (annualCosts || 50000);
    for (let m = 0.5; m <= 2.0; m += 0.1) {
      const price = base * m;
      priceCurve.push({ price, roi: price > 0 ? savingsAfterSafetyMargin / price : 0 });
    }

    const safetyMarginValue = savingsGross - savingsAfterSafetyMargin; // positive amount not counted
    const savingsBreakdown = [
      { name: "Labor savings", value: Math.round(laborSavingsGross) },
      { name: "Fees & tooling avoided", value: Math.round(baseFeeSavings + escalationComponent) },
      { name: "Statutory damages avoided", value: Math.round(statutoryExpected) },
      { name: "CFPB penalties avoided", value: Math.round(cfpbExpected) },
      { name: "Safety margin (not counted)", value: Math.round(safetyMarginValue) },
    ];

    return {
      disputesPerYear,
      baselineAnnualLabor,
      projectedAnnualLabor,
      withUnlimitedAnnualLabor,
      laborSavingsGross,
      feeSavings,
      savingsAfterSafetyMargin,
      annualCosts,
      priceExplainer,
      roiMultiple,
      paybackMonths,
      suggested,
      priceCurve,
      savingsBreakdown,
      // expose components
      components: {
        baseFeeSavings,
        escalationComponent,
        statutoryExpected,
        cfpbExpected,
        safetyMarginValue,
      },
    };
  };

  const selectedCalc = compute(selected);
  const compare = scenarios.map((s) => ({ s, m: compute(s) }));

  // ---------- Export helpers ----------
  const download = (filename, content, type = "application/json") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => download("roi_scenarios.json", JSON.stringify(scenarios, null, 2));

  const exportCSV = () => {
    const header = [
      "Scenario","Disputes/yr","ExpectedSavings($)","Costs($)","ROI(x)","Payback(months)"
    ];
    const rows = compare.map(({ s, m }) => [
      s.name,
      m.disputesPerYear,
      Math.round(m.savingsAfterSafetyMargin),
      Math.round(m.annualCosts),
      m.roiMultiple.toFixed(2),
      Number.isFinite(m.paybackMonths) ? m.paybackMonths.toFixed(1) : "-",
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    download("roi_summary.csv", csv, "text/csv");
  };

  // ---------- UI ----------
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <img src="https://logo.clearbit.com/trueaccord.com" alt="TrueAccord Logo" className="h-10 w-auto" />
          <img src="https://logo.clearbit.com/unlimited.finance" alt="Unlimited.finance Logo" className="h-10 w-auto" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">ROI Studio Pro</h1>
            <p className="text-sm text-muted-foreground">Unlimited.finance × TrueAccord — build, compare, price, and cite</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Presentation className="h-4 w-4 mr-2" /> Present / Print
          </Button>
          <Button variant="secondary" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
          <Button variant="secondary" onClick={exportJSON}>
            <Download className="h-4 w-4 mr-2" /> JSON
          </Button>
          <Button variant={showSources ? "default" : "outline"} onClick={() => setShowSources(!showSources)}>
            <Info className="h-4 w-4 mr-2" /> Sources & Footnotes
          </Button>
          <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
            <Label className="text-sm">Client ROI target</Label>
            <Input className="w-20" type="number" step="0.1" value={clientTargetROI} onChange={(e) => setClientTargetROI(num(e.target.value))} />
            <span className="text-sm">×</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
            <Label className="text-sm">Client‑friendly</Label>
            <Switch checked={presentMode} onCheckedChange={setPresentMode} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Scenario bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {scenarios.map((s) => (
          <Button key={s.id} variant={s.id === selectedId ? "default" : "outline"} onClick={() => setSelectedId(s.id)}>
            {s.name}
          </Button>
        ))}
        <Button variant="outline" onClick={addScenario}><Plus className="h-4 w-4 mr-1" /> Add scenario</Button>
        <Button variant="outline" onClick={duplicateScenario}><Copy className="h-4 w-4 mr-1" /> Duplicate</Button>
        {scenarios.length > 1 && (
          <Button variant="outline" onClick={() => removeScenario(selected.id)}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Inputs (hide some in present mode) */}
        {!presentMode && (
          <>
            {/* Volume & Mix */}
            <Card>
              <CardHeader><CardTitle>Volume & Mix</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div><Label>Name</Label><Input value={selected.name} onChange={(e) => updateScenario({ name: e.target.value })} /></div>
                <div><Label>Disputes / day (baseline)</Label><Input type="number" value={selected.disputesPerDay} onChange={(e) => updateScenario({ disputesPerDay: num(e.target.value) })} /></div>
                <div><Label>Business days / year</Label><Input type="number" value={selected.businessDays} onChange={(e) => updateScenario({ businessDays: num(e.target.value) })} /></div>
                <div><Label>Volume growth × (12 mo)</Label><Input type="number" step="0.1" min={1} value={selected.growthFactor} onChange={(e) => updateScenario({ growthFactor: num(e.target.value) })} /></div>
                <div><Label>Manual touch % (today)</Label><Input type="number" step="0.1" value={selected.manualPctBaseline} onChange={(e) => updateScenario({ manualPctBaseline: num(e.target.value) })} /></div>
                <div><Label>Residual manual % with Unlimited</Label><Input type="number" step="0.1" value={selected.residualManualPct} onChange={(e) => updateScenario({ residualManualPct: num(e.target.value) })} /></div>
                <div><Label>Image-heavy share of manual %</Label><Input type="number" step="1" value={selected.imageShareWithinManual} onChange={(e) => updateScenario({ imageShareWithinManual: num(e.target.value) })} /></div>
                <div><Label>Minutes / simple manual</Label><Input type="number" step="0.5" value={selected.minutesSimple} onChange={(e) => updateScenario({ minutesSimple: num(e.target.value) })} /></div>
                <div><Label>Minutes / image-heavy manual</Label><Input type="number" step="0.5" value={selected.minutesImage} onChange={(e) => updateScenario({ minutesImage: num(e.target.value) })} /></div>
                <div className="col-span-2 flex items-center justify-between pt-2">
                  <div>
                    <Label className="mr-2">Use projected growth for ROI</Label>
                    <p className="text-xs text-muted-foreground">If off, ROI uses current baseline volumes</p>
                  </div>
                  <Switch checked={selected.useProjectedForROI} onCheckedChange={(v) => updateScenario({ useProjectedForROI: v })} />
                </div>
              </CardContent>
            </Card>

            {/* Non-labor & Risk */}
            <Card>
              <CardHeader><CardTitle>Non‑Labor & Risk</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                {/* Simple dollar inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Compliance penalties avoided ($/yr)</Label>
                    <Input type="number" value={selected.compliancePenalties} onChange={(e) => updateScenario({ compliancePenalties: num(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Legacy licensing retired ($/yr)</Label>
                    <Input type="number" value={selected.legacyLicensing} onChange={(e) => updateScenario({ legacyLicensing: num(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Loaded wage $/hr <a href="https://www.bls.gov/news.release/ecec.nr0.htm" target="_blank" className="underline text-xs">BLS</a> <span className="text-xs">+</span> <a href="https://www.glassdoor.com/Salary/TrueAccord-Customer-Engagement-Specialist-Salaries-E1101018_D_KO11%2C41.htm" target="_blank" className="underline text-xs">Glassdoor</a></Label>
                    <Input type="number" value={selected.loadedRate} onChange={(e) => updateScenario({ loadedRate: num(e.target.value) })} />
                    <p className="text-xs text-muted-foreground mt-1">Loaded wage = hourly pay + benefits/overhead.</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Safety margin on savings (%)</Label>
                    <Input type="number" step="1" value={selected.riskDiscountPct} onChange={(e) => updateScenario({ riskDiscountPct: num(e.target.value) })} />
                    <p className="text-xs text-muted-foreground">We intentionally count only (100% − this %) of savings to stay conservative.</p>
                  </div>
                </div>

                {/* Statutory exposure (FCRA 1681n) */}
                <div className="p-3 border rounded-md">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Statutory exposure (FCRA 15 U.S.C. §1681n)</p>
                    <a href="https://www.law.cornell.edu/uscode/text/15/1681n" target="_blank" className="underline text-xs">source</a>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-3">
                    <div>
                      <Label>Claims avoided (count/yr)</Label>
                      <Input type="number" value={selected.statutoryClaimsPerYear} onChange={(e) => updateScenario({ statutoryClaimsPerYear: num(e.target.value) })} />
                    </div>
                    <div>
                      <Label>Damages per claim ($)</Label>
                      <Input type="number" value={selected.statutoryDamagesPerClaim} onChange={(e) => updateScenario({ statutoryDamagesPerClaim: num(e.target.value) })} />
                    </div>
                    <div>
                      <Label>Realization probability %</Label>
                      <Input type="number" step="1" value={selected.statutoryProbabilityPct} onChange={(e) => updateScenario({ statutoryProbabilityPct: num(e.target.value) })} />
                    </div>
                  </div>
                </div>

                {/* CFPB penalty exposure */}
                <div className="p-3 border rounded-md">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">CFPB civil penalty exposure (12 U.S.C. 5565 tiers)</p>
                    <a href="https://files.consumerfinance.gov/f/documents/cfpb_civil-penalty-inflation-adjustments-final-rule_2025-01.pdf" target="_blank" className="underline text-xs">source</a>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-3">
                    <div>
                      <Label>Tier (1/2/3)</Label>
                      <Input type="number" min={1} max={3} value={selected.cfpbTier} onChange={(e) => updateScenario({ cfpbTier: Math.min(3, Math.max(1, num(e.target.value))) })} />
                      <p className="text-xs text-muted-foreground mt-1">Defaults: T1 ${CFPB_TIER_AMOUNTS[1].toLocaleString()}/day; T2 ${CFPB_TIER_AMOUNTS[2].toLocaleString()}/day; T3 ${CFPB_TIER_AMOUNTS[3].toLocaleString()}/day</p>
                    </div>
                    <div>
                      <Label>Days at risk / yr</Label>
                      <Input type="number" value={selected.cfpbDaysAtRisk} onChange={(e) => updateScenario({ cfpbDaysAtRisk: num(e.target.value) })} />
                    </div>
                    <div>
                      <Label>Enforcement probability %</Label>
                      <Input type="number" step="0.1" value={selected.cfpbEnforcementProbabilityPct} onChange={(e) => updateScenario({ cfpbEnforcementProbabilityPct: num(e.target.value) })} />
                    </div>
                  </div>
                </div>

                {/* Escalations */}
                <div className="p-3 border rounded-md">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Escalation modeling</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Use model</span>
                      <Switch checked={selected.useEscalationModel} onCheckedChange={(v) => updateScenario({ useEscalationModel: v })} />
                    </div>
                  </div>
                  {!selected.useEscalationModel ? (
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <div>
                        <Label>Escalation fees avoided ($/yr)</Label>
                        <Input type="number" value={selected.escalationFees} onChange={(e) => updateScenario({ escalationFees: num(e.target.value) })} />
                      </div>
                      <div className="flex items-end"><a href="https://www.e-oscar.org/billing-finance" target="_blank" className="underline text-xs">e‑OSCAR fees info</a></div>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-3 gap-4">
                      <div>
                        <Label>Escalation rate % of disputes</Label>
                        <Input type="number" step="0.1" value={selected.escalationRatePct} onChange={(e) => updateScenario({ escalationRatePct: num(e.target.value) })} />
                      </div>
                      <div>
                        <Label>Cost per escalation ($)</Label>
                        <Input type="number" value={selected.escalationCostEach} onChange={(e) => updateScenario({ escalationCostEach: num(e.target.value) })} />
                      </div>
                      <div className="flex items-end"><a href="https://d1vy0qa05cdjr5.cloudfront.net/bfb36feb-d1d7-4733-9b52-a7d5ed7eedac/Reference%20Cards/ACDV_Responders_Responding_to_ACDVs_RC.pdf" target="_blank" className="underline text-xs">ACDV explainer</a></div>
                    </div>
                  )}
                </div>

                {/* Custom Savings Rows */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Custom savings line items</Label>
                    <Button variant="outline" size="sm" onClick={() => updateScenario({ customSavings: [...selected.customSavings, { id: (selected.customSavings.at(-1)?.id || 0) + 1, label: "New savings", amount: 0 }] })}>
                      <Plus className="h-4 w-4 mr-1" /> Add savings
                    </Button>
                  </div>
                  {selected.customSavings.map((row) => (
                    <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                      <Input className="col-span-8" value={row.label} onChange={(e) => updateScenario({ customSavings: selected.customSavings.map(r => r.id === row.id ? { ...r, label: e.target.value } : r) })} />
                      <Input className="col-span-3" type="number" value={row.amount} onChange={(e) => updateScenario({ customSavings: selected.customSavings.map(r => r.id === row.id ? { ...r, amount: num(e.target.value) } : r) })} />
                      <Button variant="ghost" size="icon" onClick={() => updateScenario({ customSavings: selected.customSavings.filter(r => r.id !== row.id) })} className="col-span-1"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>

                {/* Custom Costs Rows */}
                <div className="space-y-2 pt-4">
                  <div className="flex items-center justify-between">
                    <Label>Additional ongoing costs</Label>
                    <Button variant="outline" size="sm" onClick={() => updateScenario({ customCosts: [...selected.customCosts, { id: (selected.customCosts.at(-1)?.id || 0) + 1, label: "New ongoing cost", amount: 0 }] })}>
                      <Plus className="h-4 w-4 mr-1" /> Add cost
                    </Button>
                  </div>
                  {selected.customCosts.map((row) => (
                    <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                      <Input className="col-span-8" value={row.label} onChange={(e) => updateScenario({ customCosts: selected.customCosts.map(r => r.id === row.id ? { ...r, label: e.target.value } : r) })} />
                      <Input className="col-span-3" type="number" value={row.amount} onChange={(e) => updateScenario({ customCosts: selected.customCosts.map(r => r.id === row.id ? { ...r, amount: num(e.target.value) } : r) })} />
                      <Button variant="ghost" size="icon" onClick={() => updateScenario({ customCosts: selected.customCosts.filter(r => r.id !== row.id) })} className="col-span-1"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Pricing */}
            <Card>
              <CardHeader><CardTitle>Pricing Configurator</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Pricing model</Label>
                    <div className="flex gap-2 flex-wrap pt-2">
                      {[
                        { key: "flat", label: "Flat annual" },
                        { key: "per-dispute", label: "Per dispute" },
                        { key: "success", label: "Success fee" },
                        { key: "hybrid", label: "Hybrid (min + % of savings)" },
                      ].map((opt) => (
                        <Button key={opt.key} variant={selected.pricingModel === opt.key ? "default" : "outline"} onClick={() => updateScenario({ pricingModel: opt.key })}>{opt.label}</Button>
                      ))}
                    </div>
                  </div>

                  {selected.pricingModel === "flat" && (
                    <div className="col-span-2"><Label>Flat annual</Label><Input type="number" value={selected.unlimitedCost} onChange={(e) => updateScenario({ unlimitedCost: num(e.target.value) })} /></div>
                  )}

                  {selected.pricingModel === "per-dispute" && (
                    <div className="col-span-2"><Label>Price per dispute ($)</Label><Input type="number" step="0.01" value={selected.perDisputePrice} onChange={(e) => updateScenario({ perDisputePrice: num(e.target.value) })} /></div>
                  )}

                  {selected.pricingModel === "success" && (
                    <div className="col-span-2"><Label>Success fee (% of savings)</Label><Input type="number" step="0.5" value={selected.successFeePct} onChange={(e) => updateScenario({ successFeePct: num(e.target.value) })} /></div>
                  )}

                  {selected.pricingModel === "hybrid" && (
                    <>
                      <div className="col-span-2"><Label>Minimum annual ($)</Label><Input type="number" value={selected.hybridMinAnnual} onChange={(e) => updateScenario({ hybridMinAnnual: num(e.target.value) })} /></div>
                      <div className="col-span-2"><Label>Success fee (% of savings)</Label><Input type="number" step="0.5" value={selected.successFeePct} onChange={(e) => updateScenario({ successFeePct: num(e.target.value) })} /></div>
                    </>
                  )}

                  <div className="col-span-2"><Label>One-time implementation ($)</Label><Input type="number" value={selected.oneTimeCost} onChange={(e) => updateScenario({ oneTimeCost: num(e.target.value) })} /></div>
                </div>

                {/* Suggestions */}
                <div className="mt-2 p-3 rounded-md bg-muted">
                  <p className="text-sm font-medium">Price suggestions to hit {clientTargetROI}× client ROI (flat equivalents)</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-sm">
                    <div><span className="block text-muted-foreground">Flat annual ≤</span><strong>{fmtUsd(selectedCalc.suggested.flat)}</strong></div>
                    <div><span className="block text-muted-foreground">Per‑dispute ≤</span><strong>{fmtUsd(selectedCalc.suggested.perDispute, 2)}</strong></div>
                    <div><span className="block text-muted-foreground">Success fee ≤</span><strong>{selectedCalc.suggested.successPct.toFixed(1)}%</strong></div>
                    <div><span className="block text-muted-foreground">Hybrid min (cap):</span><strong>{fmtUsd(selectedCalc.suggested.hybridMin)}</strong></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Results & Charts */}
        <Card className="xl:col-span-3">
          <CardHeader><CardTitle>Results & ROI</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* KPI cards */}
            <div className="space-y-2 text-lg">
              <p><strong>Disputes / year:</strong> {selectedCalc.disputesPerYear.toLocaleString()}</p>
              <p><strong>Projected annual labor (do nothing):</strong> {fmtUsd(selectedCalc.projectedAnnualLabor)}</p>
              <p><strong>Annual labor with Unlimited:</strong> {fmtUsd(selectedCalc.withUnlimitedAnnualLabor)}</p>
            </div>
            <div className="space-y-2 text-lg">
              <p><strong>Expected savings (after safety margin):</strong> {fmtUsd(selectedCalc.savingsAfterSafetyMargin)}</p>
              <p><strong>Annual costs (per pricing):</strong> {fmtUsd(selectedCalc.annualCosts)}</p>
              <p><strong>ROI multiple:</strong> {fmtMul(selectedCalc.roiMultiple)}</p>
            </div>
            <div className="space-y-2 text-lg">
              <p><strong>Payback:</strong> {Number.isFinite(selectedCalc.paybackMonths) ? `${selectedCalc.paybackMonths.toFixed(1)} months` : "—"}</p>
              <p><strong>Pricing explainer:</strong> {selectedCalc.priceExplainer}</p>
              <p className="text-muted-foreground text-sm">ROI uses {selected.useProjectedForROI ? "projected" : "baseline"} volumes and applies the safety margin above.</p>
            </div>

            {/* Charts */}
            <div className="col-span-1 lg:col-span-2 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={selectedCalc.priceCurve}>
                  <XAxis dataKey="price" tickFormatter={(v) => `$${Math.round(v/1000)}k`} />
                  <YAxis />
                  <ReTooltip formatter={(v, n) => n === "roi" ? [`${(v).toFixed(2)}×`, "ROI"] : [fmtUsd(v), "Price"]} labelFormatter={(v) => `Price: ${fmtUsd(v)}`} />
                  <Legend />
                  <Line type="monotone" dataKey="roi" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-1 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <ReTooltip formatter={(v) => fmtUsd(v)} />
                  <Legend />
                  <Pie data={selectedCalc.savingsBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    {selectedCalc.savingsBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Compare table */}
            <div className="col-span-1 lg:col-span-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="p-2">Scenario</th>
                      <th className="p-2">ROI (×)</th>
                      <th className="p-2">Expected savings</th>
                      <th className="p-2">Costs</th>
                      <th className="p-2">Payback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compare.map(({ s, m }) => (
                      <tr key={s.id} className="border-t">
                        <td className="p-2 font-medium">{s.name}</td>
                        <td className="p-2">{m.roiMultiple.toFixed(2)}×</td>
                        <td className="p-2">{fmtUsd(m.savingsAfterSafetyMargin)}</td>
                        <td className="p-2">{fmtUsd(m.annualCosts)}</td>
                        <td className="p-2">{Number.isFinite(m.paybackMonths) ? `${m.paybackMonths.toFixed(1)} mo` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Components breakdown */}
            <div className="col-span-1 lg:col-span-3 p-4 border rounded-md bg-muted/30">
              <p className="text-sm">
                <strong>Breakdown (this scenario):</strong>
                <span className="ml-2">Fees & tooling avoided: {fmtUsd(selectedCalc.components.baseFeeSavings)}</span>
                <span className="ml-4">Escalation costs avoided: {fmtUsd(selectedCalc.components.escalationComponent)}</span>
                <span className="ml-4">Statutory damages avoided: {fmtUsd(selectedCalc.components.statutoryExpected)}</span>
                <span className="ml-4">CFPB penalties avoided: {fmtUsd(selectedCalc.components.cfpbExpected)}</span>
                <span className="ml-4">Safety margin (not counted): {fmtUsd(selectedCalc.components.safetyMarginValue)}</span>
              </p>
            </div>

            {/* CTA block (client-facing) */}
            <div className="col-span-1 lg:col-span-3 p-4 border rounded-md bg-muted/50">
              <p className="text-sm">
                With Unlimited.finance, you capture <strong>{fmtUsd(selectedCalc.savingsAfterSafetyMargin)}</strong> in expected annual savings (after the safety margin) against
                <strong> {fmtUsd(selectedCalc.annualCosts)}</strong> in fees for an ROI of <strong>{fmtMul(selectedCalc.roiMultiple)}</strong>.
                At a <strong>{clientTargetROI}×</strong> client ROI target, a price of up to <strong>{fmtUsd(selectedCalc.suggested.flat)}</strong> (flat) or <strong>{fmtUsd(selectedCalc.suggested.perDispute, 2)}</strong> per dispute works today.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sources & Footnotes */}
      {showSources && (
        <Card>
          <CardHeader><CardTitle>Sources, Footnotes & Plain‑English Terms</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-4">
            <div>
              <p className="font-medium mb-1">Plain‑English Definitions</p>
              <ul className="list-disc ml-5 space-y-1">
                <li><strong>Expected savings (after safety margin):</strong> the savings we count after reducing the raw savings by a small percentage to stay conservative.</li>
                <li><strong>Safety margin on savings (%):</strong> the reduction we apply so we don't over‑promise. Example: 10% means we take 90% of calculated savings.</li>
                <li><strong>ROI multiple:</strong> expected savings divided by annual costs. 4× means one dollar spent returns four dollars saved.</li>
                <li><strong>Payback:</strong> months until expected savings cover first‑year costs.</li>
              </ul>
            </div>
            <ol className="list-decimal ml-5 space-y-2">
              <li>
                <strong>BLS Employer Costs for Employee Compensation (ECEC, March 2025):</strong> wages $32.92/hr, benefits $15.00/hr ⇒ ~31% benefits share. <a className="underline" target="_blank" href="https://www.bls.gov/news.release/ecec.nr0.htm">bls.gov/news.release/ecec.nr0.htm</a>
              </li>
              <li>
                <strong>TrueAccord Customer Engagement Specialist pay (Glassdoor):</strong> mid ~$58.9k/yr (~$28/hr). <a className="underline" target="_blank" href="https://www.glassdoor.com/Salary/TrueAccord-Customer-Engagement-Specialist-Salaries-E1101018_D_KO11%2C41.htm">glassdoor.com</a>
              </li>
              <li>
                <strong>FCRA dispute timeline (30 days + up to 15 days):</strong> 15 U.S.C. §1681i. <a className="underline" target="_blank" href="https://www.law.cornell.edu/uscode/text/15/1681i">law.cornell.edu/uscode/text/15/1681i</a>
              </li>
              <li>
                <strong>FCRA willful statutory damages ($100–$1,000 per violation):</strong> 15 U.S.C. §1681n. <a className="underline" target="_blank" href="https://www.law.cornell.edu/uscode/text/15/1681n">law.cornell.edu/uscode/text/15/1681n</a>
              </li>
              <li>
                <strong>CFPB civil money penalty tiers (2025 inflation-adjusted):</strong> Tier 1 $7,217/day; Tier 2 $36,083/day; Tier 3 $1,443,275/day. <a className="underline" target="_blank" href="https://files.consumerfinance.gov/f/documents/cfpb_civil-penalty-inflation-adjustments-final-rule_2025-01.pdf">cfpb.gov (PDF)</a>
              </li>
              <li>
                <strong>e‑OSCAR registration fee:</strong> $90 one-time registration (OLDE). <a className="underline" target="_blank" href="https://www.e-oscar.org/billing-finance">e-oscar.org/billing-finance</a>
              </li>
              <li>
                <strong>ACDV / e‑OSCAR explainer:</strong> CRA↔furnisher dispute routing and codes. <a className="underline" target="_blank" href="https://d1vy0qa05cdjr5.cloudfront.net/bfb36feb-d1d7-4733-9b52-a7d5ed7eedac/Reference%20Cards/ACDV_Responders_Responding_to_ACDVs_RC.pdf">reference card (PDF)</a>
              </li>
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Footer note */}
      <p className="text-xs text-muted-foreground">
        Notes: Adjust assumptions to match TrueAccord’s volumes, bureau mix, and compliance constraints. ROI applies the chosen safety margin so results are conservative. All amounts in USD.
      </p>
    </div>
  );
}
