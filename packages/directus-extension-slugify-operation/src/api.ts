import { defineOperationApi } from '@directus/extensions-sdk';

type Options = {
	fields: string[];
	output_key: string;
	make_unique: boolean;
	lowercase: boolean;
};

function randomString(length: number): string {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}

export default defineOperationApi<Options>({
	id: 'slugify',
	handler: ({ fields, output_key, make_unique, lowercase }, { data }) => {
		if (!data.$trigger || typeof data.$trigger !== 'object' || !('payload' in (data.$trigger as unknown as Object))) return {}

		let value = fields.map(field => (data.$trigger as any).payload[field]).filter(Boolean).join('-');
		
		// If input fields were not edited, or a slug was provided, return trigger data.
		if (!value || (data.$trigger as any).payload[output_key]) return { ...(data.$trigger as any).payload };

		// Normalize accents using Unicode decomposition
		const normalizedValue = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

		let slug = normalizedValue
			.trim()
			.replace(/[^\w\s-]/g, '')  // Allow only alphanumeric, spaces, and hyphens
			.replace(/[\s_-]+/g, '-')  // Convert spaces, underscores, and multiple hyphens to single hyphen
			.replace(/^-+|-+$/g, '');  // Remove leading/trailing hyphens
			
		if (lowercase) {
			slug = slug.toLowerCase();
		}

		if (make_unique) { 
			slug += ('-' + randomString(6))
		}

		return {
			...(data.$trigger as any).payload,
			[output_key]: slug
		};


	},
});
