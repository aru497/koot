-- ════════════════════════════════════════════════════════════════
--  Koott — LIVE DATA tables (gov-sourced) + communities
--  occupations · salaries · courses (universities) · communities
--  Run AFTER supabase-schema.sql, in SQL Editor. Safe to re-run.
--  Public READ (anon + authenticated). Writes only via the
--  sync-gov-data Edge Function (service role), never the browser.
-- ════════════════════════════════════════════════════════════════

-- ── OCCUPATIONS (Skills Priority List) ──────────────────────────
create table if not exists public.occupations (
  id            text primary key,
  cat           text,
  title         text not null,
  anzsco        text,
  shortage      text,
  keywords      text[] not null default '{}',
  aqf_req       int[]  not null default '{}',
  employment    int,
  growth        int,
  outlook       text,
  source        text,
  jobs          text[] not null default '{}',
  course_names  text[] not null default '{}',
  visa_pathways text[] not null default '{}',
  updated_at    timestamptz not null default now()
);

-- ── SALARIES (ABS / LMIP job market) ────────────────────────────
create table if not exists public.salaries (
  occupation_id text primary key references public.occupations(id) on delete cascade,
  sal_min   int,
  sal_max   int,
  sal_med   int,
  currency  text not null default 'AUD',
  source    text,
  updated_at timestamptz not null default now()
);

-- ── COURSES (CRICOS universities) ───────────────────────────────
create table if not exists public.courses (
  id        text primary key,
  name      text not null,
  city      text,
  state     text,
  regional  boolean default false,
  ielts     numeric,
  qs_range  text,
  fee_ug    int,
  fee_pg    int,
  cricos    text,
  url       text,
  updated_at timestamptz not null default now()
);

-- ── COMMUNITIES (for the communities search) ────────────────────
create table if not exists public.communities (
  id       text primary key,
  cat      text,
  icon     text,
  name     text not null,
  members  int default 0,
  sort     int default 0
);

