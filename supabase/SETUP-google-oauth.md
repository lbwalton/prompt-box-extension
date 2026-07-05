# Google OAuth setup for Prompt Box Pro

Done once by LB. Enables "Sign in with Google" in the extension.

## 1. Google Cloud OAuth client
1. https://console.cloud.google.com → create/select a project "Prompt Box".
2. APIs & Services → OAuth consent screen → User type: External → app name "Prompt Box",
   support email lbwalton@gmail.com.
3. Scopes → "Add or remove scopes" → add exactly these three NON-SENSITIVE scopes (search "userinfo"):
   - openid
   - https://www.googleapis.com/auth/userinfo.email    (".../auth/userinfo.email")
   - https://www.googleapis.com/auth/userinfo.profile  (".../auth/userinfo.profile")
   Do NOT add any sensitive/restricted scopes (no Gmail, Drive, Calendar). Non-sensitive scopes
   need no Google verification review for sign-in to work.
4. Test users → add lbwalton@gmail.com (while status is "Testing", only listed users can sign in).
   Click "Publish app" later to lift the 100-user test cap for real customers; no review is required
   for these non-sensitive scopes.
5. APIs & Services → Credentials → Create credentials → OAuth client ID → Application type: Web application
   (NOT "Chrome extension" — Supabase is the OAuth intermediary, so Google redirects to Supabase's callback).
   - Authorized redirect URI: https://jmxmtiqkpegqywderwkt.supabase.co/auth/v1/callback
6. Copy the Client ID and Client secret (entered only into Supabase in step 2 below; never into this repo).

## 2. Supabase Google provider
1. https://supabase.com/dashboard/project/jmxmtiqkpegqywderwkt/auth/providers → Google → enable.
2. Paste the Client ID and Client secret. Save.

## 3. Allowed redirect URLs (Supabase Auth → URL Configuration)
Add these to the allow list:
- https://aaecghoccdpphfkmnpakjdgpanlgijcc.chromiumapp.org/   (production extension)
- https://<your-unpacked-dev-id>.chromiumapp.org/             (dev, from chrome://extensions)

## 4. Verify
Once the extension code lands, "Sign in with Google" should complete and return to the extension.
