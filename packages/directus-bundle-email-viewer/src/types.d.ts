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

export type EmailViewerPermission = {
    userId: string
    userEmail: string
    canViewOwnEmail: boolean
    canViewDomainEmail: boolean
    canViewAllEmail: boolean
    canViewAddresses: string[]
}

export interface Policy {
    id: string;
    custom_addresses: string[];
    email_viewer_permission: 'own' | 'domain' | 'all' | 'specific' | 'none';
}