# Sign-in setup: Apple, Google, emailed codes

The app signs people in through one identifier-first screen (`SignInScreen`):
**Continue with Apple**, **Continue with Google**, or an email address that gets a
six-digit code (`EmailCodeScreen`). Accounts that still have a password can tap
"Use password instead" (`PasswordScreen`). There is no separate sign-up or
forgot-password screen: an unknown email gets an account when its first code is
verified, and the code is the recovery path.

The client code is complete and ships dormant until the services below are
configured. Every provider button hides itself when its prerequisite is missing,
so a build with none of this set up still signs people in by email code, and an
OTA carrying this JS is safe on binaries that do not link the native modules.

## What needs a new App Store build

`expo-apple-authentication`, `@react-native-google-signin/google-signin` and
`react-native-svg` are native modules, and `app.json` now sets
`ios.usesAppleSignIn`. None of that reaches a phone over the air. Build and
submit a new binary (`eas build --profile production --auto-submit`) before
announcing Apple or Google sign-in; the email-code path works on any binary once
the Supabase side is done.

## 1. Emailed codes (do this first, it is the path everyone gets)

1. **Custom SMTP.** Supabase → Project Settings → Authentication → SMTP Settings.
   Point it at Resend, Postmark or similar. The built-in mailer allows roughly two
   emails per hour for the whole project, which breaks on the first day.
2. **Templates — TWO of them.** Authentication → Emails → Templates. Supabase
   sends **Magic Link** to an address it already knows and **Confirm signup** to a
   new one, and `signInWithOtp` with `shouldCreateUser` hits both paths. Put the
   same body in both, replacing the `{{ .ConfirmationURL }}` link with the code.
   The production-ready HTML (brand chip, code box, footer) is versioned at
   [`docs/email-templates/sign-in-code.html`](./email-templates/sign-in-code.html);
   the minimal form is:

   ```html
   <h2>Your Jim sign-in code</h2>
   <p>Enter this code in the app. It expires in one hour.</p>
   <p style="font-size: 28px; letter-spacing: 4px;"><strong>{{ .Token }}</strong></p>
   <p>If you did not ask for this, you can ignore this email.</p>
   ```

   The app calls `signInWithOtp` then `verifyOtp({ type: 'email' })`; it never
   opens a link, so the template must carry `{{ .Token }}`.
3. **Sign-ups.** Authentication → Providers → Email: keep "Enable email provider"
   on and "Allow new users to sign up" on (the code flow creates accounts). Leave
   "Confirm email" off for the beta; the code itself proves inbox ownership, so
   re-enabling it later changes nothing in this flow.
4. **Rate limits.** Authentication → Rate Limits: the per-address limit is one
   code every 60 s (the app's resend countdown matches). Raise the hourly email
   cap once custom SMTP is in.

## 2. Sign in with Apple

Apple side (developer.apple.com → Certificates, Identifiers & Profiles):

1. Identifiers → App IDs → `com.jimapp.app` → enable **Sign In with Apple**.
2. Nothing else is needed for the native flow: the app uses
   `AppleAuthentication.signInAsync` and hands the identity token to Supabase.
   A Services ID + key are only needed if web sign-in is ever added.

Supabase side: Authentication → Providers → **Apple** → enable, and put the
bundle id `com.jimapp.app` in **Client IDs**. For local development in Expo Go
add `host.exp.Exponent` too (Apple sign-in works in Expo Go on iOS; Google does not).

Behaviour to know:

- Apple sends the person's name **once**, on the first authorization. The app
  stores it as `user_metadata.full_name` immediately (`AuthContext.signInWithProvider`).
  To test the first-run path again, revoke the app under Settings → Apple ID →
  Sign-In & Security → Sign in with Apple.
- **Hide My Email** yields a `@privaterelay.appleid.com` address. Supabase links
  identities only on an exact verified email match, so a person who signed up
  with `dylan@example.com` and then uses Apple with a relay address gets a
  **second account**. `lib/authIdentity.ts` keeps relay hashes out of greetings and
  the Profile identity row; account deletion is gated on the session, not on an
  email.
- App Store 5.1.1(v): deletion must also revoke the Apple token. The backend
  `DELETE /users/me` deletes the Supabase auth user (needs
  `SUPABASE_SERVICE_ROLE_KEY` on Render); Supabase revokes the Apple identity as
  part of that.

## 3. Google

Google Cloud console → APIs & Services → Credentials, one project:

1. Configure the OAuth consent screen (external, the app name and support email).
2. Create an OAuth client id of type **Web application**. Its client id is
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Supabase verifies the native id token
   against this id, so it is the one that gates the button.
3. Create an OAuth client id of type **iOS** with bundle id `com.jimapp.app`. Its
   client id is `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`; the same page shows the
   **iOS URL scheme** (`com.googleusercontent.apps.…`), which is
   `GOOGLE_IOS_URL_SCHEME` — a build-time value that `app.config.js` feeds to the
   config plugin. Without it the plugin is skipped and the native sheet cannot
   return to the app.
4. (Android, later) an **Android** client id with the package name and the
   SHA-1 of the EAS signing key (`eas credentials`).

Supabase side: Authentication → Providers → **Google** → enable, paste the web
client id (and secret), and add the iOS client id under **Authorized Client IDs**
so tokens minted for the iOS client verify.

Put all three values in `eas.json` build profiles / EAS secrets, not only in a
local `.env`, because `eas update` bakes whatever the publishing machine has.

## Where the code lives

| Piece | File |
|---|---|
| Native module loaders (guarded `require`, availability checks) | `frontend/src/lib/authProviders.ts` |
| Pure helpers + tests (relay emails, name capture, code parsing, copy) | `frontend/src/lib/authIdentity.ts`, `authIdentity.test.ts` |
| Auth calls (`sendEmailCode`, `verifyEmailCode`, `signInWithProvider`, `signIn`, `hasSignedInBefore`) | `frontend/src/contexts/AuthContext.tsx` |
| Screens | `frontend/src/screens/WelcomeScreen.tsx`, `SignInScreen.tsx`, `EmailCodeScreen.tsx`, `PasswordScreen.tsx` |
| Shared pieces | `components/AuthHero.tsx`, `AuthSheet.tsx`, `SignInButtons.tsx`, `CodeInput.tsx` |
| Stack + first-route rule | `frontend/App.tsx` (`AuthStack`), `types/navigation.ts` (`AuthStackParamList`) |

The legacy password-recovery deep link (`jimapp://auth/reset` →
`SetNewPasswordScreen`) still works for links already in inboxes; nothing in the
app sends new ones.
