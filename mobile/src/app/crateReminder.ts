/**
 * The crate reminder the server's crate list calls for: the unlocking crate's finish time, or
 * none once a video has taken the time off or the crate has been opened.
 */
export function crateReminder(
  crates: { name: string; unlocking: boolean; readyAt: string | null }[] = [],
  now = Date.now(),
) {
  const c = crates.find(
    (c) => c.unlocking && c.readyAt && new Date(c.readyAt).getTime() > now,
  );
  return c
    ? {
        at: new Date(c.readyAt!),
        title: `${c.name} unlocked`,
        body: "Your crate is ready. Open it and collect your coins.",
      }
    : null;
}
