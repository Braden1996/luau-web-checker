// The page's side of the checker worker: one request at a time, newest wins, each answered by its own promise.

import type { Completion, Diagnostic } from "luau-web-checker";

import type { Definitions, Request, Response } from "./protocol.ts";

export interface Settings {
  readonly definitions: Definitions;
  readonly strict: boolean;
}

export interface CheckerClient {
  check(source: string, settings: Settings): Promise<readonly Diagnostic[]>;
  typeAt(
    source: string,
    settings: Settings,
    line: number,
    column: number,
  ): Promise<string | undefined>;
  complete(
    source: string,
    settings: Settings,
    line: number,
    column: number,
  ): Promise<readonly Completion[]>;
}

type Body = Request extends infer R ? (R extends Request ? Omit<R, "id"> : never) : never;

function fail(response: Response): never {
  throw new Error(
    response.kind === "error" ? response.message : `unexpected ${response.kind} response`,
  );
}

export function createClient(): CheckerClient {
  const worker = new Worker(new URL("checker.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, (response: Response) => void>();
  let nextId = 1;

  worker.addEventListener("message", (event: MessageEvent<Response>) => {
    pending.get(event.data.id)?.(event.data);
    pending.delete(event.data.id);
  });

  const send = (body: Body): Promise<Response> =>
    new Promise((resolve) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, resolve);
      worker.postMessage({ ...body, id });
    });

  return {
    async check(source, settings) {
      const response = await send({ kind: "check", source, ...settings });
      return response.kind === "check" ? response.diagnostics : fail(response);
    },
    async typeAt(source, settings, line, column) {
      const response = await send({ kind: "typeAt", source, ...settings, line, column });
      return response.kind === "typeAt" ? response.type : fail(response);
    },
    async complete(source, settings, line, column) {
      const response = await send({ kind: "complete", source, ...settings, line, column });
      return response.kind === "complete" ? response.completions : fail(response);
    },
  };
}
