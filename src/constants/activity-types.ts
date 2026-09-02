/**
 * Activity timeline entry types (spec §5).
 *
 * `system` types are written only by the backend (triggers / service layer) in
 * response to something happening — a status change, an assignment, a payment.
 * Non-system types are the outreach actions a salesperson logs by hand.
 *
 * Maps to the `crm.activity_type` Postgres enum.
 */
export interface ActivityTypeDef {
  readonly label: string;
  /** True when only the backend may create this entry; hidden from the "log activity" picker. */
  readonly system: boolean;
}

export const ACTIVITY_TYPES = {
  prospect_created: { label: 'Prospect created', system: true },
  prospect_assigned: { label: 'Prospect assigned', system: true },
  dm_sent: { label: 'DM sent', system: false },
  whatsapp_sent: { label: 'WhatsApp message sent', system: false },
  phone_call: { label: 'Phone call', system: false },
  email_sent: { label: 'Email sent', system: false },
  reply_received: { label: 'Reply received', system: false },
  demo_booked: { label: 'Demo booked', system: false },
  demo_completed: { label: 'Demo completed', system: false },
  trial_started: { label: 'Trial started', system: true },
  follow_up: { label: 'Follow-up', system: false },
  payment_received: { label: 'Payment received', system: true },
  status_changed: { label: 'Status changed', system: true },
  note_added: { label: 'Note added', system: true },
  marked_lost: { label: 'Prospect marked lost', system: true },
} as const satisfies Record<string, ActivityTypeDef>;

export type ActivityType = keyof typeof ACTIVITY_TYPES;

export const ACTIVITY_TYPE_LIST = Object.keys(ACTIVITY_TYPES) as ActivityType[];

/** Types a user may pick when manually logging an outreach activity. */
export const MANUAL_ACTIVITY_TYPES = ACTIVITY_TYPE_LIST.filter((t) => !ACTIVITY_TYPES[t].system);

export function isActivityType(value: unknown): value is ActivityType {
  return typeof value === 'string' && value in ACTIVITY_TYPES;
}

export function isManualActivityType(value: unknown): value is ActivityType {
  return isActivityType(value) && !ACTIVITY_TYPES[value].system;
}
