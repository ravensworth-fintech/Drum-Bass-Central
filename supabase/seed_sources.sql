-- Starter YouTube sources. Only the UKF channel ID was verified; the @handles below are best guesses.
-- A wrong one just shows ok:false in /api/ingest output and never blocks the others. Fix or delete it in Table Editor -> sources.
insert into sources (name, kind, url, platform_id, monitorable) values
 ('UKF Drum & Bass', 'youtube', 'https://www.youtube.com/@ukfdrumandbass', 'UCr8oc-LOaApCXWLjL7vdsgw', 'auto'),
 ('Liquicity',       'youtube', 'https://www.youtube.com/@Liquicity',       null, 'auto'),
 ('Drum&BassArena',  'youtube', 'https://www.youtube.com/@DrumandBassArena', null, 'auto'),
 ('Hospital Records','youtube', 'https://www.youtube.com/@HospitalRecords', null, 'auto'),
 ('Shogun Audio',    'youtube', 'https://www.youtube.com/@ShogunAudio',     null, 'auto'),
 ('RAM Records',     'youtube', 'https://www.youtube.com/@RAMRecords',      null, 'auto'),
 ('Critical Music',  'youtube', 'https://www.youtube.com/@CriticalMusic',   null, 'auto')
on conflict (url) do nothing;
