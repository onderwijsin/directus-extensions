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

