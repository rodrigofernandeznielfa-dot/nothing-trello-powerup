export const ESTIMATE_KEY = "nothing_estimates_v1";
export const IDEAS_LIST = "6aec66eb5ff8ae196d37b7ca";
export function itemsOf(checklists = []) {
  return (Array.isArray(checklists) ? checklists : []).flatMap(list =>
    Array.isArray(list.checkItems) ? list.checkItems.map(item => ({
      id: item.id, name: item.name || "",
      done: String(item.state).toLowerCase() === "complete",
      checklist: list.name || ""
    })) : []);
}
export function validHours(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 999;
}
export function summarize(checklists = [], estimates = {}) {
  const items = itemsOf(checklists), total = items.length;
  const complete = items.filter(x=>x.done).length;
  const pending = items.filter(x=>!x.done);
  const unestimated = pending.filter(x=>!validHours(estimates[x.id])).length;
  const remainingHours = unestimated===0 && total>0
    ? Math.round(pending.reduce((sum,x)=>sum+estimates[x.id],0)*10)/10 : null;
  return {complete, total, percentage: total ? Math.round(100*complete/total) : null,
    remainingHours, unestimated};
}
export function progressBar(p) {
  if (p === null) return "";
  const n = Math.min(5,Math.max(0,Math.round(p/20)));
  return "▰".repeat(n)+"▱".repeat(5-n);
}
export function badgeData(checklists, estimates, idList) {
  if (idList === IDEAS_LIST) return [];
  const s = summarize(checklists, estimates);
  if (!s.total) return [];
  return [
    {text:progressBar(s.percentage)+" "+s.percentage+"% ("+s.complete+"/"+s.total+")",
     color:s.percentage===100?"green":s.percentage>=50?"blue":"light-gray"},
    {text:s.remainingHours===null?"⏱ Sin estimar":"⏱ "+s.remainingHours+" h pendientes",
     color:s.remainingHours===null?"light-gray":"sky"}
  ];
}
