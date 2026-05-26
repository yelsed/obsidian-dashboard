const ONE_MINUTE_IN_MILLISECONDS = 60_000;
const ONE_HOUR_IN_MILLISECONDS = 60 * ONE_MINUTE_IN_MILLISECONDS;
const ONE_DAY_IN_MILLISECONDS = 24 * ONE_HOUR_IN_MILLISECONDS;
const ONE_WEEK_IN_MILLISECONDS = 7 * ONE_DAY_IN_MILLISECONDS;
const ONE_MONTH_IN_MILLISECONDS_APPROXIMATE = 30 * ONE_DAY_IN_MILLISECONDS;
const ONE_YEAR_IN_MILLISECONDS_APPROXIMATE = 365 * ONE_DAY_IN_MILLISECONDS;

export function formatRelativeModifiedTime(modifiedAtMilliseconds: number): string {
  const currentTimeMilliseconds = Date.now();
  const modifiedDate = new Date(modifiedAtMilliseconds);
  const currentDate = new Date(currentTimeMilliseconds);
  const isSameCalendarDay = modifiedDate.toDateString() === currentDate.toDateString();

  if (isSameCalendarDay) {
    return modifiedDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const elapsedMilliseconds = currentTimeMilliseconds - modifiedAtMilliseconds;

  if (elapsedMilliseconds < ONE_DAY_IN_MILLISECONDS) {
    return "today";
  }

  if (elapsedMilliseconds < ONE_WEEK_IN_MILLISECONDS) {
    const elapsedDays = Math.floor(elapsedMilliseconds / ONE_DAY_IN_MILLISECONDS);
    return `${elapsedDays}d`;
  }

  if (elapsedMilliseconds < ONE_MONTH_IN_MILLISECONDS_APPROXIMATE) {
    const elapsedWeeks = Math.floor(elapsedMilliseconds / ONE_WEEK_IN_MILLISECONDS);
    return `${elapsedWeeks}w`;
  }

  if (elapsedMilliseconds < ONE_YEAR_IN_MILLISECONDS_APPROXIMATE) {
    const elapsedMonths = Math.floor(elapsedMilliseconds / ONE_MONTH_IN_MILLISECONDS_APPROXIMATE);
    return `${elapsedMonths}mo`;
  }

  const elapsedYears = Math.floor(elapsedMilliseconds / ONE_YEAR_IN_MILLISECONDS_APPROXIMATE);
  return `${elapsedYears}y`;
}

export function truncateToCharacterBudget(
  rawText: string,
  maximumCharacters: number,
): string {
  const whitespaceCollapsedText = rawText.replace(/\s+/g, " ").trim();
  if (whitespaceCollapsedText.length <= maximumCharacters) {
    return whitespaceCollapsedText;
  }
  if (maximumCharacters <= 1) {
    return "…";
  }
  return `${whitespaceCollapsedText.slice(0, maximumCharacters - 1)}…`;
}

export function debounce<T extends (...args: never[]) => void>(
  functionToDebounce: T,
  delayMilliseconds: number,
): T & { cancel: () => void } {
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  function invoke(...args: Parameters<T>): void {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
    }
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      functionToDebounce(...args);
    }, delayMilliseconds);
  }

  function cancel(): void {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  }

  const debouncedFunction = invoke as T & { cancel: () => void };
  debouncedFunction.cancel = cancel;
  return debouncedFunction;
}
