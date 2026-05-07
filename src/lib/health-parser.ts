export type HealthMetric = {
  name: string;
  value: string | number;
  unit?: string;
  date?: string;
};

export type ParsedHealthData = {
  format: "apple-health" | "fitbit" | "garmin" | "csv" | "json" | "unknown";
  vitals: HealthMetric[];
  sleep: HealthMetric[];
  activity: HealthMetric[];
  summary: string;
  rawSampleSize: number;
  errors: string[];
  warnings: string[];
};

type ParseResult = { data: ParsedHealthData; normalizedText: string };

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function parseAppleHealthXML(text: string): ParsedHealthData {
  const data: ParsedHealthData = {
    format: "apple-health",
    vitals: [],
    sleep: [],
    activity: [],
    summary: "",
    rawSampleSize: 0,
    errors: [],
    warnings: [],
  };

  const recordPattern = /<Record[^>]+>/g;
  const matches = text.match(recordPattern) ?? [];
  data.rawSampleSize = matches.length;

  if (matches.length === 0) {
    data.errors.push("No <Record> elements found. Make sure this is an Apple Health export.xml file.");
    return data;
  }

  const getAttr = (tag: string, attr: string): string => {
    const m = tag.match(new RegExp(`${attr}="([^"]*)"`, "i"));
    return m ? m[1] : "";
  };

  const heartRates: number[] = [];
  const steps: number[] = [];
  const sleepMinutes: number[] = [];
  const restingHR: number[] = [];
  const oxygenSat: number[] = [];
  const bodyMass: number[] = [];
  const activeEnergy: number[] = [];
  const distanceWalking: number[] = [];
  const bloodPressureSystolic: number[] = [];
  const bloodPressureDiastolic: number[] = [];

  const recent = matches.slice(-5000);
  for (const rec of recent) {
    const type = getAttr(rec, "type");
    const val = getAttr(rec, "value");
    const date = getAttr(rec, "startDate").slice(0, 10);
    const unit = getAttr(rec, "unit");
    const num = parseFloat(val);

    if (type.includes("HeartRate") && !type.includes("Resting")) {
      if (!isNaN(num)) heartRates.push(num);
    } else if (type.includes("RestingHeartRate")) {
      if (!isNaN(num)) restingHR.push(num);
    } else if (type.includes("StepCount")) {
      if (!isNaN(num)) steps.push(num);
    } else if (type.includes("SleepAnalysis")) {
      if (val === "HKCategoryValueSleepAnalysisAsleep" || val.includes("Asleep")) {
        sleepMinutes.push(60);
      }
    } else if (type.includes("OxygenSaturation")) {
      if (!isNaN(num)) oxygenSat.push(num * (num <= 1 ? 100 : 1));
    } else if (type.includes("BodyMass")) {
      if (!isNaN(num)) bodyMass.push(num);
    } else if (type.includes("ActiveEnergyBurned")) {
      if (!isNaN(num)) activeEnergy.push(num);
    } else if (type.includes("DistanceWalkingRunning")) {
      if (!isNaN(num)) distanceWalking.push(num);
    } else if (type.includes("BloodPressureSystolic")) {
      if (!isNaN(num)) bloodPressureSystolic.push(num);
    } else if (type.includes("BloodPressureDiastolic")) {
      if (!isNaN(num)) bloodPressureDiastolic.push(num);
    }
  }

  if (heartRates.length) {
    data.vitals.push({ name: "Avg Heart Rate", value: Math.round(avg(heartRates)), unit: "bpm" });
    data.vitals.push({ name: "Max Heart Rate", value: Math.round(Math.max(...heartRates)), unit: "bpm" });
    data.vitals.push({ name: "Min Heart Rate", value: Math.round(Math.min(...heartRates)), unit: "bpm" });
  }
  if (restingHR.length) {
    data.vitals.push({ name: "Avg Resting HR", value: Math.round(avg(restingHR)), unit: "bpm" });
  }
  if (oxygenSat.length) {
    data.vitals.push({ name: "Avg O₂ Saturation", value: avg(oxygenSat).toFixed(1), unit: "%" });
  }
  if (bodyMass.length) {
    data.vitals.push({ name: "Latest Body Mass", value: bodyMass[bodyMass.length - 1].toFixed(1), unit: "kg" });
  }
  if (bloodPressureSystolic.length && bloodPressureDiastolic.length) {
    data.vitals.push({
      name: "Avg Blood Pressure",
      value: `${Math.round(avg(bloodPressureSystolic))}/${Math.round(avg(bloodPressureDiastolic))}`,
      unit: "mmHg",
    });
  }

  if (sleepMinutes.length) {
    const avgSleepHrs = (avg(sleepMinutes) / 60).toFixed(1);
    data.sleep.push({ name: "Avg Sleep", value: avgSleepHrs, unit: "hrs/night" });
    data.sleep.push({ name: "Sleep Records", value: sleepMinutes.length, unit: "samples" });
  } else {
    data.warnings.push("No sleep data found in this export.");
  }

  if (steps.length) {
    const totalSteps = steps.reduce((a, b) => a + b, 0);
    data.activity.push({ name: "Total Steps", value: Math.round(totalSteps).toLocaleString(), unit: "steps" });
    data.activity.push({ name: "Avg Daily Steps", value: Math.round(avg(steps)).toLocaleString(), unit: "steps/sample" });
  }
  if (activeEnergy.length) {
    data.activity.push({ name: "Total Active Energy", value: Math.round(activeEnergy.reduce((a, b) => a + b, 0)), unit: "kcal" });
  }
  if (distanceWalking.length) {
    data.activity.push({ name: "Total Distance", value: distanceWalking.reduce((a, b) => a + b, 0).toFixed(2), unit: "km" });
  }

  return data;
}

