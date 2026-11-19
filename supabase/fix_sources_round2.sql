-- Run in the Supabase SQL Editor. Safe to run twice.
-- "Blackout Music NL" points at the channel called "Blackout Music", which is already its own source, so the NL row only duplicates it.
delete from sources where name = 'Blackout Music NL';

-- Channels whose handle guess landed on someone else's channel and that a name search could not find.
-- Switched off so they stop reporting errors. Turn one back on after you set its real url (see the README for the one-line command).
update sources set enabled = false where name in ('Bassdrive', 'Celsius Recordings', 'Delta9 Recordings', 'RaveBrains');

notify pgrst, 'reload schema';
