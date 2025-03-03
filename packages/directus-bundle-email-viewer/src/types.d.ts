type EmailAddress = { emailAddress: { address: string, name: string } }
interface Email {
    id: string;
    createdDateTime: string;
    categories: string[];
    sentDateTime: string;
    hasAttachments: boolean;
    internetMessageId: string;
    subject: string;
    bodyPreview: string;
    isRead: boolean;
    webLink: string;
    sender: EmailAddress;
    from: EmailAddress;
    toRecipients: EmailAddress[];
    ccRecipients: EmailAddress[];
    bccRecipients: EmailAddress[];
}