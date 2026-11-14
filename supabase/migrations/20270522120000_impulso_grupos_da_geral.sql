-- Os grupos da campanha geral por função e por cidade (14/11/2026, claude/plano-palavras-chave-pelas-funcoes.md).
-- Pedidos do Marcelo: "quero que verifique se tem como adicionar automaticamente e remover palavras chaves de acordo
-- com o site, porque pode entrar uma funcao que nao tem no google ads e sempre usar inteligencia para adicionar titulos
-- correlatos"; "eu quero que funcione assim, talvez um controle no admin, para quantidade de grupos x valor investido";
-- "campanha propria já fizemos e nao deu certo"; "Sempre o valor da diferenca do impulsionado - valor da campanha";
-- "sim, por cidade"; "capricha".
--
-- Dentro da campanha geral (a mesma de `config_impulso.geral_campanha_id`), um grupo para cada função e para cada
-- cidade da praça com vaga no ar. Quantos ficam ligados: a diferença que os pacotes põem no orçamento (o alvo menos a
-- base), dividida pela verba de cada grupo (R$ 10). Entram primeiro as com vaga impulsionada, depois as com mais vagas.
-- O robô (src/lib/servidor/grupos-da-geral.ts) cria, liga e pausa os grupos uma vez por dia; nasce desligado.
--
-- Pode rodar de novo.

alter table privado.config_impulso
  add column if not exists grupos_ligados boolean not null default false,
  add column if not exists grupo_verba numeric(8, 2) not null default 10,
  add column if not exists grupos_entrada smallint not null default 2,
  add column if not exists grupos_feita_em timestamptz,
  add column if not exists grupos_erro text,
  add column if not exists grupos_erro_em timestamptz;
alter table privado.config_impulso drop constraint if exists config_impulso_grupo_verba_check;
alter table privado.config_impulso add constraint config_impulso_grupo_verba_check
  check (grupo_verba >= 10 and grupo_verba <= 1000);
alter table privado.config_impulso drop constraint if exists config_impulso_grupos_entrada_check;
alter table privado.config_impulso add constraint config_impulso_grupos_entrada_check
  check (grupos_entrada between 1 and 50);

create table if not exists privado.grupos_da_geral (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('funcao', 'cidade')),
  -- a CBO da função ou o nome da cidade
  chave text not null,
  nome text not null,
  pagina text not null,
  grupo_id text,
  anuncio_id text,
  -- fora: nunca foi ao Google; ligado; pausado
  situacao text not null default 'fora' check (situacao in ('fora', 'ligado', 'pausado')),
  palavras text[] not null default '{}',
  negativas text[] not null default '{}',
  vagas integer not null default 0,
  impulsionadas integer not null default 0,
  ia_modelo text,
  ia_em timestamptz,
  ligado_em timestamptz,
  pausado_em timestamptz,
  erro text,
  erro_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (tipo, chave)
);
alter table privado.grupos_da_geral enable row level security;
revoke all on privado.grupos_da_geral from public, anon, authenticated;

-- o que o robô e o Admin precisam: a chave, a verba, a conta, os grupos e as funções e cidades com vaga no ar agora
create or replace function privado.grupos_da_geral_dados()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with vagas as (
    select a.id, a.cidade, a.titulo,
           exists (select 1 from public.vagas_impulsionadas() q where q.anuncio_id = a.id) as impulsionada
      from public.anuncios a
     where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
  )
  select jsonb_build_object(
    'ligados', c.grupos_ligados,
    'verba', c.grupo_verba,
    'entrada', c.grupos_entrada,
    'base', c.geral_base,
    'alvo', privado.geral_valor_alvo(),
    'conta', c.geral_conta,
    'campanha_id', c.geral_campanha_id,
    'feita_em', c.grupos_feita_em,
    'erro', c.grupos_erro,
    'erro_em', c.grupos_erro_em,
    'grupos', coalesce((select jsonb_agg(to_jsonb(g) order by g.tipo, g.nome) from privado.grupos_da_geral g), '[]'::jsonb),
    -- por função e cidade (o robô soma as cidades da praça)
    'funcoes', coalesce((select jsonb_agg(jsonb_build_object('cbo', x.cbo, 'cidade', x.cidade, 'vagas', x.vagas,
                                                             'impulsionadas', x.imp, 'titulos', x.titulos))
                           from (select f.cbo, v.cidade, count(*)::int as vagas,
                                        count(*) filter (where v.impulsionada)::int as imp,
                                        -- os títulos das vagas (as impulsionadas primeiro), para o nome do dia a dia
                                        (array_agg(v.titulo order by v.impulsionada desc, v.titulo))[1:3] as titulos
                                   from vagas v join privado.funcoes_das_vagas f on f.anuncio_id = v.id
                                  where f.cbo is not null
                                  group by f.cbo, v.cidade) x), '[]'::jsonb),
    'cidades', coalesce((select jsonb_agg(jsonb_build_object('cidade', x.cidade, 'vagas', x.vagas, 'impulsionadas', x.imp))
                           from (select v.cidade, count(*)::int as vagas, count(*) filter (where v.impulsionada)::int as imp
                                   from vagas v where v.cidade is not null
                                  group by v.cidade) x), '[]'::jsonb))
    from privado.config_impulso c where c.id
$$;

