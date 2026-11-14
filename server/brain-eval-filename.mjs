/** Readable, stable paired filenames for synthetic Brain Lab JSON/Markdown reports.
 * Only report metadata is used; no user text or private facts enter filenames.
 */
export function brainEvalFileStem(report) {
  const started = typeof report?.startedAt === "string" ? report.startedAt : "";
  const validDate = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}/.test(started);
  const stamp = validDate
    ? started.slice(0,10)+"_"+started.slice(11,19).replaceAll(":","")+"Z"
    : "unknown-date";
  const mode = report?.mode === "live" || report?.mode === "routing" ? report.mode : "unknown";
  const model = String(report?.model ?? "unknown")
    .toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")
    .slice(0,32) || "unknown";
  const scenarios = Array.isArray(report?.scenarios) ? report.scenarios.length : 0;
  const count = String(Math.max(0,Math.min(scenarios,999))).padStart(2,"0");
  const attempts = Number.isInteger(report?.attempts) && report.attempts >= 1 && report.attempts <= 5
    ? report.attempts : 1;
  const suffix = String(report?.runId ?? "").split("-").at(-1) ?? "";
  const unique = /^[a-z0-9]{4,12}$/i.test(suffix) ? suffix.toLowerCase() : "unknown";
  return `mikan-brain_${stamp}_${mode}_${model}_s${count}_r${attempts}_${unique}`;
}
