-- Documentos da admissão sem nada aberto para quem não entrou (09/11/2026, claude/plano-seguranca.md, item 2).
--
-- RODE SÓ DEPOIS de publicar a Edge Function "limpar-documentos" e de o site no ar já usá-la (o Admin › Falhas
-- não mostra falha da limpeza). Antes disso, a limpeza dos vencidos pelo site para de funcionar.
--
-- Antes: para o site apagar os vencidos sem login, os arquivos marcados ficavam visíveis (e listáveis) para
-- qualquer visitante por 15 minutos, e qualquer um podia apagá-los. Agora quem apaga é a Edge Function, com a chave
-- secreta que fica no Supabase; as regras para "anon" saem. Pode rodar de novo.

-- 1. Sai a regra que mostrava os marcados para qualquer um
drop policy if exists "publike: documentos da admissão, vencidos" on storage.objects;

-- 2. Apagar: só a própria pessoa, antes da entrega ao contador (o vencido, só a Edge Function)
create or replace function privado.doc_pode_apagar(p_proposta text, p_caminho text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_proposta ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.propostas p
     where p.id = p_proposta::uuid and p.perfil_id = (select auth.uid())
       and p.documentos_entregues_em is null)
$$;

drop policy if exists "publike: documentos da admissão, apagar" on storage.objects;
create policy "publike: documentos da admissão, apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos-admissao' and privado.doc_pode_apagar((storage.foldername(name))[2], name));

revoke execute on function privado.doc_pode_apagar(text, text) from public, anon;
grant execute on function privado.doc_pode_apagar(text, text) to authenticated;

-- 3. A lista dos marcados não é mais lida por ninguém de fora
revoke select on privado.documentos_para_apagar from anon, authenticated;
