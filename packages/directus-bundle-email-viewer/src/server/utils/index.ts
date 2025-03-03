import type { SchemaOverview, FieldRaw, Accountability } from '@directus/types';
import type { FieldsService, UsersService } from '@directus/api/dist/services';
import type { EmailViewerPermission, Policy } from '../../types.d';
import { ForbiddenError } from '@directus/errors';
import NodeCache from 'node-cache';



interface Services {
    FieldsService: typeof FieldsService;
    [key: string]: any;
}

interface Context {
    services: Services;
    getSchema: () => Promise<SchemaOverview>;
}

/**
 * Creates missing fields in the provided collection based on the provided schema.
 * @param collection - The collection name where the fields should be created.
 * @param fieldSchema - The schema of the fields that should be created.
 * @param context - The context object containing services and schema getter.
 */
export const createFieldsInCollection = async (
    collection: string, 
    fieldSchema: FieldRaw[],
    context: Context
): Promise<void> => {
    const { services, getSchema } = context;
    const { FieldsService } = services;

    const fieldsService: FieldsService = new FieldsService({
        schema: await getSchema(),
    });
    

    try {
        const existingFields = await fieldsService.readAll(collection);

        const missingFields = fieldSchema.filter((field) => !existingFields.find((f) => f.field === field.field));

        for (const field of missingFields) {
            await fieldsService.createField(collection, field);
        }
    } catch (error) {
        console.log(`Something went wrong while creating the ${collection} fields`);
        console.log(error);
    }
};

const permissionsCache = new NodeCache({ stdTTL: 60 * 60 * 4 });
export const getEmailViewerPermissions = async (accountability: Accountability, context: Context) => {
    if (!accountability.user) throw new ForbiddenError(); 

    if (permissionsCache.has(accountability.user)) {
        return permissionsCache.get(accountability.user) as EmailViewerPermission;
    }
    const { services } = context;
    const { UsersService } = services;

    const usersService: UsersService = new UsersService({
        schema: await context.getSchema()
    });

    // Fetch both direct user and role policies
    const data = await usersService.readOne(accountability.user, {
		fields: [
            'email',
            'policies.policy.id',
            'policies.policy.custom_addresses',
            'policies.policy.email_viewer_permission',
            'role.policies.policy.id',
            'role.policies.policy.custom_addresses',
            'role.policies.policy.email_viewer_permission'
        ],
	});

    const policies = [
        ...new Map(
            [...data.policies.map((p: { policy: Policy}) => p.policy), ...data.role.policies.map((p: { policy: Policy}) => p.policy)].map((policy) => [policy.id, policy])
        ).values()
    ]

    const permissions: EmailViewerPermission = {
        userId: accountability.user,
        userEmail: data.email,
        canViewOwnEmail: policies.some((policy) => policy.email_viewer_permission === 'self'),
        canViewDomainEmail: policies.some((policy) => policy.email_viewer_permission === 'domain'),
        canViewAllEmail: policies.some((policy) => policy.email_viewer_permission === 'all'),
        canViewAddresses: Array.from(new Set(policies.reduce((acc, policy) => {
            if (policy.email_viewer_permission === 'specific') {
                acc.push(...policy.custom_addresses);
            }
            return acc;
        }, [])))
    }

    permissionsCache.set(accountability.user, permissions);


    return permissions;
}