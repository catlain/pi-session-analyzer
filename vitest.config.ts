import path from "node:path";
import { createConfig } from "../vitest.config.base";

export default createConfig({
	alias: {
		"@pi-atelier/shared-utils/tool-output": path.resolve(
			__dirname,
			"tests/__mocks__/tool-output.ts",
		),
	},
});