function parseFitbitCSV(text: string, filename: string): ParsedHealthData {
  const data: ParsedHealthData = {
    format: "fitbit",
    vitals: [],
    sleep: [],
    activity: [],
    summary: "",
    rawSampleSize: 0,
    errors: [],
    warnings: [],
  };

  const lines = text.split("\n").filter((l) => l.trim());
  data.rawSampleSize = lines.length;

  if (lines.length < 2) {
    data.errors.push("CSV file has fewer than 2 lines — it may be empty or unsupported.");
    return data;
  }

  const header = lines[0].toLowerCase();
  const rows = lines.slice(1).map((l) => l.split(","));

  const fn = filename.toLowerCase();

  if (fn.includes("heart_rate") || header.includes("heart rate")) {
    const vals = rows.map((r) => parseFloat(r[1] ?? r[0])).filter((n) => !isNaN(n));
    if (vals.length) {
      data.vitals.push({ name: "Avg Heart Rate", value: Math.round(avg(vals)), unit: "bpm" });
      data.vitals.push({ name: "Max Heart Rate", value: Math.round(Math.max(...vals)), unit: "bpm" });
    }
  } else if (fn.includes("sleep") || header.includes("sleep")) {
    const minutesAsleep = rows
      .map((r) => {
        const idx = header.split(",").indexOf("minutes asleep");
        return parseFloat(r[idx >= 0 ? idx : 4] ?? "0");
      })
      .filter((n) => !isNaN(n) && n > 0);
    if (minutesAsleep.length) {
      data.sleep.push({ name: "Avg Sleep", value: (avg(minutesAsleep) / 60).toFixed(1), unit: "hrs/night" });
    }
  } else if (fn.includes("steps") || header.includes("steps")) {
    const vals = rows.map((r) => parseFloat(r[1] ?? "0")).filter((n) => !isNaN(n) && n > 0);
    if (vals.length) {
      data.activity.push({ name: "Total Steps", value: Math.round(vals.reduce((a, b) => a + b, 0)).toLocaleString(), unit: "steps" });
      data.activity.push({ name: "Avg Daily Steps", value: Math.round(avg(vals)).toLocaleString(), unit: "steps/day" });
    }
  } else if (fn.includes("calories") || header.includes("calor")) {
    const vals = rows.map((r) => parseFloat(r[1] ?? "0")).filter((n) => !isNaN(n) && n > 0);
    if (vals.length) {
      data.activity.push({ name: "Avg Calories", value: Math.round(avg(vals)), unit: "kcal/day" });
    }
  } else {
    data.warnings.push(`Detected CSV but couldn't identify Fitbit data type from filename "${filename}". Sending raw sample to model.`);
  }

  return data;
}

