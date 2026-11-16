-- O mapa dos talentos (Talentos, para quem contrata): onde estão as pessoas que escolheram aparecer, pelo bairro.
-- Localização aproximada: cada pessoa entra no centro do bairro que ela mesma escreveu no perfil (o mesmo bairro que o
-- cartão já mostra), nunca na casa. O centro do bairro vem de lugares que não são de ninguém: a mediana dos endereços
-- da Receita, das vagas e das casas com aquele bairro (com 3 pontos ou mais), guardada em privado.centros_dos_bairros e
-- refeita a cada carga da Receita (/api/empresas chama public.servidor_centros_dos_bairros).

-- o nome do bairro do jeito de comparar: sem acento, sem "Setor", com as abreviações por extenso
create or replace function privado.bairro_comparavel(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  x text := lower(public.sem_acento(btrim(coalesce(p, ''))));
begin
  x := regexp_replace(x, '[^a-z0-9 ]', ' ', 'g');
  x := regexp_replace(x, '\s+', ' ', 'g');
  x := btrim(x);
  x := regexp_replace(x, '^(setor|st|set) ', '');
  x := regexp_replace(x, '^(jd|jdm|jar) ', 'jardim ');
  x := regexp_replace(x, '^(res|resid) ', 'residencial ');
  x := regexp_replace(x, '^vl ', 'vila ');
  x := regexp_replace(x, '^(pq|prq) ', 'parque ');
  x := regexp_replace(x, '^(cj|conj) ', 'conjunto ');
  x := regexp_replace(x, '^(lot|lt) ', 'loteamento ');
  x := regexp_replace(x, ' (i)$', ' 1');
  x := regexp_replace(x, ' (ii)$', ' 2');
  x := regexp_replace(x, ' (iii)$', ' 3');
  x := regexp_replace(x, ' (iv)$', ' 4');
  return nullif(x, '');
end
$$;

create table if not exists privado.centros_dos_bairros (
  cidade text not null,
  bairro text not null,
  lat double precision not null,
  lng double precision not null,
  pontos integer not null,
  atualizado_em timestamptz not null default now(),
  primary key (cidade, bairro)
);
alter table privado.centros_dos_bairros enable row level security;
revoke all on privado.centros_dos_bairros from public, anon, authenticated;

-- refaz os centros (a mediana de cada coordenada: um endereço errado longe não puxa o centro)
create or replace function privado.refazer_centros_dos_bairros()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  create temporary table if not exists pontos_dos_bairros (cidade text, bairro text, lat double precision, lng double precision)
    on commit drop;
  truncate pontos_dos_bairros;
  insert into pontos_dos_bairros
  select lower(public.sem_acento(e.cidade)), privado.bairro_comparavel(e.bairro),
         extensions.st_y(e.local::extensions.geometry), extensions.st_x(e.local::extensions.geometry)
    from privado.empresas_receita e
   where e.local is not null and e.bairro is not null;
  insert into pontos_dos_bairros
  select lower(public.sem_acento(a.cidade)), privado.bairro_comparavel(a.bairro),
         extensions.st_y(a.local::extensions.geometry), extensions.st_x(a.local::extensions.geometry)
    from public.anuncios a
   where a.local is not null and a.bairro is not null;
  insert into pontos_dos_bairros
  select lower(public.sem_acento(c.cidade)), privado.bairro_comparavel(c.bairro),
         extensions.st_y(c.local::extensions.geometry), extensions.st_x(c.local::extensions.geometry)
    from public.casas c
   where c.bairro <> '';
  delete from privado.centros_dos_bairros;
  insert into privado.centros_dos_bairros (cidade, bairro, lat, lng, pontos)
  select p.cidade, p.bairro,
         percentile_cont(0.5) within group (order by p.lat),
         percentile_cont(0.5) within group (order by p.lng),
         count(*)
    from pontos_dos_bairros p
   where p.bairro is not null and p.cidade is not null
   group by p.cidade, p.bairro
  having count(*) >= 3;
  get diagnostics v = row_count;
  return v;
end
$$;
revoke execute on function privado.refazer_centros_dos_bairros() from public, anon, authenticated;

-- depois de cada carga da Receita (o /api/empresas chama no fim)
create or replace function public.servidor_centros_dos_bairros(p_chave text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return privado.refazer_centros_dos_bairros();
end
$$;
revoke execute on function public.servidor_centros_dos_bairros(text) from public, authenticated;
grant execute on function public.servidor_centros_dos_bairros(text) to anon, service_role;

-- o mapa: os talentos da busca (as mesmas regras de buscar_talentos) agrupados pelo bairro, com o centro do bairro,
-- quantos e os primeiros 12 (nome curto e o que fazem). Quem não tem bairro, ou tem um bairro que o mapa não acha,
-- vem numa linha sem lat/lng (só o número). Só para quem contrata (empresa, comércio, agência).
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
  if eu is null or not exists (select 1 from public.perfis p where p.id = eu and p.tipo <> 'pessoa') then
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
       and (p.suspenso_ate is null or p.suspenso_ate < now())
       and not privado.ha_bloqueio(eu, p.id)
       and (p_cidade is null or lower(p.cidade) = lower(p_cidade))
       and (sem_termos or privado.bate_busca(privado.texto_do_talento(c), termos))
  ),
  com_lugar as (
    select t.*, b.lat, b.lng from t
      left join privado.centros_dos_bairros b on b.cidade = t.cid and b.bairro = t.bai
  )
  select mode() within group (order by x.cidade_nome), mode() within group (order by x.bairro_nome), x.lat, x.lng, count(*)::integer,
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

-- as minhas vagas no ar, para o mapa (o lugar da vaga já é público na página dela)
create or replace function public.minhas_vagas_no_mapa()
returns table (id uuid, titulo text, lat double precision, lng double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.titulo, extensions.st_y(a.local::extensions.geometry), extensions.st_x(a.local::extensions.geometry)
    from public.anuncios a
   where a.autor_id = (select public.conta_atual()) and a.tipo = 'vaga' and a.status = 'ativo'
     and a.expira_em > now() and a.local is not null
   order by a.criado_em desc
   limit 50
$$;
revoke execute on function public.minhas_vagas_no_mapa() from public, anon;
grant execute on function public.minhas_vagas_no_mapa() to authenticated;

select privado.refazer_centros_dos_bairros();

select privado.migracao_aplicada('20270630120000_mapa_dos_talentos');
