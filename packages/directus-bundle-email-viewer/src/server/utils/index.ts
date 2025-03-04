import type { Accountability } from '@directus/types';
import { ApiExtensionContext } from '@directus/extensions'
import type { UsersService } from '@directus/api/dist/services';
import type { EmailViewerPermission, Policy } from '../../types';
import { ForbiddenError } from '@directus/errors';
import NodeCache from 'node-cache';



const permissionsCache = new NodeCache({ stdTTL: 60 * 60 * 4 });
export const getEmailViewerPermissions = async (accountability: Accountability, context: ApiExtensionContext) => {
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
            if (policy.email_viewer_permission === 'specific' && !!policy.custom_addresses.length) {
                acc.push(...policy.custom_addresses);
            }
            return acc;
        }, [])))
    }

    permissionsCache.set(accountability.user, permissions);


    return permissions;
}