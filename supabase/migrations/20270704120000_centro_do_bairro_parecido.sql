-- O centro do bairro mais tolerante (16/11/2026: "Vila Maria", "Veiga Jardim 4" e "Cidade Livre Aparecida de Goiânia"
-- ficavam sem distância e sem mapa porque o nome escrito não batia letra por letra com o dos endereços). Primeiro o
-- nome igual; depois sem a cidade escrita junto (e na cidade escrita, quando é outra); por fim o nome mais parecido da
-- mesma cidade (pg_trgm, a partir de 0,6). O mapa, a distância e o lugar da conta passam a usar esta busca.

create or replace function privado.centro_do_bairro(p_cidade text, p_bairro text)
returns table (lat double precision, lng double precision)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cid text := lower(public.sem_acento(coalesce(p_cidade, '')));
  v_bai text := privado.bairro_comparavel(p_bairro);
  v_cidade_escrita text;
  v_sem_cidade text;
begin
  if v_bai is null then
    return;
  end if;
  return query select b.lat, b.lng from privado.centros_dos_bairros b where b.cidade = v_cid and b.bairro = v_bai;
  if found then
    return;
  end if;
  -- a cidade escrita junto com o bairro ("cidade livre aparecida de goiania"): o bairro sem ela, na cidade escrita
  v_cidade_escrita := substring(v_bai from '\s(aparecida de goiania|senador canedo|goianira|trindade|anapolis|goiania)$');
  v_sem_cidade := btrim(regexp_replace(v_bai, '\s(aparecida de goiania|senador canedo|goianira|trindade|anapolis|goiania)$', ''));
  if v_cidade_escrita is not null and v_sem_cidade <> '' then
    return query select b.lat, b.lng from privado.centros_dos_bairros b
                  where b.cidade in (v_cidade_escrita, v_cid) and b.bairro = v_sem_cidade
                  order by (b.cidade = v_cidade_escrita) desc limit 1;
    if found then
      return;
    end if;
  end if;
  -- o nome mais parecido da mesma cidade
  return query select b.lat, b.lng from privado.centros_dos_bairros b
                where b.cidade in (v_cid, coalesce(v_cidade_escrita, v_cid))
                  and extensions.similarity(b.bairro, v_sem_cidade) >= 0.6
                order by extensions.similarity(b.bairro, v_sem_cidade) desc, b.pontos desc
                limit 1;
end
$$;
revoke execute on function privado.centro_do_bairro(text, text) from public, anon, authenticated;

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
      left join lateral privado.centro_do_bairro(t.cidade_nome, t.bairro_nome) b on true
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
    cross join lateral privado.centro_do_bairro(p.cidade, p.bairro) b
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

create or replace function public.meu_lugar_aproximado()
returns table (lat double precision, lng double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select x.lat, x.lng from (
    select extensions.st_y(c.local::extensions.geometry) as lat, extensions.st_x(c.local::extensions.geometry) as lng, 1 as ordem
      from public.casas c
     where c.perfil_id = (select public.conta_atual())
    union all
    select b.lat, b.lng, 2
      from public.perfis p
      cross join lateral privado.centro_do_bairro(p.cidade, p.bairro) b
     where p.id = (select public.conta_atual())
  ) x
  order by x.ordem
  limit 1
$$;
revoke execute on function public.meu_lugar_aproximado() from public, anon;
grant execute on function public.meu_lugar_aproximado() to authenticated;

select privado.migracao_aplicada('20270704120000_centro_do_bairro_parecido');
