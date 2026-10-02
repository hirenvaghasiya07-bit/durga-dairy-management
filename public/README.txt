DURGA DAIRY MANAGEMENT SYSTEM - V4 CORE BUILD

This build updates the existing V3 prototype without implementing the future Customer billing/WhatsApp module.

IMPLEMENTED CORE DIRECTION
- Online-first architecture with a central API sync layer.
- PWA with service-worker auto-update (new web assets replace old cached assets automatically).
- Mobile + desktop responsive UI.
- Hiren Owner + Brother Full Access Member.
- Named users, roles, audit trail.
- Login + forgot-password integration point.
- Local fallback so the app remains usable when the API is not configured.
- Monthly report/export and Drive-ready folder structure.
- Date display uses DD-MM-YYYY where formatted by the app.

RUN LOCALLY
1. Install Node 20+.
2. From this folder run: node server.mjs
3. Open http://localhost:8080 in Chrome.

ONLINE DEPLOYMENT
Set DURGA_SESSION_SECRET to a strong random secret and deploy the folder to an HTTPS Node host.
Set config.js: window.DURGA_CONFIG={apiBase:'https://YOUR-DOMAIN'};

GOOGLE DRIVE
The Drive folder/file automation is intentionally not claimed as live because Google OAuth credentials are required. The production server should add Drive OAuth credentials and create: Google Drive / Dairy Farm / YEAR / MONTH / Month.xlsx.

APK
The web/PWA layer is ready for Android packaging. A signed APK still requires an Android packaging/signing environment (for example Capacitor + Android SDK) and should be generated after the production HTTPS API is configured.

FUTURE CUSTOMER MODULE
Do not implement the previously discussed date-wise customer monthly billing, WhatsApp, QR payment, ad/announcement messaging until the owner supplies the detailed workflow.
