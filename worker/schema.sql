create table if not exists decision (
  id text, run_at text, verdict text not null, notes text, by text not null,
  at text not null, primary key (id, run_at)
);
create table if not exists subscriber (
  email text primary key, map text, at text not null
);
