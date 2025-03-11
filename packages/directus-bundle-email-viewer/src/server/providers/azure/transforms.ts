import type { Message, User as MsUser } from "@microsoft/microsoft-graph-types";
import type { Email, User } from "../../../types";

export const formatEmailData = (emails: Message[]): Email[] => {
	return emails.map((email) => {
		const { id, sentDateTime, hasAttachments, subject, bodyPreview, body, categories, isRead, webLink, from, toRecipients, ccRecipients, bccRecipients } = email;

		return {
			id,
			sentDateTime,
			hasAttachments: hasAttachments || !!hasAttachments,
			subject: subject || "",
			bodyPreview: bodyPreview || "",
			categories,
			body: body || null,
			isRead: !!isRead,
			webLink,
			from,
			toRecipients: toRecipients || null,
			ccRecipients: ccRecipients || null,
			bccRecipients: bccRecipients || null
		};
	}).filter((email) => !!email.id && !!email.sentDateTime && !!email.from?.emailAddress?.address && !!email.toRecipients?.length) as Email[];
};

export const formatUserData = (users: MsUser[]): User[] => {
	return users.map((user): User => {
		return {
			id: user.id as string,
			displayName: user.displayName as string,
			email: user.userPrincipalName as string,
			givenName: user.givenName || null,
			surname: user.surname || null
		};
	});
};
