function getDatePartsInTimeZone(now, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

export function getWeeklyMondayInfo(timeZone = "Asia/Kolkata", now = new Date()) {
  const { year, month, day } = getDatePartsInTimeZone(now, timeZone);
  const currentDateUtc = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = currentDateUtc.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const mondayUtc = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));

  const dd = String(mondayUtc.getUTCDate()).padStart(2, "0");
  const mm = String(mondayUtc.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(mondayUtc.getUTCFullYear());

  return {
    title: `${dd}${mm}${yyyy}`,
    slug: `${dd}${mm}${yyyy}`,
    mondayIsoDate: `${yyyy}-${mm}-${dd}`
  };
}