-- ── Row Level Security: public read, no client writes ───────────
do $$ declare t text;
begin
  foreach t in array array['occupations','salaries','courses','communities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read %1$s" on public.%1$I', t);
    execute format('create policy "public read %1$s" on public.%1$I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
--  SEED DATA (real gov-sourced values currently in the app)
--  The sync-gov-data Edge Function refreshes these from live APIs.
-- ════════════════════════════════════════════════════════════════

insert into public.occupations (id,cat,title,anzsco,shortage,keywords,aqf_req,employment,growth,outlook,source,jobs,course_names,visa_pathways) values
('sw-eng','IT','Software Engineer / Developer','261313','national',ARRAY['software','programming','coding','computer science','IT','information technology','development','web','mobile','app','computing','systems']::text[],ARRAY[7,8,9]::int[],89,18,'Very Strong','SPL 2024 — Shortage nationally. 18% projected growth (LMIP 2024)',ARRAY['Software Engineer','Backend Developer','Full Stack Developer','Frontend Developer','Mobile App Developer','DevOps Engineer','Cloud Engineer','Platform Engineer']::text[],ARRAY['Bachelor of Computer Science','Bachelor of Software Engineering','Master of Information Technology','Master of Applied Computing','Master of Data Science']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent','190 State Nominated']::text[]),
('data-sci','IT','Data Scientist / Analyst','262113','national',ARRAY['data','analytics','machine learning','AI','artificial intelligence','statistics','data science','business intelligence','BI','ML','deep learning']::text[],ARRAY[7,8,9]::int[],91,22,'Very Strong','SPL 2024 — Data Scientists in national shortage. AI/ML roles growing 22% (LMIP 2024)',ARRAY['Data Scientist','Data Analyst','ML Engineer','AI Engineer','Business Intelligence Analyst','Data Engineer','Research Scientist']::text[],ARRAY['Bachelor of Data Science','Master of Data Science','Master of Artificial Intelligence','Master of Business Analytics','Master of Information Systems']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent','186 Employer Sponsored']::text[]),
('cyber','IT','Cybersecurity Specialist','262112','national',ARRAY['cybersecurity','security','cyber','information security','network security','ethical hacking','penetration testing','CISSP','infosec']::text[],ARRAY[7,8,9]::int[],92,25,'Exceptional','SPL 2024 — Critical national shortage. Australia short 30,000 cybersecurity workers (AustCyber 2024)',ARRAY['Cybersecurity Analyst','Security Engineer','Penetration Tester','SOC Analyst','Cloud Security Engineer','Information Security Manager','Incident Responder']::text[],ARRAY['Master of Cybersecurity','Graduate Certificate in Cybersecurity','Master of Information Technology (Security)','Bachelor of Cybersecurity']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent','186 Employer Sponsored']::text[]),
('ict-ba','IT','ICT Business Analyst','261111','national',ARRAY['business analyst','ICT','systems analyst','requirements','agile','scrum','project management','BA']::text[],ARRAY[7,8,9]::int[],86,12,'Strong','SPL 2024 — ICT Business Analysts in national shortage',ARRAY['ICT Business Analyst','Systems Analyst','Product Manager','Scrum Master','Business Systems Analyst','Requirements Analyst']::text[],ARRAY['Master of Information Technology','Master of Business Information Systems','MBA (IT)','Graduate Diploma in IT Management']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent']::text[]),
('nursing','Healthcare','Registered Nurse','254499','national',ARRAY['nursing','nurse','healthcare','hospital','clinical','medical','RN','midwife','aged care','mental health']::text[],ARRAY[7,8,9]::int[],94,16,'Very Strong','SPL 2024 — Registered Nurses in critical national shortage. 40,000 vacancy gap projected by 2025 (Health Workforce Australia)',ARRAY['Registered Nurse','Clinical Nurse Specialist','Nurse Practitioner','ICU Nurse','Emergency Nurse','Mental Health Nurse','Aged Care Nurse']::text[],ARRAY['Bachelor of Nursing','Master of Nursing (Graduate Entry)','Graduate Certificate in Nursing','Master of Midwifery']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent','190 State Nominated','Employer Sponsored 482']::text[]),
('physio','Healthcare','Physiotherapist','252511','national',ARRAY['physiotherapy','physio','rehabilitation','sports medicine','occupational therapy','physical therapy','musculoskeletal']::text[],ARRAY[7,8,9]::int[],93,14,'Strong','SPL 2024 — Physiotherapists in national shortage, particularly in regional and rural areas',ARRAY['Physiotherapist','Sports Physiotherapist','Neurological Physiotherapist','Paediatric Physiotherapist','Musculoskeletal Physio']::text[],ARRAY['Bachelor of Physiotherapy','Master of Physiotherapy','Doctor of Physiotherapy']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent','190 State Nominated']::text[]),
('social-work','SocialWork','Social Worker','272511','national',ARRAY['social work','community services','welfare','counselling','youth work','family services','disability support','NDIS','mental health support']::text[],ARRAY[7,8,9]::int[],91,13,'Strong','SPL 2024 — Social Workers in national shortage, high demand in regional areas and NDIS services',ARRAY['Social Worker','Case Manager','Community Development Officer','Child Protection Officer','NDIS Coordinator','Family Support Worker']::text[],ARRAY['Bachelor of Social Work','Master of Social Work (Qualifying)','Master of Social Work']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent','190 State Nominated']::text[]),
('occ-therapy','Healthcare','Occupational Therapist','252411','national',ARRAY['occupational therapy','OT','rehabilitation','disability','NDIS','aged care','mental health OT']::text[],ARRAY[7,8,9]::int[],92,14,'Strong','SPL 2024 — Occupational Therapists in national shortage, NDIS expansion driving demand',ARRAY['Occupational Therapist','NDIS Occupational Therapist','Paediatric OT','Aged Care OT','Mental Health OT']::text[],ARRAY['Bachelor of Occupational Therapy','Master of Occupational Therapy']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent','190 State Nominated']::text[]),
('civil-eng','Engineering','Civil Engineer','233211','national',ARRAY['civil engineering','structural','infrastructure','construction','transport','roads','bridges','water','geotechnical','environmental']::text[],ARRAY[7,8,9]::int[],88,14,'Strong','SPL 2024 — Civil Engineers in national shortage. Infrastructure pipeline projects (NAIF, BBRF) driving demand',ARRAY['Civil Engineer','Structural Engineer','Transport Engineer','Geotechnical Engineer','Water Engineer','Project Engineer','Site Engineer']::text[],ARRAY['Bachelor of Civil Engineering','Master of Engineering (Civil)','Master of Structural Engineering','Master of Infrastructure Engineering']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent','190 State Nominated','186 Employer Sponsored']::text[]),
('elec-eng','Engineering','Electrical Engineer','233311','national',ARRAY['electrical engineering','electronics','power systems','renewable energy','solar','grid','EV','control systems','automation']::text[],ARRAY[7,8,9]::int[],87,17,'Very Strong','SPL 2024 — Electrical Engineers in national shortage. Renewable energy transition driving record demand',ARRAY['Electrical Engineer','Power Systems Engineer','Renewable Energy Engineer','Control Systems Engineer','Automation Engineer','Electrical Project Manager']::text[],ARRAY['Bachelor of Electrical Engineering','Master of Electrical Engineering','Master of Renewable Energy']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent','190 State Nominated']::text[]),
('teacher-sec','Education','Secondary School Teacher','241411','national',ARRAY['teaching','education','secondary','high school','STEM teacher','maths teacher','science teacher','English teacher']::text[],ARRAY[7,8,9]::int[],96,10,'Stable-Strong','SPL 2024 — Secondary Teachers (especially STEM) in national shortage. Teacher shortage acute in regional areas',ARRAY['Secondary Teacher','STEM Teacher','Maths Teacher','Science Teacher','ESL Teacher','Special Needs Teacher','Head of Department']::text[],ARRAY['Master of Teaching (Secondary)','Bachelor of Education (Secondary)','Graduate Diploma of Education','Master of Education']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent','190 State Nominated']::text[]),
('teacher-early','Education','Early Childhood Teacher / Educator','241111','national',ARRAY['early childhood','kindergarten','childcare','preschool','ECE','ECEC','early education','child development']::text[],ARRAY[7,8,9]::int[],95,15,'Strong','SPL 2024 — Early Childhood Teachers in national shortage. Childcare Subsidy expansion creating 30,000+ new positions',ARRAY['Early Childhood Teacher','Centre Director','Room Leader','Educational Leader','Family Day Care Educator']::text[],ARRAY['Bachelor of Early Childhood Education','Master of Teaching (Early Childhood)','Diploma of Early Childhood Education and Care']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent','190 State Nominated']::text[]),
('accounting','Business','Accountant / Management Accountant','221112','difficulty',ARRAY['accounting','finance','CPA','CA','ACCA','audit','tax','management accounting','financial analysis','bookkeeping','commerce','financial reporting']::text[],ARRAY[7,8,9]::int[],84,6,'Moderate','SPL 2024 — Recruitment Difficulty nationally. Strong demand for CPAs. Note: oversupply of junior roles.',ARRAY['Management Accountant','Financial Analyst','Tax Accountant','Audit Manager','CFO','Finance Business Partner','Forensic Accountant']::text[],ARRAY['Master of Professional Accounting','Master of Commerce (Accounting)','Bachelor of Accounting','Graduate Diploma of Accounting']::text[],ARRAY['485 Graduate (2–4 yrs)','189 Skilled Independent (CPA/CA required)','190 State Nominated']::text[]),
('ux-design','Creative','UX / Product Designer','232411','difficulty',ARRAY['design','UX','UI','user experience','graphic design','product design','visual design','interaction design','HCI','Figma']::text[],ARRAY[7,8,9]::int[],82,11,'Moderate-Strong','SPL 2024 — Recruitment Difficulty. Strong demand in tech sector. Senior UX roles highly sought.',ARRAY['UX Designer','UI Designer','Product Designer','Visual Designer','Service Designer','Design Lead','Research Designer']::text[],ARRAY['Bachelor of Design (Digital)','Master of Interaction Design','Master of Design','Graduate Certificate in UX Design']::text[],ARRAY['485 Graduate (2–4 yrs)','190 State Nominated']::text[]),
('agri-sci','Agriculture','Agricultural Scientist / Agronomist','234111','regional',ARRAY['agriculture','agronomy','farming','crops','livestock','food science','soil science','environmental management','horticulture','viticulture']::text[],ARRAY[7,8,9]::int[],86,9,'Stable in regional areas','SPL 2024 — Regional Shortage. Strong demand in rural NSW, VIC, QLD. Ideal for regional study + visa.',ARRAY['Agronomist','Agricultural Scientist','Farm Manager','Extension Officer','Agricultural Adviser','Soil Scientist','Horticulturalist']::text[],ARRAY['Bachelor of Agricultural Science','Master of Agribusiness','Bachelor of Science (Agriculture)']::text[],ARRAY['485 Graduate (2–4 yrs — extended for regional)','190 Regional State Nominated','191 Permanent Residence']::text[]),
('hospitality','Hospitality','Hospitality Manager / Chef','141311','national',ARRAY['hospitality','hotel management','tourism','chefs','cooking','culinary','food','beverage','events','restaurant','accommodation']::text[],ARRAY[5,6,7,8]::int[],80,9,'Stable','SPL 2024 — Chefs in national shortage. Post-COVID hospitality recovery driving demand across Australia.',ARRAY['Hotel Manager','Restaurant Manager','Executive Chef','Sous Chef','Events Manager','Food & Beverage Manager','Tourism Manager']::text[],ARRAY['Bachelor of Hospitality Management','Diploma of Hospitality Management','Bachelor of Tourism Management']::text[],ARRAY['485 Graduate (2 yrs)','190 State Nominated (limited)','482 Employer Sponsored']::text[])
on conflict (id) do update set cat=excluded.cat,title=excluded.title,anzsco=excluded.anzsco,shortage=excluded.shortage,keywords=excluded.keywords,aqf_req=excluded.aqf_req,employment=excluded.employment,growth=excluded.growth,outlook=excluded.outlook,source=excluded.source,jobs=excluded.jobs,course_names=excluded.course_names,visa_pathways=excluded.visa_pathways,updated_at=now();

insert into public.salaries (occupation_id,sal_min,sal_max,sal_med,source) values
('sw-eng',85000,135000,107000,'SPL 2024 — Shortage nationally. 18% projected growth (LMIP 2024)'),
('data-sci',88000,145000,115000,'SPL 2024 — Data Scientists in national shortage. AI/ML roles growing 22% (LMIP 2024)'),
('cyber',90000,148000,118000,'SPL 2024 — Critical national shortage. Australia short 30,000 cybersecurity workers (AustCyber 2024)'),
('ict-ba',85000,125000,103000,'SPL 2024 — ICT Business Analysts in national shortage'),
('nursing',62000,98000,76000,'SPL 2024 — Registered Nurses in critical national shortage. 40,000 vacancy gap projected by 2025 (Health Workforce Australia)'),
('physio',65000,98000,80000,'SPL 2024 — Physiotherapists in national shortage, particularly in regional and rural areas'),
('social-work',60000,88000,73000,'SPL 2024 — Social Workers in national shortage, high demand in regional areas and NDIS services'),
('occ-therapy',64000,96000,78000,'SPL 2024 — Occupational Therapists in national shortage, NDIS expansion driving demand'),
('civil-eng',76000,125000,97000,'SPL 2024 — Civil Engineers in national shortage. Infrastructure pipeline projects (NAIF, BBRF) driving demand'),
('elec-eng',80000,130000,102000,'SPL 2024 — Electrical Engineers in national shortage. Renewable energy transition driving record demand'),
('teacher-sec',68000,98000,82000,'SPL 2024 — Secondary Teachers (especially STEM) in national shortage. Teacher shortage acute in regional areas'),
('teacher-early',55000,82000,67000,'SPL 2024 — Early Childhood Teachers in national shortage. Childcare Subsidy expansion creating 30,000+ new positions'),
('accounting',65000,115000,87000,'SPL 2024 — Recruitment Difficulty nationally. Strong demand for CPAs. Note: oversupply of junior roles.'),
('ux-design',72000,120000,93000,'SPL 2024 — Recruitment Difficulty. Strong demand in tech sector. Senior UX roles highly sought.'),
('agri-sci',60000,95000,74000,'SPL 2024 — Regional Shortage. Strong demand in rural NSW, VIC, QLD. Ideal for regional study + visa.'),
('hospitality',52000,85000,65000,'SPL 2024 — Chefs in national shortage. Post-COVID hospitality recovery driving demand across Australia.')
on conflict (occupation_id) do update set sal_min=excluded.sal_min,sal_max=excluded.sal_max,sal_med=excluded.sal_med,source=excluded.source,updated_at=now();

insert into public.courses (id,name,city,state,regional,ielts,qs_range,fee_ug,fee_pg,cricos,url) values
('university-of-newcastle','University of Newcastle (UON)','Newcastle','NSW',true,6,'301-350',38500,41000,'00109J','newcastle.edu.au'),
('university-of-wollongong','University of Wollongong (UOW)','Wollongong','NSW',true,6,'201-250',37000,40000,'00102E','uow.edu.au'),
('university-of-south-australia','University of South Australia (UniSA)','Adelaide','SA',true,6,'401-450',36000,38500,'00121B','unisa.edu.au'),
('flinders-university','Flinders University','Adelaide','SA',true,6,'401-500',35000,37500,'00114A','flinders.edu.au'),
('university-of-tasmania','University of Tasmania (UTAS)','Hobart','TAS',true,6,'401-500',34000,36000,'00586B','utas.edu.au'),
('james-cook-university','James Cook University (JCU)','Townsville','QLD',true,6,'501-550',34500,37000,'00117J','jcu.edu.au'),
('charles-darwin-university','Charles Darwin University (CDU)','Darwin','NT',true,6,'601+',32000,34500,'00300K','cdu.edu.au'),
('cq-university-australia','CQ University Australia','Rockhampton','QLD',true,6,'601+',31000,33000,'00219C','cqu.edu.au'),
('university-of-new-england','University of New England (UNE)','Armidale','NSW',true,6,'601+',32500,34000,'00003G','une.edu.au'),
('unsw-sydney','UNSW Sydney','Sydney','NSW',false,6.5,'19',53000,54500,'00098G','unsw.edu.au'),
('university-of-sydney','University of Sydney','Sydney','NSW',false,6.5,'18',52000,54000,'00026A','sydney.edu.au'),
('university-of-melbourne','University of Melbourne','Melbourne','VIC',false,6.5,'14',52000,53500,'00116K','unimelb.edu.au'),
('monash-university','Monash University','Melbourne','VIC',false,6,'37',49000,51000,'00008C','monash.edu'),
('rmit-university','RMIT University','Melbourne','VIC',false,6,'201-250',41000,43000,'00122A','rmit.edu.au'),
('uts-sydney','UTS Sydney','Sydney','NSW',false,6,'133',46000,48000,'00099F','uts.edu.au'),
('university-of-queensland','University of Queensland (UQ)','Brisbane','QLD',false,6.5,'40',50000,52000,'00025B','uq.edu.au'),
('griffith-university','Griffith University','Brisbane','QLD',false,6,'401-450',35500,38000,'00233E','griffith.edu.au'),
('university-of-adelaide','University of Adelaide','Adelaide','SA',true,6.5,'89',49000,51000,'00123M','adelaide.edu.au'),
('university-of-western-australia','University of Western Australia (UWA)','Perth','WA',false,6.5,'90',49000,51000,'00126G','uwa.edu.au'),
('curtin-university','Curtin University','Perth','WA',false,6,'201-250',40000,43000,'00301J','curtin.edu.au'),
('deakin-university','Deakin University','Melbourne','VIC',false,6,'301-350',38000,41000,'00113B','deakin.edu.au'),
('la-trobe-university','La Trobe University','Melbourne','VIC',false,6,'501-550',36000,38500,'00115M','latrobe.edu.au')
on conflict (id) do update set name=excluded.name,city=excluded.city,state=excluded.state,regional=excluded.regional,ielts=excluded.ielts,qs_range=excluded.qs_range,fee_ug=excluded.fee_ug,fee_pg=excluded.fee_pg,cricos=excluded.cricos,url=excluded.url,updated_at=now();

insert into public.communities (id,cat,icon,name,members,sort) values
('sydney','city','🏙️','Sydney Students',342,0),
('melb','city','🌆','Melbourne Students',281,1),
('brisbane','city','🌇','Brisbane Students',156,2),
('perth','city','🌅','Perth Students',127,3),
('adelaide','city','🏘️','Adelaide Students',89,4),
('newcastle','city','⛪','Newcastle Students',74,5),
('wollongong','city','🏄','Wollongong Students',61,6),
('unsw25','uni','🎓','UNSW 2025',118,7),
('unimelb25','uni','🎓','UniMelb 2025',97,8),
('monash25','uni','🎓','Monash 2025',84,9),
('uon25','uni','🎓','UON Newcastle 2025',52,10),
('uow25','uni','🎓','UOW Wollongong 2025',43,11),
('deciding','stage','💭','Still Deciding',203,12),
('applied','stage','📋','Applied & Waiting',167,13),
('arriving','stage','✈️','Arriving Soon',144,14),
('first60','stage','🛬','First 60 Days',89,15),
('housing','other','🏠','Housing Board',271,16),
('jobs','other','💼','Part-Time Jobs',189,17)
on conflict (id) do update set cat=excluded.cat,icon=excluded.icon,name=excluded.name,members=excluded.members,sort=excluded.sort;
