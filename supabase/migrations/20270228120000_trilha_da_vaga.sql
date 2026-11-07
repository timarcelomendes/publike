-- A trilha dos candidatos (07/11/2026, claude/plano-trilha-dos-candidatos.md): os passos de cada candidato de uma
-- vaga, com a data, para a vista "Trilha" (uma linha por candidato, as etapas em colunas). Só quem publicou a vaga
-- (ou a equipe da conta) lê. Os passos: 'curtiu', 'aceita' (aceite esperando o currículo), 'resposta:<status>'
-- (match, dispensada, desfeito) e, do histórico, 'curtida:<status>', 'etapa:<etapa>' e 'sub:<etapa própria>'.
-- Rode depois de 20270227120000_reputacao.sql. Pode rodar de novo.

create or replace function public.trilha_da_vaga(p_anuncio uuid)
returns table (perfil_id uuid, o_que text, em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return query
  select x.perfil_id, x.o_que, x.em from (
    select c.perfil_id, 'curtiu'::text as o_que, c.criado_em as em
      from public.curtidas c where c.anuncio_id = p_anuncio
    union all
    select c.perfil_id, 'aceita', c.aceita_em
      from public.curtidas c where c.anuncio_id = p_anuncio and c.aceita_em is not null
    union all
    select c.perfil_id, 'resposta:' || c.status, c.respondida_em
      from public.curtidas c
     where c.anuncio_id = p_anuncio and c.respondida_em is not null and c.status <> 'pendente'
    union all
    select h.perfil_id, h.o_que, h.em
      from privado.historico_etapas h
     where h.anuncio_id = p_anuncio
       and (h.o_que like 'etapa:%' or h.o_que like 'sub:%' or h.o_que like 'curtida:%')
  ) x
  order by x.em;
end
$$;

revoke execute on function public.trilha_da_vaga(uuid) from public, anon;
grant execute on function public.trilha_da_vaga(uuid) to authenticated;

notify pgrst, 'reload schema';
