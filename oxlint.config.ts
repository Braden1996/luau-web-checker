import { base, compose } from "@sgt-build/oxlint-config";
import { worker } from "@sgt-build/oxlint-config-worker";
import { defineConfig } from "oxlint";

export default defineConfig(compose(base, worker));
