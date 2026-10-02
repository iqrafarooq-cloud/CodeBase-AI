import "server-only";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json({ error: { message, code } }, { status });
}

export function zodError(error: ZodError) {
  const first = error.issues[0];
  const where = first?.path.join(".") || "input";
  return jsonError(400, first ? `${where}: ${first.message}` : "Invalid input", "invalid_input");
}

export class RequestTooLarge extends Error {}

/** Reads a JSON body with a hard size cap. Returns undefined for malformed JSON. */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new RequestTooLarge();
  const text = await req.text();
  if (text.length > maxBytes) throw new RequestTooLarge();
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
