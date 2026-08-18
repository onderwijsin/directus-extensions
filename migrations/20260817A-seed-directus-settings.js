// Directus supplies the Knex instance at runtime without a local TypeScript type.
/* oxlint-disable typescript/no-unsafe-call */

/**
 * ⚠️ DO NOT MODIFY THIS ID!
 * The Directus Licensing service requires a stable project ID.
 * License-key seeding is temporarily disabled while CI activation behavior is investigated.
 */
const projectId = '01a00571-d545-776d-99b3-359350cdeb18'
const projectOwner = 'remi@onderwijsin.nl'

/**
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @returns {Promise<void>}
 */
export async function up(knex) {
	console.log('💾 Seeding project_id and project_owner')

	// const licenseKey = process.env.LICENSE_KEY
	// if (!licenseKey) {
	// 	throw new Error(
	// 		'LICENSE_KEY is required to run this migration. Please make it available as an environment variable.',
	// 	)
	// }

	await knex('directus_settings').where('id', 1).update({
		project_id: projectId,
		project_owner: projectOwner,
		// license_key: licenseKey,
	})
	console.log('✅ Seeding of project_id and project_owner successful')
}

/**
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @returns {Promise<void>}
 */
export async function down(knex) {
	console.log('🧹 Clearing project_id and project_owner')
	await knex('directus_settings')
		.where('id', 1)
		.where('project_id', projectId)
		.where('project_owner', projectOwner)
		// .where('license_key', process.env.LICENSE_KEY)
		.update({
			project_id: null,
			project_owner: null,
			// license_key: null,
		})
	console.log('✅ Clearing of project_id and project_owner successful')
}
