-- Convites com aceite pelo link: o admin importa as vagas lidas das imagens dos anúncios
-- (rascunho da vaga), manda no WhatsApp o link /publicar?convite=<token> e, quando a empresa
-- entra e publica, o convite vira "Autorizou" sozinho (com a data do aceite e a vaga).
-- Quem não quer toca em "Não quero receber" e o convite vira "Não quis".

alter table public.convites
  add column if not exists token text unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
    check (token ~ '^[0-9a-f]{64}$'),
  -- a vaga lida do anúncio (título, descrição, salário...): vem pronta no formulário de publicar
  add column if not exists rascunho jsonb check (rascunho is null or (jsonb_typeof(rascunho) = 'object' and octet_length(rascunho::text) <= 8000)),
  add column if not exists origem text check (origem is null or origem in ('arquivo', 'imagem')),
  add column if not exists aceite_em timestamptz,
  add column if not exists anuncio_id uuid references public.anuncios (id) on delete set null;

update public.convites
   set token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 where token is null;
alter table public.convites alter column token set not null;

-- A página de publicar abre o convite pelo token (só o nome, o tipo e o rascunho da vaga)
create or replace function public.convite_do_token(p_token text)
returns table (nome text, tipo text, rascunho jsonb, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.nome, c.tipo, c.rascunho, c.status
    from public.convites c
   where p_token ~ '^[0-9a-f]{64}$' and c.token = p_token;
$$;
revoke execute on function public.convite_do_token(text) from public;
grant execute on function public.convite_do_token(text) to anon, authenticated;

-- Publicou pela página do convite: é o aceite (a vaga tem que ser de quem está publicando)
create or replace function public.aceitar_convite(p_token text, p_anuncio uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
begin
  if eu is null or p_token !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = eu) then
    return false;
  end if;
  update public.convites
     set status = 'autorizou',
         aceite_em = coalesce(aceite_em, now()),
         usuario_id = coalesce(usuario_id, eu),
         anuncio_id = coalesce(anuncio_id, p_anuncio)
   where token = p_token and status <> 'recusou';
  return found;
end
$$;
revoke execute on function public.aceitar_convite(text, uuid) from public, anon;
grant execute on function public.aceitar_convite(text, uuid) to authenticated;

-- "Não quero receber": o convite vira "Não quis" (e o admin não manda mais)
create or replace function public.recusar_convite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  update public.convites set status = 'recusou'
   where token = p_token and status in ('a_enviar', 'enviada');
  return found;
end
$$;
revoke execute on function public.recusar_convite(text) from public;
grant execute on function public.recusar_convite(text) to anon, authenticated;

notify pgrst, 'reload schema';
