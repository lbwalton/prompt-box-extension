# Google OAuth setup for Prompt Box Pro

Done once by LB. Enables "Sign in with Google" in the extension.

## 1. Google Cloud OAuth client
1. https://console.cloud.google.com → create/select a project "Prompt Box".
2. APIs & Services → OAuth consent screen → External → app name "Prompt Box",
   support email lbwalton@gmail.com, add scopes: email, profile, openid. Add yourself as a test user.
3. APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
   - Authorized redirect URI: https://jmxmtiqkpegqywderwkt.supabase.co/auth/v1/callback
4. Copy the Client ID and Client secret.

## 2. Supabase Google provider
1. https://supabase.com/dashboard/project/jmxmtiqkpegqywderwkt/auth/providers → Google → enable.
2. Paste the Client ID and Client secret. Save.

## 3. Allowed redirect URLs (Supabase Auth → URL Configuration)
Add these to the allow list:
- https://aaecghoccdpphfkmnpakjdgpanlgijcc.chromiumapp.org/   (production extension)
- https://<your-unpacked-dev-id>.chromiumapp.org/             (dev, from chrome://extensions)

## 4. Verify
Once the extension code lands, "Sign in with Google" should complete and return to the extension.
