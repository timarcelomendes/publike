-- A carga mensal da base da Receita grava só o que mudou (15/11/2026, Marcelo: "Sim", depois do disco do banco
-- encher com o UPDATE da base inteira na 20270616120000).
--   * antes: servidor_empresas_lote regravava as ~570 mil empresas todo mês (mes_carga e atualizado_em mudavam em
--     todas), e cada linha regravada é uma cópia nova da linha e dos índices (o de local, o de busca por nome...);
--   * agora: a empresa igual à do banco não é tocada; só entra o CNPJ novo, o que mudou algum dado e o que voltou
--     a ficar ativo. Quem veio no mês fica anotado em privado.empresas_vistas (UNLOGGED: não gera registro interno,
--     o WAL, e é só um rascunho da carga), e o "fim" marca como fora quem não veio;
--   * proteção: o "fim" não marca nada como fora se a carga trouxe menos da metade das empresas ativas (o robô parou
--     no meio ou mandou lote errado);
--   * mes_carga e atualizado_em passam a dizer quando a empresa mudou pela última vez.
-- Pode rodar de novo.

create unlogged table if not exists privado.empresas_vistas (
  mes date not null,
  cnpj text not null,
  primary key (mes, cnpj)
);
alter table privado.empresas_vistas enable row level security;
revoke all on privado.empresas_vistas from public, anon, authenticated;