function parseGenericJSON(text: string): ParsedHealthData {
  const data: ParsedHealthData = {
    format: "json",
    vitals: [],
    sleep: [],
    activity: [],
    summary: "",
    rawSampleSize: 0,
    errors: [],
    warnings: [],
  };

  try {
    const obj = JSON.parse(text);
    data.rawSampleSize = Array.isArray(obj) ? obj.length : Object.keys(obj).length;
    data.warnings.push("JSON format detected — sending structured data directly to model for analysis.");
  } catch {
    data.errors.push("Could not parse as valid JSON.");
  }

  return data;
}

export function parseHealthFile(text: string, filename: string, mimeType: string): ParseResult {
  const fn = filename.toLowerCase();
  const isXML = mimeType === "text/xml" || mimeType === "application/xml" || fn.endsWith(".xml");
  const isCSV = mimeType === "text/csv" || fn.endsWith(".csv");
  const isJSON = mimeType === "application/json" || fn.endsWith(".json");

  let parsed: ParsedHealthData;

  if (isXML && (fn.includes("export") || text.includes("HealthData") || text.includes("HKQuantityTypeIdentifier"))) {
    parsed = parseAppleHealthXML(text);
  } else if (isCSV) {
    parsed = parseFitbitCSV(text, filename);
  } else if (isJSON) {
    parsed = parseGenericJSON(text);
  } else if (fn.endsWith(".xml") || text.trimStart().startsWith("<")) {
    parsed = parseAppleHealthXML(text);
  } else if (fn.endsWith(".csv") || (text.includes(",") && text.split("\n")[0].includes(","))) {
    parsed = parseFitbitCSV(text, filename);
  } else {
    parsed = {
      format: "unknown",
      vitals: [],
      sleep: [],
      activity: [],
      summary: "",
      rawSampleSize: 0,
      errors: [],
      warnings: [
        `Format not recognized for file "${filename}". Supported: Apple Health export.xml, Fitbit CSV exports, JSON. Sending raw content to model.`,
      ],
    };
  }

  const sections: string[] = [];

  if (parsed.vitals.length) {
    sections.push(
      "## Vitals\n" +
        parsed.vitals.map((m) => `- **${m.name}**: ${m.value}${m.unit ? " " + m.unit : ""}`).join("\n")
    );
  }
  if (parsed.sleep.length) {
    sections.push(
      "## Sleep\n" +
        parsed.sleep.map((m) => `- **${m.name}**: ${m.value}${m.unit ? " " + m.unit : ""}`).join("\n")
    );
  }
  if (parsed.activity.length) {
    sections.push(
      "## Activity\n" +
        parsed.activity.map((m) => `- **${m.name}**: ${m.value}${m.unit ? " " + m.unit : ""}`).join("\n")
    );
  }

  const hasParsedData = parsed.vitals.length + parsed.sleep.length + parsed.activity.length > 0;

  const rawSample = hasParsedData
    ? text.slice(0, 30000)
    : text.length > 200000
    ? text.slice(0, 100000) + "\n\n[...truncated...]\n\n" + text.slice(-50000)
    : text;

  let normalizedText = `# Health Export: ${filename}\n**Format**: ${parsed.format} | **Records scanned**: ${parsed.rawSampleSize.toLocaleString()}\n\n`;

  if (parsed.errors.length) {
    normalizedText += "**⚠ Parsing Issues:**\n" + parsed.errors.map((e) => `- ${e}`).join("\n") + "\n\n";
  }
  if (parsed.warnings.length) {
    normalizedText += "**ℹ Notes:**\n" + parsed.warnings.map((w) => `- ${w}`).join("\n") + "\n\n";
  }

  if (hasParsedData) {
    normalizedText += "## Normalized Summary\n" + sections.join("\n\n") + "\n\n---\n\n## Raw Data Sample\n```\n" + rawSample.slice(0, 40000) + "\n```";
  } else {
    normalizedText += "## Raw Data\n```\n" + rawSample + "\n```";
  }

  return { data: parsed, normalizedText };
}
