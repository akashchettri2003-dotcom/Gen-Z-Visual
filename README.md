# Gen-visual (RC Visual) — Production-ready foundation

This version uses:
- Node.js + Express backend
- PostgreSQL database through Prisma
- Secure password hashing with bcrypt
- HTTP-only signed session cookie
- Rate limiting + Helmet
- Creator/reader roles
- Stories + chapters
- Free and paid content access
- Razorpay order creation + server-side signature verification
- Render deployment configuration

## Important before going live

You still need to create your own accounts with Render/PostgreSQL and Razorpay and put their secrets into Render Environment Variables. Never paste API secrets into GitHub.

### Render deployment

1. Upload this whole project to a GitHub repository.
2. In Render choose **New → Web Service** and connect the repository.
3. Build command: `npm install && npx prisma generate`
4. Start command: `npx prisma db push && node server.js`
5. Create a Render PostgreSQL database and put its connection string into `DATABASE_URL`.
6. Add:
   - `JWT_SECRET` — a long random secret (32+ characters)
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
7. Deploy.

Render supports Node/Express web services and PostgreSQL. Environment variables are intended for secrets, so keep them out of GitHub.

### Razorpay

Use Razorpay Test Mode first. The server creates an order and verifies the returned payment signature before marking a purchase paid. Replace test keys with live keys only after you have completed your merchant/onboarding requirements.

### Creator workflow

1. Register with "I want to publish as a creator".
2. Create a story from Creator Dashboard.
3. Add chapters using the API:
   `POST /api/stories/:id/chapters`
4. Publish using:
   `POST /api/stories/:id/publish`

For a polished production product, add an admin dashboard, object storage for comic images/covers, email verification/password reset, moderation, legal pages, backups, and Razorpay webhooks before public launch.

## Local testing

Requirements: Node 20+ and a PostgreSQL database.

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` and `JWT_SECRET`.
3. Run `npm install`.
4. Run `npx prisma generate`.
5. Run `npx prisma db push`.
6. Run `npm start`.
7. Open `http://localhost:10000`.

Do not use real payment keys while testing locally unless you know you are using the correct test environment.
