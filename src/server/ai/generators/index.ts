import "server-only";
import type { Generator } from "../run";
import { advisorGenerator } from "./advisor";
import { assistantGenerator } from "./assistant";
import { calendarGenerator } from "./calendar";
import { campaignGenerator } from "./campaign";
import { automationAssistantGenerator } from "./automation";
import { captionGenerator } from "./caption";
import { hashtagGenerator } from "./hashtag";
import { ideasGenerator } from "./ideas";
import { orderAssistantGenerator } from "./order-assistant";
import { orderExplanationGenerator } from "./order-explanation";
import { recommenderGenerator } from "./recommender";
import { roadmapGenerator } from "./roadmap";
import { searchGenerator } from "./search";
import { supportGenerator } from "./support";

/** Content Studio generators (AI-02), by registry tool id. */
export const CONTENT_STUDIO: Record<string, Generator> = {
  "caption-generator": captionGenerator as Generator,
  "hashtag-finder": hashtagGenerator as Generator,
  "post-ideas": ideasGenerator as Generator,
  "content-calendar": calendarGenerator as Generator,
};

/** Growth Intelligence generators (AI-03). */
export const GROWTH_INTELLIGENCE: Record<string, Generator> = {
  "growth-advisor": advisorGenerator as Generator,
  "growth-roadmap": roadmapGenerator as Generator,
  "service-recommender": recommenderGenerator as Generator,
};

/** Smart Assistance generators (AI-04). */
export const SMART_ASSISTANCE: Record<string, Generator> = {
  assistant: assistantGenerator as Generator,
  "service-search": searchGenerator as Generator,
};

/** Order & Customer Support Intelligence (AI-05). Read-only; the order tools use the session's own customer id. */
export const ORDER_SUPPORT: Record<string, Generator> = {
  "order-assistant": orderAssistantGenerator as Generator,
  "order-explanation": orderExplanationGenerator as Generator,
  "support-assistant": supportGenerator as Generator,
};

/** AI-07: dashboard-only (Social workspace). */
export const CAMPAIGN_STUDIO: Record<string, Generator> = {
  "campaign-planner": campaignGenerator as unknown as Generator,
  "automation-assistant": automationAssistantGenerator as unknown as Generator,
};
