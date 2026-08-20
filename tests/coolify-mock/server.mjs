import { createServer } from 'node:http'

const applicationUuid = 'e2e-coolify-application'
const deployments = new Map()

const application = {
	uuid: applicationUuid,
	name: 'E2E Coolify application',
	fqdn: 'https://e2e.example.com',
	status: 'running',
	environment_uuid: 'e2e-environment',
	environment_name: 'production',
	project_uuid: 'e2e-project',
	project_name: 'E2E project',
	git_branch: 'main',
	git_commit_sha: 'e2e-commit',
	git_repository: 'onderwijsin/e2e',
	build_pack: 'nixpacks',
	destination: { server: { name: 'e2e-server' } },
}

/**
 * @param {import('node:http').ServerResponse} response - HTTP response.
 * @param {number} status - HTTP status.
 * @param {unknown} body - JSON response body.
 * @returns {void}
 */
const json = (response, status, body) => {
	// oxlint-disable-next-line typescript/no-unsafe-call
	response.writeHead(status, { 'Content-Type': 'application/json' })
	// oxlint-disable-next-line typescript/no-unsafe-call
	response.end(JSON.stringify(body))
}

const server = createServer((request, response) => {
	const url = new URL(request.url ?? '/', 'http://localhost')
	const pathParts = url.pathname.split('/')
	const deploymentUuid = pathParts.at(-1) === 'cancel' ? pathParts.at(-2) : pathParts.at(-1)

	if (request.method === 'GET' && url.pathname === `/api/v1/applications/${applicationUuid}`) {
		json(response, 200, application)
		return
	}

	if (
		request.method === 'GET' &&
		url.pathname === `/api/v1/deployments/applications/${applicationUuid}`
	) {
		json(response, 200, { count: deployments.size, deployments: [...deployments.values()] })
		return
	}

	if (request.method === 'GET' && url.pathname === `/api/v1/deployments/${deploymentUuid}`) {
		const deployment = deployments.get(deploymentUuid)
		json(response, deployment ? 200 : 404, deployment ?? { message: 'Not found' })
		return
	}

	if (request.method === 'POST' && url.pathname === '/api/v1/deploy') {
		const deployment = {
			application_id: applicationUuid,
			deployment_uuid: 'e2e-deployment-1',
			status: 'running',
			created_at: '2026-08-20T10:00:00.000Z',
			updated_at: '2026-08-20T10:00:00.000Z',
			commit: 'e2e-commit',
			commit_message: 'E2E deployment',
			deployment_url: '/deployments/e2e-deployment-1',
		}
		deployments.set(deployment.deployment_uuid, deployment)
		json(response, 200, {
			deployments: [
				{
					message: 'Deployment queued',
					resource_uuid: applicationUuid,
					deployment_uuid: deployment.deployment_uuid,
				},
			],
		})
		return
	}

	if (request.method === 'POST' && url.pathname.endsWith('/cancel')) {
		json(response, 200, {
			message: 'Deployment cancelled successfully.',
			deployment_uuid: deploymentUuid,
			status: 'cancelled-by-user',
		})
		return
	}

	json(response, 404, { message: 'Not found' })
})

server.listen(3000, '0.0.0.0')
