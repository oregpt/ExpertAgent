/**
 * Date Utilities — SQLite Compatibility
 *
 * PostgreSQL timestamp columns accept Date objects directly.
 * SQLite text columns (storing ISO-8601 strings) cannot bind Date objects.
 *
 * Use `toDbDate()` when passing dates to insert/update/where clauses.
 * In cloud mode it passes through; in desktop mode it converts to ISO string.
 */

const IS_DESKTOP = process.env.IS_DESKTOP === 'true';

/**
 * Convert a Date to the format expected by the current database.
 * pg: returns Date object (native timestamp binding)
 * SQLite: returns ISO-8601 string (text column binding)
 */
export function toDbDate(date: Date): Date | string {
  return IS_DESKTOP ? date.toISOString() : date;
}

/**
 * Get current timestamp in database-compatible format.
 */
export function dbNow(): Date | string {
  return toDbDate(new Date());
}
