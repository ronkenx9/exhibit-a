import { handleRun } from "../lib/handler.js";
export const maxDuration = 300;
export function POST(request) {
  return handleRun(request);
}
