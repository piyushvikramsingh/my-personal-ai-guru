
-- full-text search support
alter table public.document_chunks
  add column if not exists content_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;

create index if not exists document_chunks_tsv_idx
  on public.document_chunks using gin(content_tsv);

create or replace function public.search_document_chunks(
  query_text text,
  match_user_id uuid,
  match_count int default 6,
  filter_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  rank real,
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
    ts_rank(c.content_tsv, plainto_tsquery('english', query_text)) as rank,
    d.name as document_name
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.user_id = match_user_id
    and (filter_document_ids is null or c.document_id = any(filter_document_ids))
    and c.content_tsv @@ plainto_tsquery('english', query_text)
  order by rank desc
  limit match_count;
$$;

-- restrict SECURITY DEFINER helpers to authenticated users only
revoke execute on function public.match_document_chunks(vector, uuid, int, uuid[]) from public, anon;
grant execute on function public.match_document_chunks(vector, uuid, int, uuid[]) to authenticated, service_role;

revoke execute on function public.search_document_chunks(text, uuid, int, uuid[]) from public, anon;
grant execute on function public.search_document_chunks(text, uuid, int, uuid[]) to authenticated, service_role;
