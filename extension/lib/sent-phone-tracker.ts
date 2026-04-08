/**
 * Tracks recently-sent phone numbers with a bounded capacity.
 * When the capacity is exceeded, the oldest entries are evicted.
 */
export class SentPhoneTracker {
  private order: string[] = [];
  private set = new Set<string>();

  constructor(private capacity: number) {}

  add(phone: string): void {
    if (this.set.has(phone)) return;
    if (this.order.length >= this.capacity) {
      const oldest = this.order.shift()!;
      this.set.delete(oldest);
    }
    this.order.push(phone);
    this.set.add(phone);
  }

  has(phone: string): boolean {
    return this.set.has(phone);
  }
}
