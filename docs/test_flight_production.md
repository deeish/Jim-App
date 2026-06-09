Last steps to launch on test flight:


Step 5 — Create the App Store Connect app record

  - appstoreconnect.apple.com → Apps → ➕ New App → iOS, Bundle ID: com.jimapp.app, SKU (any, e.g.
  jim-app-001), primary language, and a name.
  - ⚠️ The store name must be globally unique — if "Jim App" is taken, pick a unique one (e.g.    
  "Jim — AI Workout Planner").
  Step 5 — Create the App Store Connect app record

  - appstoreconnect.apple.com → Apps → ➕ New App → iOS, Bundle ID: com.jimapp.app, SKU (any, e.g. jim-app-001), primary language, and a name.
  - ⚠️ The store name must be globally unique — if "Jim App" is taken, pick a unique one (e.g. "Jim — AI Workout Planner").

  Step 6 — Submit to TestFlight

  npx eas submit --platform ios --profile production
  - Use an App Store Connect API key when prompted (cleanest): ASC → Users and Access → Integrations → App Store Connect API → ➕ → role App Manager → download the .p8 once, note the Key ID + Issuer ID.
  EAS asks for these and uploads the build.

  Step 7 — TestFlight

  - Build goes Processing (~5–30 min). Export compliance is auto-handled (the flag we set).
  - TestFlight tab → Internal Testing → new group → add testers. Internal testers are people you invite under Users and Access (up to 100, no Apple review). They install the TestFlight app and redeem   
  the email invite.