import type { ErrorHandler } from "hono";
import { apiFailure } from "@repo/shared/http";
import { DatabaseError } from "../_core/db";

function safeDatabaseMessage(message: string) {
  return message
    .slice(0, 500)
    .replace(/(?:libsql|https?):\/\/[^\s"'\x60]+/gi, "[database-url]")
    .replace(/(auth(?:entication)?[_ -]?token|password|secret)\s*[:=]\s*["']?[^,\s"']+/gi, "$1=[redacted]");
}

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof DatabaseError) {
    console.error("[api] database request error", {
      name: err.name,
      code: err.code,
      status: err.status,
      databaseMessage: safeDatabaseMessage(err.databaseMessage)
    });
  } else {
    console.error("[api] unhandled request error", {
      name: err instanceof Error ? err.name : "UnknownError"
    });
  }

  return c.json(apiFailure("INTERNAL_SERVER_ERROR", "The request could not be completed"), 500);
};
