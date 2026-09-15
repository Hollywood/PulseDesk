export interface RescheduleRequest {
  patientId: string;
  providerId: string;
  previousSlotId: string;
  targetStart: string;
}

export interface AppointmentSlot {
  id: string;
  patientId: string;
  providerId: string;
  start: string;
}

/**
 * Stable identity of one logical reschedule, mirroring the claims-api
 * stable-claim-key pattern: a retry of the same reschedule carries the same
 * key, so it must reuse the already-created target slot instead of booking a
 * second one (the TICKET-1038 double-booking).
 */
function rescheduleKey(request: RescheduleRequest): string {
  return [request.patientId, request.providerId, request.previousSlotId, request.targetStart].join("::");
}

export class SchedulingService {
  private readonly slots: AppointmentSlot[] = [];
  private readonly slotsByReschedule = new Map<string, AppointmentSlot>();
  private nextSlotNumber = 1;

  reschedule(request: RescheduleRequest): AppointmentSlot {
    const key = rescheduleKey(request);
    const existing = this.slotsByReschedule.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const slot: AppointmentSlot = {
      id: `SLOT-${this.nextSlotNumber++}`,
      patientId: request.patientId,
      providerId: request.providerId,
      start: request.targetStart,
    };

    this.slots.push(slot);
    this.slotsByReschedule.set(key, slot);
    return slot;
  }

  listSlots(): readonly AppointmentSlot[] {
    return this.slots;
  }
}
