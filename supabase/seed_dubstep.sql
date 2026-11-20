-- Dubstep sources: labels (UKF Dubstep, Circus, Deadbeats...) and artists (Zeds Dead, Oliverse...). Run in the Supabase SQL Editor AFTER add_dubstep.sql. Safe to run twice.
-- The @handles are guesses made from each name. On a source's first scan the app checks that the channel's real name matches the name here;
-- if it doesn't, it searches YouTube for a channel with exactly that name. If it still finds no match it reports ok:false and skips that source,
-- so a wrong guess never fills the site with someone else's videos. Artists have is_artist = true (uploads titled with just the song name get the artist filled in).
insert into sources (name, kind, url, platform_id, monitorable, genre, is_artist) values
 ('UKF Dubstep', 'youtube', 'https://www.youtube.com/@UKFDubstep', null, 'auto', 'dubstep', false),
 ('Circus Records', 'youtube', 'https://www.youtube.com/@CircusRecords', null, 'auto', 'dubstep', false),
 ('Deadbeats', 'youtube', 'https://www.youtube.com/@Deadbeats', null, 'auto', 'dubstep', false),
 ('Never Say Die', 'youtube', 'https://www.youtube.com/@NeverSayDie', null, 'auto', 'dubstep', false),
 ('Disciple Recordings', 'youtube', 'https://www.youtube.com/@DiscipleRecordings', null, 'auto', 'dubstep', false),
 ('Cyclops Recordings', 'youtube', 'https://www.youtube.com/@CyclopsRecordings', null, 'auto', 'dubstep', false),
 ('OWSLA', 'youtube', 'https://www.youtube.com/@OWSLA', null, 'auto', 'dubstep', false),
 ('Bassrush', 'youtube', 'https://www.youtube.com/@Bassrush', null, 'auto', 'dubstep', false),
 ('Zeds Dead', 'youtube', 'https://www.youtube.com/@ZedsDead', null, 'auto', 'dubstep', true),
 ('Oliverse', 'youtube', 'https://www.youtube.com/@Oliverse', null, 'auto', 'dubstep', true),
 ('Excision', 'youtube', 'https://www.youtube.com/@Excision', null, 'auto', 'dubstep', true),
 ('Subtronics', 'youtube', 'https://www.youtube.com/@Subtronics', null, 'auto', 'dubstep', true),
 ('Virtual Riot', 'youtube', 'https://www.youtube.com/@VirtualRiot', null, 'auto', 'dubstep', true),
 ('Flux Pavilion', 'youtube', 'https://www.youtube.com/@FluxPavilion', null, 'auto', 'dubstep', true),
 ('Doctor P', 'youtube', 'https://www.youtube.com/@DoctorP', null, 'auto', 'dubstep', true),
 ('Svdden Death', 'youtube', 'https://www.youtube.com/@SvddenDeath', null, 'auto', 'dubstep', true),
 ('Wooli', 'youtube', 'https://www.youtube.com/@Wooli', null, 'auto', 'dubstep', true),
 ('Sullivan King', 'youtube', 'https://www.youtube.com/@SullivanKing', null, 'auto', 'dubstep', true),
 ('Barely Alive', 'youtube', 'https://www.youtube.com/@BarelyAlive', null, 'auto', 'dubstep', true),
 ('12th Planet', 'youtube', 'https://www.youtube.com/@12thPlanet', null, 'auto', 'dubstep', true),
 ('Kill The Noise', 'youtube', 'https://www.youtube.com/@KillTheNoise', null, 'auto', 'dubstep', true),
 ('Ganja White Night', 'youtube', 'https://www.youtube.com/@GanjaWhiteNight', null, 'auto', 'dubstep', true),
 ('Space Laces', 'youtube', 'https://www.youtube.com/@SpaceLaces', null, 'auto', 'dubstep', true),
 ('Rusko', 'youtube', 'https://www.youtube.com/@Rusko', null, 'auto', 'dubstep', true),
 ('Skream', 'youtube', 'https://www.youtube.com/@Skream', null, 'auto', 'dubstep', true),
 ('Benga', 'youtube', 'https://www.youtube.com/@Benga', null, 'auto', 'dubstep', true),
 ('Caspa', 'youtube', 'https://www.youtube.com/@Caspa', null, 'auto', 'dubstep', true),
 ('Skrillex', 'youtube', 'https://www.youtube.com/@Skrillex', null, 'auto', 'dubstep', true)
on conflict (url) do nothing;

notify pgrst, 'reload schema';
