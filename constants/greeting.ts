/**
 * Time-of-day greeting for dashboard headers.
 *
 * Kept out of the component so it can be unit-tested and so every role shell
 * says the same thing at the same hour. Uses the device clock — swap in the
 * server's timezone if the backend ever starts sending one.
 */
export function timeGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}
