-- Run ONCE in the Supabase SQL Editor. Turns on the ADD + button for your account.
-- 1) Replace the email below with the one you sign in to the site with. 2) Run it. 3) Sign out and back in on the site.
insert into profiles (id, is_admin)
select id, true from auth.users where email = 'YOUR-EMAIL@example.com'
on conflict (id) do update set is_admin = true;

-- Check it worked: should return one row with is_admin = true.
select u.email, p.is_admin from profiles p join auth.users u on u.id = p.id where p.is_admin;
