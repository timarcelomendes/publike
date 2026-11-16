-- O mapa dos talentos para todo mundo que contrata (16/11/2026, "não consegui visualizar o mapa de talentos"): a
-- migração 20270630120000 só deixava a conta de empresa, comércio ou agência, e quem é pessoa e tem vaga publicada
-- (a doméstica, o pedreiro, o pequeno negócio no CPF) ficava sem o mapa. Agora vale quem contrata: a conta que não é de
-- pessoa, a que tem vaga publicada (no ar, pausada ou em análise) e a que marcou "Contratar" no perfil.
-- E o lugar aproximado de uma lista de talentos (bairros_dos_talentos), para o mapa e a distância do "Para a sua vaga":
-- o centro do bairro escrito no perfil (privado.centros_dos_bairros), nunca a casa.

create or replace function privado.quem_contrata(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_conta is not null and (
    exists (select 1 from public.perfis p where p.id = p_conta and p.tipo <> 'pessoa')
    or privado.conta_com_vaga_publicada(p_conta)
    or exists (select 1 from privado.modos_da_conta m where m.conta_id = p_conta and 'contratar' = any (m.modos))
  )
$$;
revoke execute on function privado.quem_contrata(uuid) from public, anon, authenticated;

create or replace function public.mapa_dos_talentos(p_texto text default null, p_cidade text default null)
returns table (cidade text, bairro text, lat double precision, lng double precision, pessoas integer, talentos jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  eu uuid := (select public.conta_atual());
  termos jsonb := privado.termos_da_busca(p_texto);
  sem_termos boolean;
begin
  if not privado.quem_contrata(eu) then
    raise exception 'O mapa dos talentos é para quem contrata.' using errcode = 'P0001';
  end if;
  sem_termos := jsonb_array_length(termos -> 'e') = 0 and jsonb_array_length(termos -> 'nao') = 0;
  return query
  with t as (
    select p.id, privado.nome_curto(p.nome) as nome, c.titulo, c.atualizado_em, p.cidade as cidade_nome,
           nullif(btrim(p.bairro), '') as bairro_nome,
           lower(public.sem_acento(p.cidade)) as cid, privado.bairro_comparavel(p.bairro) as bai
      from public.curriculo_na_vitrine n
      join public.curriculos c on c.perfil_id = n.perfil_id
      join public.perfis p on p.id = n.perfil_id
     where p.tipo = 'pessoa'
       and p.id <> eu
       and (p.suspenso_ate is null or p.suspenso_ate < now())
       and not privado.ha_bloqueio(eu, p.id)
       and (p_cidade is null or lower(p.cidade) = lower(p_cidade))
       and (sem_termos or privado.bate_busca(privado.texto_do_talento(c), termos))
  ),
  com_lugar as (
    select t.*, b.lat, b.lng from t
      left join privado.centros_dos_bairros b on b.cidade = t.cid and b.bairro = t.bai
  )
  select mode() within group (order by x.cidade_nome), mode() within group (order by x.bairro_nome), x.lat, x.lng,
         count(*)::integer,
         (jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'titulo', x.titulo) order by x.atualizado_em desc)
            filter (where x.lat is not null)) as talentos
    from com_lugar x
   group by x.cid, x.bai, x.lat, x.lng
  having x.lat is not null
  union all
  select null, null, null, null, count(*)::integer, null
    from com_lugar x
   where x.lat is null
  having count(*) > 0;
end
$$;
revoke execute on function public.mapa_dos_talentos(text, text) from public, anon;
grant execute on function public.mapa_dos_talentos(text, text) to authenticated;

-- o lugar aproximado de cada talento de uma lista (até 600): só quem aparece para as empresas (Talentos ou o
-- currículo visível), e só para quem contrata. Quem não tem bairro, ou tem um bairro que o mapa não acha, não vem.
create or replace function public.bairros_dos_talentos(p_ids uuid[])
returns table (perfil_id uuid, cidade text, bairro text, lat double precision, lng double precision)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  eu uuid := (select public.conta_atual());
begin
  if not privado.quem_contrata(eu) then
    raise exception 'O mapa dos talentos é para quem contrata.' using errcode = 'P0001';
  end if;
  return query
  select p.id, p.cidade, nullif(btrim(p.bairro), ''), b.lat, b.lng
    from public.perfis p
    join privado.centros_dos_bairros b
      on b.cidade = lower(public.sem_acento(p.cidade)) and b.bairro = privado.bairro_comparavel(p.bairro)
   where p.id = any (p_ids[1:600])
     and p.tipo = 'pessoa'
     and p.id <> eu
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and (exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = p.id)
          or exists (select 1 from public.curriculo_visivel v where v.perfil_id = p.id))
     and not privado.ha_bloqueio(eu, p.id);
end
$$;
revoke execute on function public.bairros_dos_talentos(uuid[]) from public, anon;
grant execute on function public.bairros_dos_talentos(uuid[]) to authenticated;

select privado.migracao_aplicada('20270702120000_mapa_para_quem_contrata');
