-- More D&B record labels and channels. Run in the Supabase SQL Editor (safe to run twice).
-- The @handles are best guesses: none of these were checked against YouTube. After the next scan, any wrong one shows
-- ok:false with an error in the /api/ingest report and never blocks the others. Fix its URL (or delete it) in Table Editor -> sources.
insert into sources (name, kind, url, platform_id, monitorable) values
 ('Metalheadz',            'youtube', 'https://www.youtube.com/@Metalheadz',            null, 'auto'),
 ('Viper Recordings',      'youtube', 'https://www.youtube.com/@ViperRecordings',       null, 'auto'),
 ('Samurai Music',         'youtube', 'https://www.youtube.com/@SamuraiMusic',          null, 'auto'),
 ('Technique Recordings',  'youtube', 'https://www.youtube.com/@TechniqueRecordings',   null, 'auto'),
 ('Blackout Music NL',     'youtube', 'https://www.youtube.com/@BlackoutMusicNL',       null, 'auto'),
 ('Fokuz Recordings',      'youtube', 'https://www.youtube.com/@FokuzRecordings',       null, 'auto'),
 ('Eatbrain',              'youtube', 'https://www.youtube.com/@Eatbrain',              null, 'auto'),
 ('Souped Up Records',     'youtube', 'https://www.youtube.com/@SoupedUpRecords',       null, 'auto'),
 ('Flexout Audio',         'youtube', 'https://www.youtube.com/@FlexoutAudio',          null, 'auto'),
 ('Symmetry Recordings',   'youtube', 'https://www.youtube.com/@SymmetryRecordings',    null, 'auto'),
 ('Dispatch Recordings',   'youtube', 'https://www.youtube.com/@DispatchRecordings',    null, 'auto'),
 ('Spearhead Records',     'youtube', 'https://www.youtube.com/@SpearheadRecords',      null, 'auto'),
 ('Mindtech Records',      'youtube', 'https://www.youtube.com/@MindtechRecords',       null, 'auto'),
 ('Bad Taste Recordings',  'youtube', 'https://www.youtube.com/@BadTasteRecordings',    null, 'auto'),
 ('Delta9 Recordings',     'youtube', 'https://www.youtube.com/@Delta9Recordings',      null, 'auto'),
 ('Offworld Recordings',   'youtube', 'https://www.youtube.com/@OffworldRecordings',    null, 'auto'),
 ('Celsius Recordings',    'youtube', 'https://www.youtube.com/@CelsiusRecordings',     null, 'auto'),
 ('Dread Recordings',      'youtube', 'https://www.youtube.com/@DreadRecordings',       null, 'auto'),
 ('Soulvent Records',      'youtube', 'https://www.youtube.com/@SoulventRecords',       null, 'auto'),
 ('Med School Music',      'youtube', 'https://www.youtube.com/@MedSchoolMusic',        null, 'auto'),
 ('Hospitality DnB',       'youtube', 'https://www.youtube.com/@HospitalityDnB',        null, 'auto'),
 ('DnB Allstars',          'youtube', 'https://www.youtube.com/@DnBAllStars',           null, 'auto')
on conflict (url) do nothing;
