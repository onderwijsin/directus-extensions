import { Accountability } from "@directus/types"
import { EmailViewerPermission } from "./types"

declare global {
    namespace Express {
        interface Request {
            accountability: Accountability
            emailViewerPermissions: EmailViewerPermission
        }
    }
}