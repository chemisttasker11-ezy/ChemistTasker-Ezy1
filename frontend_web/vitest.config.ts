import { fileURLToPath } from "node:url";

// Frontend preinstall already prepares shared-core and its Vitest runner.
export default {
    resolve: { alias: { vitest: fileURLToPath(new URL("../shared-core/node_modules/vitest/dist/index.js", import.meta.url)) } },
    test: { include: ["tests/*.test.ts"] },
};
