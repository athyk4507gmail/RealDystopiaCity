/**
 * Shared in-memory store for municipality announcements.
 * Announcements created by municipality staff are visible to citizens
 * in their disruption/notification feed for the matching area.
 */

export interface WaterAnnouncement {
  id: string;
  area: string;         // matches ZONES from mockSchedules.ts
  message: string;
  sentBy: "municipality";
  sentAt: string;       // ISO string
  emailSent: boolean;
  emailId?: string;     // Resend email ID if successful
  recipientCount: number;
}

// Module-global in-memory array (persists while Next.js process runs)
let announcementsStore: WaterAnnouncement[] = [];

export function getAllAnnouncements(): WaterAnnouncement[] {
  return [...announcementsStore];
}

export function getAnnouncementsByArea(area: string): WaterAnnouncement[] {
  return announcementsStore.filter(
    (a) => a.area.toLowerCase() === area.toLowerCase(),
  );
}

export function createAnnouncement(
  data: Omit<WaterAnnouncement, "id" | "sentAt">,
): WaterAnnouncement {
  const newAnnouncement: WaterAnnouncement = {
    ...data,
    id: `ann-${Date.now().toString().slice(-8)}`,
    sentAt: new Date().toISOString(),
  };
  announcementsStore.unshift(newAnnouncement);
  return newAnnouncement;
}
