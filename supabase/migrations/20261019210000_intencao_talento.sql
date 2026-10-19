-- =====================================================================
-- "Cadastrar meu currículo" na pergunta "O que você quer fazer no Publike?"
--
-- Uma resposta nova, em destaque na pergunta: quem quer aparecer na aba Talentos
-- ('talento'). Escolhida, ela leva ao currículo, com o passo a passo para entrar na
-- aba. A conta guarda a resposta como as outras (privado.intencoes).
--
-- Rode depois de 20261019190000_talentos_na_busca.sql. Pode rodar de novo.
-- =====================================================================

alter table privado.intencoes drop constraint if exists intencoes_intencao_check;
alter table privado.intencoes add constraint intencoes_intencao_check
  check (intencao in ('trabalho', 'contratar_servico', 'oferecer_servico', 'contratar_pessoa', 'talento'));

-- a mesma função de 20261011190000_intencao.sql, com a resposta nova
create or replace function public.salvar_intencao(p_intencao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if p_intencao is null
     or p_intencao not in ('trabalho', 'contratar_servico', 'oferecer_servico', 'contratar_pessoa', 'talento') then
    raise exception 'Escolha uma das opções.' using errcode = '22023';
  end if;
  insert into privado.intencoes (usuario_id, intencao) values (usuario, p_intencao)
  on conflict (usuario_id) do update set intencao = excluded.intencao, atualizado_em = now();
end
$$;

revoke execute on function public.salvar_intencao(text) from public, anon;
grant execute on function public.salvar_intencao(text) to authenticated;

notify pgrst, 'reload schema';
