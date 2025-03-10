export enum Provider {
    Azure = 'azure'
}

type EmailAddress = { emailAddress: { address: string, name: string } }
export interface Email {
    id: string;
    sentDateTime: string;
    hasAttachments: boolean;
    subject: string;
    bodyPreview: string;
    isRead: boolean;
    webLink?: string;
    from: EmailAddress;
    toRecipients: EmailAddress[];
    ccRecipients: EmailAddress[];
    bccRecipients: EmailAddress[];
}

export interface User {
    id: string
    displayName: string
    email: string
    givenName: string | null
    surname: string | null
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