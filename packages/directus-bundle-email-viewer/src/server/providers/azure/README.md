
### Step 1: Register Your Application in Entra AD (Azure Active Directory)

1. Sign in to the Azure portal: Go to [https://portal.azure.com](https://portal.azure.com) and sign in with your organizational account.
2. Register a new application:
    - Navigate to Entra Admin Centre (formerly "Azure Active Directory") -> "App registrations" -> "New registration".
    - Provide a name for your application (e.g., "Directus Email Viewer Service").
    - Set the "Supported account types" to "Accounts in this organizational directory only".
    - Set the "Redirect URI" to your application's endpoint (e.g., `https://yourapp.com/server/email-viewer/auth/callback`).
    - Click "Register".

### Step 2: Configure API Permissions

1. Navigate to API permissions:
    - In your registered application, go to "API permissions" -> "Add a permission".
    - Select "Microsoft Graph".
    - Choose "Delegated permissions".
    - Add the following permissions:
        - `Mail.Read`
        - `Mail.Read.Shared`
        - `Mail.ReadWrite`
        - `Mail.ReadWrite.Shared`
        - `User.Read`
        - `User.Read.All`
        - `User-Mail.ReadWrite.All`
        - `Domain.Read.All`

2. Grant admin consent:
    - Click on "Grant admin consent for [Your Organization]" and confirm.

### Step 3: Set Up Client Credentials

1. Navigate to Certificates & secrets:
    - In your registered application, go to "Certificates & secrets".
    - Click on "New client secret".
    - Provide a description and set an expiration period.
    - Click "Add" and copy the generated secret value. Store it securely.
2. Add these environment variables to your Directus instance:
    - `EMAIL_VIEWER_PROVIDER="azure"`
    - `AZURE_CLIENT_SECRET="<the-secret-value>"`
    - `AZURE_CLIENT_ID="<the-secret-id>"`
    - `AZURE_TENANT_ID="<your-tenant-id>"` (can be found in the app registration overview page)
    - `AZURE_CLIENT_REDIRECT_URI="<https://yourapp.com/server/email-viewer/auth/callback>"`
  3. Restart your Directus instance