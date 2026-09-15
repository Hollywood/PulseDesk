import { describe, expect, it } from "vitest";
import { SchedulingService, type RescheduleRequest } from "./scheduling.js";

describe("appointment rescheduling", () => {
  it("creates one target slot when the same reschedule request is submitted twice", () => {
    const scheduling = new SchedulingService();
    const request: RescheduleRequest = {
      patientId: "PT-0001",
      providerId: "PRV-0001",
      previousSlotId: "SLOT-ORIGINAL-0001",
      targetStart: "2026-09-18T15:00:00Z",
    };

    const first = scheduling.reschedule(request);
    const second = scheduling.reschedule(request);

    expect(second.id).toBe(first.id);
    expect(scheduling.listSlots()).toHaveLength(1);
  });

  it("creates separate target slots for distinct reschedule requests", () => {
    const scheduling = new SchedulingService();

    scheduling.reschedule({
      patientId: "PT-0001",
      providerId: "PRV-0001",
      previousSlotId: "SLOT-ORIGINAL-0001",
      targetStart: "2026-09-18T15:00:00Z",
    });
    scheduling.reschedule({
      patientId: "PT-0002",
      providerId: "PRV-0001",
      previousSlotId: "SLOT-ORIGINAL-0002",
      targetStart: "2026-09-18T15:30:00Z",
    });

    expect(scheduling.listSlots()).toHaveLength(2);
  });
});
