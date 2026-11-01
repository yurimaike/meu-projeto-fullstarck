import type { ErrorHandler } from "hono";
import { apiFailure } from "@repo/shared/http";

export const onError: ErrorHandler = (err, c) => {
  console.error("[api] unhandled request error", { name: err instanceof Error ? err.name : "UnknownError" });
  return c.json(apiFailure("INTERNAL_SERVER_ERROR", "The request could not be completed"), 500);
};
