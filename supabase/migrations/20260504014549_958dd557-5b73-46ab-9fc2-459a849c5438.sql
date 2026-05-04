
-- pgvector
create extension if not exists vector;

-- documents table
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid,
  name text not null,
  mime text not null,
  size integer not null default 0,
  source text not null default 'local',
  storage_path text,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.documents enable row level security;
create policy "own documents" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index documents_user_idx on public.documents(user_id);
create index documents_conv_idx on public.documents(conversation_id);

-- chunks table
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
alter table public.document_chunks enable row level security;
create policy "own chunks" on public.document_chunks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index document_chunks_doc_idx on public.document_chunks(document_id);
create index document_chunks_user_idx on public.document_chunks(user_id);
create index document_chunks_embedding_idx on public.document_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- similarity match function
create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 6,
  filter_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  similarity float,
  document_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.name as document_name
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.user_id = match_user_id
    and c.embedding is not null
    and (filter_document_ids is null or c.document_id = any(filter_document_ids))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- storage bucket (private)
insert into storage.buckets (id, name, public) values ('analysis_documents', 'analysis_documents', false)
on conflict (id) do nothing;

create policy "users read own analysis files"
  on storage.objects for select
  using (bucket_id = 'analysis_documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "users upload own analysis files"
  on storage.objects for insert
  with check (bucket_id = 'analysis_documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "users update own analysis files"
  on storage.objects for update
  using (bucket_id = 'analysis_documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "users delete own analysis files"
  on storage.objects for delete
  using (bucket_id = 'analysis_documents' and auth.uid()::text = (storage.foldername(name))[1]);
