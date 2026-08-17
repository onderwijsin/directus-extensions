// Directus supplies the Knex instance at runtime without a local TypeScript type.
/* oxlint-disable typescript/no-unsafe-call */

const projectId = '01a00571-d545-776d-99b3-359350cdeb18'
const projectOwner = 'remi@onderwijsin.nl'

/**
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @returns {Promise<void>}
 */
export async function up(knex) {
	console.log('💾 Seeding project_id and project_owner')
	await knex('directus_settings').where('id', 1).update({
		project_id: projectId,
		project_owner: projectOwner,
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
		.update({
			project_id: null,
			project_owner: null,
		})
	console.log('✅ Clearing of project_id and project_owner successful')
}
