import "server-only";
import { createJevHandlers } from "./jev-http";

export const jevHandlers = createJevHandlers(() => ({
  apiKey: process.env.TYPESAFE_API_KEY?.trim() ?? "",
  deskToken: process.env.JEV_DESK_TOKEN?.trim() ?? "",
}));