-- para o robô: os dados e se é hora (ligado, uma vez por dia depois das 6h; desligado, só para pausar o que ficou
-- ligado). Depois de um erro, espera 1 hora.
create or replace function public.servidor_grupos_da_geral(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  v_hoje_6h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '06:00') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_impulso where id;
  if c.id is null or c.geral_conta is null or c.geral_campanha_id is null then
    return jsonb_build_object('fazer', false);
  end if;
  return privado.grupos_da_geral_dados() || jsonb_build_object(
    'fazer', (c.grupos_erro_em is null or c.grupos_erro_em < now() - interval '1 hour')
             and ((c.grupos_ligados and (c.grupos_feita_em is null
                                         or (now() >= v_hoje_6h and c.grupos_feita_em < v_hoje_6h)))
                  or (not c.grupos_ligados and exists (select 1 from privado.grupos_da_geral g where g.situacao = 'ligado'))));
end
$$;

-- o robô guarda um grupo (cria a linha na primeira vez; só muda o que veio)
create or replace function public.servidor_grupo_da_geral(p_chave text, p_grupo jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g jsonb := coalesce(p_grupo, '{}'::jsonb);
begin
  perform privado.exigir_servidor(p_chave);
  if (g ->> 'tipo') not in ('funcao', 'cidade') or coalesce(g ->> 'chave', '') = '' then
    raise exception 'Grupo sem tipo ou sem chave.';
  end if;
  insert into privado.grupos_da_geral (tipo, chave, nome, pagina)
  values (g ->> 'tipo', g ->> 'chave', coalesce(g ->> 'nome', g ->> 'chave'), coalesce(g ->> 'pagina', '/'))
  on conflict (tipo, chave) do nothing;
  update privado.grupos_da_geral x
     set nome = coalesce(g ->> 'nome', x.nome),
         pagina = coalesce(g ->> 'pagina', x.pagina),
         grupo_id = case when g ? 'grupo_id' then g ->> 'grupo_id' else x.grupo_id end,
         anuncio_id = case when g ? 'anuncio_id' then g ->> 'anuncio_id' else x.anuncio_id end,
         situacao = coalesce(g ->> 'situacao', x.situacao),
         palavras = case when g ? 'palavras' then array(select jsonb_array_elements_text(g -> 'palavras')) else x.palavras end,
         negativas = case when g ? 'negativas' then array(select jsonb_array_elements_text(g -> 'negativas')) else x.negativas end,
         vagas = coalesce((g ->> 'vagas')::int, x.vagas),
         impulsionadas = coalesce((g ->> 'impulsionadas')::int, x.impulsionadas),
         ia_modelo = case when g ? 'ia_modelo' then g ->> 'ia_modelo' else x.ia_modelo end,
         ia_em = case when g ? 'ia_modelo' then now() else x.ia_em end,
         ligado_em = case when (g ->> 'situacao') = 'ligado' and x.situacao <> 'ligado' then now() else x.ligado_em end,
         pausado_em = case when (g ->> 'situacao') = 'pausado' and x.situacao <> 'pausado' then now() else x.pausado_em end,
         erro = case when g ? 'erro' then left(g ->> 'erro', 500) else x.erro end,
         erro_em = case when g ? 'erro' then (case when g ->> 'erro' is null then null else now() end) else x.erro_em end
   where x.tipo = g ->> 'tipo' and x.chave = g ->> 'chave';
end
$$;

-- o robô terminou a volta do dia (ou deu erro)
create or replace function public.servidor_grupos_feita(p_chave text, p_erro text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if p_erro is null then
    update privado.config_impulso set grupos_feita_em = now(), grupos_erro = null, grupos_erro_em = null where id;
  else
    update privado.config_impulso set grupos_erro = left(p_erro, 500), grupos_erro_em = now() where id;
  end if;
end
$$;

-- o Admin: os mesmos dados
create or replace function public.admin_grupos_da_geral()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_impulsos_admin();
  return privado.grupos_da_geral_dados();
end
$$;

-- o Admin muda a chave, a verba por grupo e a entrada; o robô age na volta seguinte
create or replace function public.admin_salvar_grupos(p_config jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_verba numeric := (p_config ->> 'verba')::numeric;
  v_entrada integer := (p_config ->> 'entrada')::integer;
begin
  perform privado.exigir_impulsos_admin();
  if v_verba is not null and (v_verba < 10 or v_verba > 1000) then
    return jsonb_build_object('erro', 'A verba por grupo vai de R$ 10 a R$ 1.000 por dia.');
  end if;
  if v_entrada is not null and (v_entrada < 1 or v_entrada > 50) then
    return jsonb_build_object('erro', 'A entrada vai de 1 a 50 vagas no ar.');
  end if;
  update privado.config_impulso
     set grupos_ligados = coalesce((p_config ->> 'ligados')::boolean, grupos_ligados),
         grupo_verba = coalesce(v_verba, grupo_verba),
         grupos_entrada = coalesce(v_entrada, grupos_entrada),
         grupos_feita_em = null, grupos_erro = null, grupos_erro_em = null
   where id;
  perform privado.registrar('grupos_da_geral', 'config', 'impulso', 'Grupos da campanha geral', p_config);
  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function privado.grupos_da_geral_dados() from public, anon, authenticated;
revoke execute on function public.servidor_grupos_da_geral(text), public.servidor_grupo_da_geral(text, jsonb),
  public.servidor_grupos_feita(text, text), public.admin_grupos_da_geral(), public.admin_salvar_grupos(jsonb)
  from public, anon;
grant execute on function public.servidor_grupos_da_geral(text), public.servidor_grupo_da_geral(text, jsonb),
  public.servidor_grupos_feita(text, text) to authenticated, service_role;
grant execute on function public.admin_grupos_da_geral(), public.admin_salvar_grupos(jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
