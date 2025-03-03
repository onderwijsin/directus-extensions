import { Provider } from "./types";

export interface Providers {
    [key in Provider]: {
        fetchEmails: (options: RequestOptions, env: EndpointExtensionContext["env"]) => Promise<{ value: Email[] }>
    }
}

export type RequestOptions = {
    email: string
    query?: string
    users?: string[]
    type?: 'sent' | 'received'
    limit?: number
    offset?: number
}

