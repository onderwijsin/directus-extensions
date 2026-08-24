/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-return, typescript/no-unsafe-argument -- Directus loads JavaScript migrations with its runtime Knex instance. */

/**
 * Adds database-level uniqueness guarantees for active Sluggernaut redirects.
 *
 * Make sure SLUGGERNAUT_REDIRECTS_COLLECTION env variable is available or replace
 * 'redirects' with the correct table name.
 *
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @returns {Promise<void>} Resolves after the migration is applied.
 */
export async function up(knex) {
	const table = process.env.SLUGGERNAUT_REDIRECTS_COLLECTION ?? 'redirects'
	const vendor = databaseVendor(knex)

	await validateMigrationTarget(knex, table)

	if (vendor === 'postgres' || vendor === 'sqlite') {
		await createPartialIndexes(knex, table)
		return
	}

	if (vendor === 'mysql') {
		await createMysqlGeneratedColumnsAndIndexes(knex, table)
		return
	}

	throw new Error(
		`Sluggernaut redirect integrity migration does not support database vendor "${vendor}".`,
	)
}

/**
 * Removes the database-level uniqueness guarantees added by {@link up}.
 *
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @returns {Promise<void>} Resolves after the migration is reverted.
 */
export async function down(knex) {
	const table = process.env.SLUGGERNAUT_REDIRECTS_COLLECTION ?? 'redirects'
	const vendor = databaseVendor(knex)

	if (vendor === 'postgres' || vendor === 'sqlite') {
		await dropIndex(knex, EXACT_INDEX)
		await dropIndex(knex, PATTERN_INDEX)
		return
	}

	if (vendor === 'mysql') {
		await dropMysqlIndex(knex, table, EXACT_INDEX)
		await dropMysqlIndex(knex, table, PATTERN_INDEX)
		await dropMysqlColumn(knex, table, MYSQL_EXACT_COLUMN)
		await dropMysqlColumn(knex, table, MYSQL_PATTERN_COLUMN)
		return
	}

	throw new Error(
		`Sluggernaut redirect integrity migration does not support database vendor "${vendor}".`,
	)
}

const EXACT_INDEX = 'sluggernaut_active_exact_origin_uq'
const PATTERN_INDEX = 'sluggernaut_active_pattern_signature_uq'
const MYSQL_EXACT_COLUMN = '__sluggernaut_active_exact_origin'
const MYSQL_PATTERN_COLUMN = '__sluggernaut_active_pattern_signature'

/**
 * Resolves the Knex client name used by Directus.
 *
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @returns {string} Normalized database vendor.
 */
function databaseVendor(knex) {
	const client = String(knex.client.config.client ?? '').toLowerCase()

	if (client === 'pg' || client === 'postgres' || client === 'postgresql') return 'postgres'
	if (client === 'mysql' || client === 'mysql2') return 'mysql'
	if (client === 'sqlite3' || client === 'better-sqlite3') return 'sqlite'

	return client || 'unknown'
}

/**
 * Validates the existing redirect data before any schema changes are attempted.
 *
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @param {string} table - Redirect table name.
 * @returns {Promise<void>} Resolves when the table and data satisfy the invariant.
 */
async function validateMigrationTarget(knex, table) {
	if (!(await knex.schema.hasTable(table))) {
		throw new Error(
			`Sluggernaut redirect integrity migration requires the "${table}" table to exist.`,
		)
	}

	const columns = await knex(table).columnInfo()
	const requiredColumns = ['origin', 'match', 'is_active', 'matcher_signature']
	const missingColumns = requiredColumns.filter((column) => columns[column] === undefined)

	if (missingColumns.length > 0) {
		throw new Error(
			`Sluggernaut redirect integrity migration requires these columns on "${table}": ${missingColumns.join(', ')}.`,
		)
	}

	const invalidMatchRows = await knex(table)
		.select('id', 'match')
		.where((query) => query.whereNull('match').orWhereNotIn('match', ['exact', 'pattern']))
		.limit(10)

	if (invalidMatchRows.length > 0) {
		throw new Error(
			`Sluggernaut redirect integrity migration found rows with an invalid match value in "${table}".`,
		)
	}

	const duplicateExactOrigins = await knex(table)
		.select('origin')
		.where('is_active', true)
		.where('match', 'exact')
		.groupBy('origin')
		.havingRaw('COUNT(*) > 1')
		.limit(10)

	if (duplicateExactOrigins.length > 0) {
		throw new Error(
			`Sluggernaut redirect integrity migration found duplicate active exact origins in "${table}". Repair these rows before applying the migration.`,
		)
	}

	const activePatternsWithoutSignature = await knex(table)
		.select('id', 'origin')
		.where('is_active', true)
		.where('match', 'pattern')
		.whereNull('matcher_signature')
		.limit(10)

	if (activePatternsWithoutSignature.length > 0) {
		throw new Error(
			`Sluggernaut redirect integrity migration found active pattern redirects without matcher_signature in "${table}". Recalculate or repair these rows before applying the migration.`,
		)
	}

	const duplicatePatternSignatures = await knex(table)
		.select('matcher_signature')
		.where('is_active', true)
		.where('match', 'pattern')
		.groupBy('matcher_signature')
		.havingRaw('COUNT(*) > 1')
		.limit(10)

	if (duplicatePatternSignatures.length > 0) {
		throw new Error(
			`Sluggernaut redirect integrity migration found equivalent active pattern redirects in "${table}". Repair these rows before applying the migration.`,
		)
	}
}

