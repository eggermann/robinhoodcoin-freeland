export function isDatabaseUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  return (
    message.includes("unable to open the database file")
    || message.includes("error querying the database")
    || message.includes("can't reach database server")
    || message.includes("database does not exist")
  );
}