create or replace function public.servidor_empresas_lote(p_chave text, p_mes date, p_linhas jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  if p_mes is null or extract(day from p_mes) <> 1 then
    raise exception 'Mês inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) > 2000 then
    raise exception 'Mande de 1 a 2.000 linhas.' using errcode = '22023';
  end if;
  -- carregar de novo um mês pronto (o "refazer" do robô) volta a carga para "carregando" e começa a lista de quem
  -- veio do zero (o refazer manda todos os lotes de novo)
  if exists (select 1 from privado.cargas_receita c where c.mes = p_mes and c.situacao = 'pronta') then
    delete from privado.empresas_vistas v where v.mes = p_mes;
  end if;
  insert into privado.cargas_receita as c (mes) values (p_mes)
  on conflict (mes) do update
    set situacao = 'carregando', terminou_em = null,
        comecou_em = case when c.situacao = 'pronta' then now() else c.comecou_em end
    where c.situacao = 'pronta';

  if to_regclass('pg_temp.lote_receita') is null then
    create temp table lote_receita (like privado.empresas_receita including defaults) on commit drop;
  else
    truncate pg_temp.lote_receita;
  end if;
  insert into pg_temp.lote_receita (
    cnpj, cnpj_basico, matriz, nome, razao_social, busca, data_abertura, cnae, cnaes_secundarios, logradouro, numero,
    complemento, bairro, cep, cidade, uf, local, precisao, porte, natureza, capital_social, telefone, email, na_praca,
    agencia, mei, mes_carga, situacao, fora_em, atualizado_em)
  select l ->> 'cnpj', l ->> 'cnpj_basico', coalesce((l ->> 'matriz')::boolean, true),
         left(l ->> 'nome', 160), left(nullif(l ->> 'razao_social', ''), 200), left(l ->> 'busca', 200),
         nullif(l ->> 'data_abertura', '')::date, nullif(l ->> 'cnae', ''),
         coalesce(array(select jsonb_array_elements_text(l -> 'cnaes_secundarios')), '{}'),
         left(nullif(l ->> 'logradouro', ''), 160), left(nullif(l ->> 'numero', ''), 20),
         left(nullif(l ->> 'complemento', ''), 120), left(nullif(l ->> 'bairro', ''), 80), nullif(l ->> 'cep', ''),
         l ->> 'cidade', coalesce(nullif(l ->> 'uf', ''), 'GO'),
         case when (l ->> 'lat') is not null and (l ->> 'lng') is not null
              then extensions.st_setsrid(extensions.st_makepoint((l ->> 'lng')::float8, (l ->> 'lat')::float8), 4326)::extensions.geography
         end,
         nullif(l ->> 'precisao', ''), nullif(l ->> 'porte', ''), nullif(l ->> 'natureza', ''),
         nullif(l ->> 'capital_social', '')::numeric, left(nullif(l ->> 'telefone', ''), 40),
         left(nullif(l ->> 'email', ''), 160), coalesce((l ->> 'na_praca')::boolean, true),
         coalesce((l ->> 'agencia')::boolean, false), coalesce((l ->> 'mei')::boolean, false), p_mes, 'ativa', null, now()
    from (select distinct on (x ->> 'cnpj') x as l from jsonb_array_elements(p_linhas) x) d
   where (l ->> 'cnpj') ~ '^[0-9A-Z]{12}[0-9]{2}$' and coalesce(l ->> 'nome', '') <> '' and coalesce(l ->> 'cidade', '') <> '';
  get diagnostics n = row_count;

  insert into privado.empresas_vistas (mes, cnpj)
  select p_mes, t.cnpj from pg_temp.lote_receita t
  on conflict do nothing;

  -- só o que é novo ou mudou: a empresa igual à do banco (e ativa) nem é tocada
  insert into privado.empresas_receita as e (
    cnpj, cnpj_basico, matriz, nome, razao_social, busca, data_abertura, cnae, cnaes_secundarios, logradouro, numero,
    complemento, bairro, cep, cidade, uf, local, precisao, porte, natureza, capital_social, telefone, email, na_praca,
    agencia, mei, mes_carga, situacao, fora_em, atualizado_em)
  select t.cnpj, t.cnpj_basico, t.matriz, t.nome, t.razao_social, t.busca, t.data_abertura, t.cnae,
         t.cnaes_secundarios, t.logradouro, t.numero, t.complemento, t.bairro, t.cep, t.cidade, t.uf, t.local,
         t.precisao, t.porte, t.natureza, t.capital_social, t.telefone, t.email, t.na_praca, t.agencia, t.mei,
         t.mes_carga, t.situacao, t.fora_em, t.atualizado_em
    from pg_temp.lote_receita t
    left join privado.empresas_receita x on x.cnpj = t.cnpj
   where x.cnpj is null
      or x.situacao <> 'ativa'
      or (x.cnpj_basico, x.matriz, x.nome, x.razao_social, x.busca, x.data_abertura, x.cnae, x.cnaes_secundarios,
          x.logradouro, x.numero, x.complemento, x.bairro, x.cep, x.cidade, x.uf, x.porte, x.natureza,
          x.capital_social, x.telefone, x.email, x.na_praca, x.agencia, x.mei)
         is distinct from
         (t.cnpj_basico, t.matriz, t.nome, t.razao_social, t.busca, t.data_abertura, t.cnae, t.cnaes_secundarios,
          t.logradouro, t.numero, t.complemento, t.bairro, t.cep, t.cidade, t.uf, t.porte, t.natureza,
          t.capital_social, t.telefone, t.email, t.na_praca, t.agencia, t.mei)
      -- o ponto só conta quando veio um (sem ponto, fica o que já estava)
      or (t.local is not null and (extensions.st_asbinary(x.local) is distinct from extensions.st_asbinary(t.local)
                                   or x.precisao is distinct from t.precisao))
  on conflict (cnpj) do update
    set cnpj_basico = excluded.cnpj_basico, matriz = excluded.matriz, nome = excluded.nome,
        razao_social = excluded.razao_social, busca = excluded.busca, data_abertura = excluded.data_abertura,
        cnae = excluded.cnae, cnaes_secundarios = excluded.cnaes_secundarios, logradouro = excluded.logradouro,
        numero = excluded.numero, complemento = excluded.complemento, bairro = excluded.bairro, cep = excluded.cep,
        cidade = excluded.cidade, uf = excluded.uf, local = coalesce(excluded.local, e.local),
        precisao = case when excluded.local is null then e.precisao else excluded.precisao end,
        porte = excluded.porte, natureza = excluded.natureza, capital_social = excluded.capital_social,
        telefone = excluded.telefone, email = excluded.email, na_praca = excluded.na_praca, agencia = excluded.agencia,
        mei = excluded.mei, mes_carga = excluded.mes_carga, situacao = 'ativa', fora_em = null, atualizado_em = now();
  return n;
end
$$;
revoke execute on function public.servidor_empresas_lote(text, date, jsonb) from public;
grant execute on function public.servidor_empresas_lote(text, date, jsonb) to anon, authenticated, service_role;

create or replace function public.servidor_empresas_fim(p_chave text, p_mes date, p_resumo jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fora integer := 0;
  v_ativas integer;
  v_vistas integer;
begin
  perform privado.exigir_servidor(p_chave);
  if not exists (select 1 from privado.cargas_receita c where c.mes = p_mes) then
    raise exception 'Essa carga não começou.' using errcode = 'P0002';
  end if;
  select count(*) into v_vistas from privado.empresas_vistas v where v.mes = p_mes;
  select count(*) into v_ativas from privado.empresas_receita e where e.situacao = 'ativa';
  if v_vistas < v_ativas / 2 then
    raise exception 'A carga de % trouxe % empresas e há % ativas: parece incompleta. Mande todos os lotes de novo.',
      to_char(p_mes, 'MM/YYYY'), v_vistas, v_ativas using errcode = '22023';
  end if;
  -- quem não veio nesta carga fechou, deixou de estar ativo ou saiu da conta (o MEI): fica marcado, não some
  update privado.empresas_receita e set situacao = 'fora', fora_em = now()
   where e.situacao = 'ativa'
     and not exists (select 1 from privado.empresas_vistas v where v.mes = p_mes and v.cnpj = e.cnpj);
  get diagnostics v_fora = row_count;
  -- as contagens do MEI de cargas antigas saem (as desta vieram por servidor_empresas_meis)
  delete from privado.mei_por_bairro m where m.mes_carga < p_mes;
  -- a lista de quem veio já serviu (a de meses antigos também)
  delete from privado.empresas_vistas v where v.mes <= p_mes;
  select count(*) into v_ativas from privado.empresas_receita e where e.situacao = 'ativa';
  update privado.cargas_receita c
     set situacao = 'pronta', terminou_em = now(), estabelecimentos = v_ativas,
         resumo = coalesce(p_resumo, '{}'::jsonb) || jsonb_build_object('fora', v_fora)
   where c.mes = p_mes;
  return jsonb_build_object('ativas', v_ativas, 'fora', v_fora);
end
$$;
revoke execute on function public.servidor_empresas_fim(text, date, jsonb) from public;
grant execute on function public.servidor_empresas_fim(text, date, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