/**
 * Creates partial unique indexes on PostgreSQL and SQLite.
 *
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @param {string} table - Redirect table name.
 * @returns {Promise<void>} Resolves after both indexes exist.
 */
async function createPartialIndexes(knex, table) {
	// PostgreSQL does not allow bind parameters in an index predicate. Keep identifiers bound
	// through Knex, but use SQL literals for the invariant's fixed values.
	await knex.raw("CREATE UNIQUE INDEX ?? ON ?? (??) WHERE ?? = TRUE AND ?? = 'exact'", [
		EXACT_INDEX,
		table,
		'origin',
		'is_active',
		'match',
	])
	await knex.raw("CREATE UNIQUE INDEX ?? ON ?? (??) WHERE ?? = TRUE AND ?? = 'pattern'", [
		PATTERN_INDEX,
		table,
		'matcher_signature',
		'is_active',
		'match',
	])
}

/**
 * Creates nullable generated columns and unique indexes for MySQL, which has no partial indexes.
 *
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @param {string} table - Redirect table name.
 * @returns {Promise<void>} Resolves after both columns and indexes exist.
 */
async function createMysqlGeneratedColumnsAndIndexes(knex, table) {
	await knex.raw(
		"ALTER TABLE ?? ADD COLUMN ?? VARCHAR(255) GENERATED ALWAYS AS (CASE WHEN ?? = 1 AND ?? = 'exact' THEN ?? ELSE NULL END) STORED",
		[table, MYSQL_EXACT_COLUMN, 'is_active', 'match', 'origin'],
	)
	await knex.raw(
		"ALTER TABLE ?? ADD COLUMN ?? VARCHAR(512) GENERATED ALWAYS AS (CASE WHEN ?? = 1 AND ?? = 'pattern' THEN ?? ELSE NULL END) STORED",
		[table, MYSQL_PATTERN_COLUMN, 'is_active', 'match', 'matcher_signature'],
	)
	await knex.raw('CREATE UNIQUE INDEX ?? ON ?? (??)', [EXACT_INDEX, table, MYSQL_EXACT_COLUMN])
	await knex.raw('CREATE UNIQUE INDEX ?? ON ?? (??)', [
		PATTERN_INDEX,
		table,
		MYSQL_PATTERN_COLUMN,
	])
}

/**
 * Drops an index using syntax shared by PostgreSQL and SQLite.
 *
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @param {string} index - Index name.
 * @returns {Promise<void>} Resolves after the index is removed.
 */
async function dropIndex(knex, index) {
	await knex.raw('DROP INDEX ??', [index])
}

/**
 * Drops a MySQL index belonging to a table.
 *
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @param {string} table - Redirect table name.
 * @param {string} index - Index name.
 * @returns {Promise<void>} Resolves after the index is removed.
 */
async function dropMysqlIndex(knex, table, index) {
	await knex.raw('DROP INDEX ?? ON ??', [index, table])
}

/**
 * Drops a generated MySQL helper column.
 *
 * @param {import('knex').Knex} knex - Directus's database query builder.
 * @param {string} table - Redirect table name.
 * @param {string} column - Generated column name.
 * @returns {Promise<void>} Resolves after the column is removed.
 */
async function dropMysqlColumn(knex, table, column) {
	await knex.raw('ALTER TABLE ?? DROP COLUMN ??', [table, column])
}
