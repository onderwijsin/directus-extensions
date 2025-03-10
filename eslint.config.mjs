import directusConfig from "@directus/eslint-config";

export default [
	...directusConfig,
	{
		ignores: ["**/*.md", "**/shims.d.ts", "**/shim.d.ts"]
	},
	{
		rules: {
			// Temporary disabled, will be resolved step by step
			"unicorn/no-array-callback-reference": "off",
			"unicorn/no-await-expression-member": "off",
			"unicorn/consistent-function-scoping": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/prefer-module": "off",
			"@stylistic/comma-dangle": "off",
			"@stylistic/quotes": "off",
			"comma-dangle": ["error", "never"],
			"quotes": ["error", "double"]
		}
	},
	{
		files: ["**/*.vue"],
		rules: {
			"vue/valid-v-slot": "warn",
			"vue/require-v-for-key": "off",
			"vue/prop-name-casing": "off"
		}
	}
];
