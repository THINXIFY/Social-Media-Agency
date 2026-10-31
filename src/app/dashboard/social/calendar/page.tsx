import type { Metadata } from "next";
import { PublishingCalendar } from "@/components/social/calendar";
import { PublishingPage } from "@/components/social/loader";

export const metadata: Metadata = { title: "Content calendar" };

export default function CalendarPage() {
  return <PublishingPage render={(data) => <PublishingCalendar data={data} />} />;
}
