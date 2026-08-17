import { z } from 'zod'

import { statuses, components } from './constants'

const statusSchema = z.enum(statuses).catch('error')

// Extend with 'unknown' so the .catch default matches the output type
const componentSchema = z.union([z.enum(components)]).catch('unknown')

export const checkResultSchema = z.object({
	status: statusSchema,
	componentType: componentSchema, // avoids .or(z.string()) while not failing on new values
	observedUnit: z.string().optional(),
	observedValue: z.number().optional(),
	threshold: z.number().optional(),
	output: z.record(z.string(), z.any()).optional(),
})

export const serverHealthSchema = z.object({
	status: statusSchema,
	releaseId: z.string(),
	serviceId: z.string(),
	checks: z.record(z.string(), z.array(checkResultSchema)),
})
