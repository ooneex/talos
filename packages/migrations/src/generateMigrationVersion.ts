/**
 * Generates a migration version based on the current timestamp.
 *
 * Format: YYYYMMDDHHMMSSMMM
 * - YYYY: 4-digit year (e.g., 2025)
 * - MM: 2-digit month (01-12)
 * - DD: 2-digit day (01-31)
 * - HH: 2-digit hour in 24-hour format (00-23)
 * - MM: 2-digit minutes (00-59)
 * - SS: 2-digit seconds (00-59)
 * - MMM: 3-digit milliseconds (000-999)
 *
 * @returns {string} A migration version string (e.g., "20250630210755123")
 *
 * @example
 * const version = generateMigrationVersion();
 * console.log(version); // "20250630210755123"
 */
export const generateMigrationVersion = (): string => {
  const now = new Date();

  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const date = now.getDate().toString().padStart(2, "0");
  const hour = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  const milliseconds = now.getMilliseconds().toString().padStart(3, "0");

  return `${year}${month}${date}${hour}${minutes}${seconds}${milliseconds}`;
};
