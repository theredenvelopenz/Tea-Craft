# Features switched off for now (informative-only site)

Taken off the website: online ordering and the cart, card payments (test mode), booking requests, menu prices (hidden by default), and the customer reviews section.

What is kept here so they can come back:
- `shop.js`: the original storefront script (menu with prices, options pop-up, cart, order form, payment pop-up, booking form).
- `removed-sections.html`: the HTML that was removed (booking section, cart / options / payment overlays, nav order button).
- `admin-full.js`: the original admin page script with Orders, Sizes & toppings and Bookings tabs.
- `privacy-with-sales.html`, `terms-of-sale.html`: the earlier privacy and terms pages that covered orders and bookings.

To bring prices back (no code needed): Admin > Shop info > "Show prices on the website menu".

To bring ordering or bookings back (needs a developer or another request to Claude):
1. Put the removed HTML back into `index.html`, switch `assets/public.js` back to `shop.js`, and restore `admin-full.js` as `assets/admin.js`.
2. In Supabase, re-allow the actions: `grant execute on function public.create_order(text,text,text,text,text,jsonb,text), public.mock_pay_order(uuid,text), public.get_order(uuid), public.create_booking(text,text,text,text,date,text,text,text) to anon, authenticated;`
3. Set Site info: ordering_enabled = true and payments_mode = 'in_store' (or 'mock' for test cards; 'stripe' only after Stripe is connected).
4. Update the privacy statement and terms first (use the earlier versions here as a starting point).
