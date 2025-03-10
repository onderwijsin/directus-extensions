import type { Accountability } from "@directus/types";
import type { EmailViewerPermission } from "./types";

declare global {
	namespace Express {
		interface Request {
			accountability: Accountability;
			emailViewerPermissions: EmailViewerPermission;
		}
	}
}
