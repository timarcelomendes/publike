-- Chamar de novo (plano do retorno, parte 6): na vaga nova, quem já se candidatou a outra vaga da mesma conta nos
-- últimos 6 meses, chegou ao match e não foi contratado, e deixou o currículo visível em Talentos (as mesmas regras
-- do Convidar de Talentos: o convite usa convidar_para_vaga). Pode rodar de novo.

create or replace function public.candidatos_de_antes(p_anuncio uuid)
returns table (perfil_id uuid, nome text, foto text, cidade text, bairro text, vaga text, ate_onde text,
               candidatou_em timestamptz, convidado boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
begin
  if eu is null or not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = eu and a.tipo = 'vaga') then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return query
  with antes as (
    select c.perfil_id, a.titulo, c.criado_em as curtido_em,
           case when exists (select 1 from public.finalistas f where f.anuncio_id = c.anuncio_id and f.perfil_id = c.perfil_id) then 'finalista'
                when e.etapa = 'entrevista' or exists (select 1 from public.entrevistas x where x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id) then 'entrevista'
                else 'match' end as ate_onde
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where a.autor_id = eu and a.tipo = 'vaga' and a.id <> p_anuncio
       and c.status = 'match'
       and c.criado_em > now() - interval '6 months'
       and coalesce(e.etapa, 'novo') <> 'contratado'
  ),
  melhor as (
    select distinct on (x.perfil_id) x.*
      from antes x
     order by x.perfil_id,
              case x.ate_onde when 'finalista' then 0 when 'entrevista' then 1 else 2 end,
              x.curtido_em desc
  )
  select m.perfil_id, p.nome, p.foto, p.cidade, p.bairro, m.titulo, m.ate_onde, m.curtido_em,
         exists (select 1 from public.convites_vaga cv where cv.anuncio_id = p_anuncio and cv.perfil_id = m.perfil_id)
    from melhor m
    join public.perfis p on p.id = m.perfil_id
    join public.curriculo_visivel v on v.perfil_id = m.perfil_id
   where p.tipo = 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and not privado.ha_bloqueio(eu, m.perfil_id)
     and not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = m.perfil_id)
   order by case m.ate_onde when 'finalista' then 0 when 'entrevista' then 1 else 2 end, m.curtido_em desc
   limit 50;
end
$$;

revoke all on function public.candidatos_de_antes(uuid) from public, anon;
grant execute on function public.candidatos_de_antes(uuid) to authenticated;

notify pgrst, 'reload schema';
