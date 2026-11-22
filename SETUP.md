# Tea Craft: owner login, database and payments (setup guide)

## Status: what is already done
- Supabase project **Tea Craft** (Sydney) exists and the database is set up: tables, security rules, the starting menu (8 drinks, Large size, 3 toppings) and the photo storage bucket.
- `assets/config.js` already holds the project URL and public key.

## What is left (about 5 minutes)
1. In Supabase open the Tea Craft project > *Authentication* > *Users* > *Add user* > *Create new user*: email `teacraftnz@gmail.com`, a strong password you choose, tick *Auto Confirm User*.
2. Make that account an admin: *SQL Editor* > run
   `insert into public.admins (user_id) select id from auth.users where email = 'teacraftnz@gmail.com';`
3. *Authentication* > *Sign In / Providers*: switch **off** "Allow new users to sign up".
4. *Authentication* > *URL Configuration*: set *Site URL* to `https://teacraft.co.nz` and add `https://teacraft.co.nz/admin.html` as a Redirect URL (needed for "Forgot your password?").
5. Upload this whole folder to Cloudflare again (replace the live files).
6. Open `https://teacraft.co.nz/admin.html`, sign in, change a price, then place a test order on the website with card `4242 4242 4242 4242`.

The long guide below is still correct for anyone setting up a brand new project from scratch.

---
What you get
- `admin.html`: the owner signs in at **https://teacraft.co.nz/admin.html** to add or edit teas, change prices, mark things sold out, upload photos, update opening hours/contact details/announcement banner, and see orders, bookings and newsletter sign-ups.
- A Supabase database behind the website (menu, prices, orders, bookings, sign-ups, shop info).
- A **test-mode** card payment screen that behaves like Stripe, ready to be swapped for real Stripe.

Until the steps below are done, the website keeps working with its built-in menu and the admin page shows a "connect Supabase" message.

## One-time setup (about 15 minutes)

1. **Create the project.** Go to supabase.com, sign up, click *New project*. Name it `tea-craft`, choose a strong database password (save it somewhere safe), and pick the region closest to New Zealand (Sydney).
2. **Create the tables.** In Supabase open *SQL Editor* > *New query*, paste the whole of `supabase/schema.sql`, click *Run*. You should see "Success". (It's safe to run twice.) This also adds today's 8 drinks, the Large size and 3 toppings.
3. **Connect the website.** In Supabase open *Project Settings* > *API*. Copy the **Project URL** and the **anon public** key into `assets/config.js`. Never use the `service_role` key anywhere in the website files.
4. **Create the owner's login.** *Authentication* > *Users* > *Add user* > *Create new user*: email `teacraftnz@gmail.com`, a strong password, tick *Auto Confirm User*.
   Then in *Authentication* > *Sign In / Providers* switch **off** "Allow new users to sign up" so nobody else can create accounts.
   In *Authentication* > *URL Configuration* set *Site URL* to `https://teacraft.co.nz` and add `https://teacraft.co.nz/admin.html` as a Redirect URL (this makes "Forgot your password?" work).
5. **Make that account an admin.** Back in *SQL Editor* run:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'teacraftnz@gmail.com';
   ```
6. **Upload the site to Cloudflare** (the whole folder, including `admin.html`, `assets/` and `supabase/` is fine, the `supabase/` folder is not used by the website).
7. **Try it.** Open `/admin.html`, sign in, change a price, then refresh the website. Place a test order with card `4242 4242 4242 4242` (any future date, any 3 digits) and watch it appear under *Orders*.

## How the owner uses it
- **Orders:** new orders show a red number on the Orders tab. Press *Start making*, *Mark ready*, *Picked up*. Orders paid at the counter can be marked as paid.
- **Menu:** change a price by typing in the price box. *In stock* off = shows "Sold out". *Visible* off = hidden from the website. Arrows reorder. *Add a new tea* takes a name, price, description, category and a photo (it is resized automatically).
- **Sizes & toppings:** change what Large and each topping cost, or add new ones.
- **Shop info:** hours, address, phone, email, social links, announcement banner, pause online ordering, and the payments setting. Changes show on the website straight away.
- **Bookings / Newsletter:** requests from the booking form and sign-ups from the footer. Emails can be copied or downloaded as CSV.

## Payments: today and going live with Stripe
**Today (test mode):** customers choose "Pay now by card" or "Pay at the counter". Card payments use a Stripe-style form that only accepts test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined, `4000 0000 0000 9995` has insufficient funds. No money moves and only the last 4 digits are stored. The server works out prices itself, so prices can't be changed from a browser.

**When Stripe is ready:**
1. Create a Stripe account and get the publishable and secret keys.
2. Install the Supabase CLI and deploy `supabase/functions/create-payment-intent` and `supabase/functions/stripe-webhook` (comments at the top of each file list the exact commands and secrets). These are templates and have not been run against a live Stripe account, so test them in Stripe's test mode first.
3. Replace `stripePay()` in `assets/shop.js` with Stripe Elements: load Stripe.js, call `create-payment-intent`, show the card field and confirm the payment with the returned client secret. Order totals and "paid" status are already handled by the database and the webhook.
4. In admin > Shop info > Payments choose **Stripe**. That also switches the test payment function off automatically.

## Things to know
- **No automatic emails yet.** Customers see a confirmation on screen, and the owner sees new orders in the admin page (it checks every 20 seconds while open and puts a number in the tab title). Receipts and "new order" alerts to the owner's inbox can be added later, for example with a Supabase database webhook and an email service.
- **Spam:** forms use a hidden trap field. If junk bookings or orders ever appear, add Cloudflare Turnstile to the forms.
- **Free plan:** Supabase's free plan may pause a project that hasn't been used for a while; open the dashboard to resume it. A paid plan avoids that and is worth it once real orders flow.
- **Password reset emails:** Supabase's built-in email sender is limited and meant for testing. Add your own email sending (SMTP) in *Authentication* settings for reliable resets.
- **Search listing:** opening hours in the Google structured data in `index.html` are fixed text. If hours change, update the `openingHours` line too.
