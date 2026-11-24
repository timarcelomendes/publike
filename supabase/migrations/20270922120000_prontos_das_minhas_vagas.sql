-- A chamada dos "Prontos para assumir" no painel (24/11/2026; Marcelo: "podemos pensar em ter uma chamada para o
-- Pronto para assumir"): quantas pessoas prontas cada vaga no ar da conta tem, com as mesmas regras de
-- public.prontos_para_a_vaga (migração 20270827120000: a leitura do currículo diz "pronto" para a função da vaga, o
-- currículo está visível, sem bloqueio e sem quem já curtiu a vaga), sem montar a lista. Hoje, Vagas, a vaga e
-- Candidatos mostram o número e levam a Talentos › Para a sua vaga.

create or replace function public.prontos_das_minhas_vagas()
returns table (anuncio_id uuid, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  with vagas as (
    select a.id, f.cbo
      from public.anuncios a
      join privado.funcoes_das_vagas f on f.anuncio_id = a.id
     where a.autor_id = public.conta_atual()
       and (select auth.uid()) is not null
       and a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > now()
       and f.cbo is not null
     order by a.criado_em desc
     limit 30
  )
  select v.id, count(distinct l.perfil_id)::integer
    from vagas v
    join privado.leituras_curriculo l on true
    cross join lateral jsonb_array_elements(l.funcoes) f
   where f ->> 'nivel' = 'pronto'
     and left(f ->> 'cbo', 4) = left(v.cbo, 4)
     and privado.curriculo_para_leitura(l.perfil_id)
     and not privado.ha_bloqueio(public.conta_atual(), l.perfil_id)
     and not exists (select 1 from public.curtidas k where k.anuncio_id = v.id and k.perfil_id = l.perfil_id)
   group by v.id
$$;
revoke execute on function public.prontos_das_minhas_vagas() from public, anon;
grant execute on function public.prontos_das_minhas_vagas() to authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270922120000_prontos_das_minhas_vagas');
