-- =====================================================================
-- Aceite pendente
--
-- Conta criada pela equipe (no admin) ainda não aceitou as regras e a política
-- de privacidade: no primeiro acesso, o perfil pede o "Li e aceito". Esta
-- função diz se quem está logado ainda não aceitou a versão atual.
--
-- Rode depois de 20261015120000_vaga_completa.sql. Pode rodar de novo.
-- =====================================================================

create or replace function public.aceite_pendente(p_versao text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and not exists (
       select 1 from privado.aceites a
        where a.usuario_id = (select auth.uid()) and a.versao = p_versao)
$$;

revoke execute on function public.aceite_pendente(text) from public, anon;
grant execute on function public.aceite_pendente(text) to authenticated;

notify pgrst, 'reload schema';
