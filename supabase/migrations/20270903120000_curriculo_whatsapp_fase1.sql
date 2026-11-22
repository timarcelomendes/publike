-- O currículo pelo WhatsApp, o resto da fase 1 (22/11/2026; claude/plano-curriculo-otimizado.md; Marcelo: "Execute" e
-- "Faz", para a pergunta separada depois das vagas). Tudo junto do modo de Admin › Qualificados (desligado, até ligar):
--   1. as perguntas de recrutador guardadas por função (CBO): o robô das filas tira das vagas do Publike daquela função
--      as 5 perguntas que um recrutador daqui faria, e a conversa usa como base (o admin vê e pode mandar refazer);
--   2. o cartão em imagem e o PDF de uma página do currículo montado, pelo token, com o nome do WhatsApp (o PDF com o
--      número, para imprimir e entregar);
--   3. a pergunta separada, uns 10 minutos depois das vagas, para quem não tem currículo pelo número: uma vez só por
--      conversa, dentro das 24 horas, das 8h às 21h, se a pessoa não escreveu nada depois das vagas.
--
-- Pode rodar de novo.

-- 1. As perguntas por função ---------------------------------------------------------------------------------------

create table if not exists privado.perguntas_da_funcao (
  cbo text primary key check (cbo ~ '^[0-9]{6}$'),
  perguntas jsonb not null check (jsonb_typeof(perguntas) = 'array' and octet_length(perguntas::text) <= 4000),
  vagas integer not null default 0,
  modelo text check (modelo is null or char_length(modelo) <= 60),
  gerado_em timestamptz not null default now()
);
alter table privado.perguntas_da_funcao enable row level security;
revoke all on privado.perguntas_da_funcao from public, anon, authenticated;

-- As funções que valem a pena (3 vagas ou mais em 120 dias) sem perguntas, ou com perguntas de mais de 60 dias, com até
-- 8 vagas de exemplo (as mais novas). Com o currículo pelo WhatsApp desligado, nenhuma (nada de gastar com a IA).
create or replace function public.servidor_funcoes_para_perguntas(p_chave text, p_limite integer default 2)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce((select c.curriculo_modo from privado.config_whatsapp c where c.id), 'desligado') = 'desligado' then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(x)
      from (
        select f.cbo, count(*) as vagas,
               (select jsonb_agg(jsonb_build_object('titulo', v.titulo, 'descricao', v.descricao))
                  from (select a2.titulo, left(coalesce(a2.descricao, ''), 700) as descricao
                          from privado.funcoes_das_vagas f2 join public.anuncios a2 on a2.id = f2.anuncio_id
                         where f2.cbo = f.cbo and a2.tipo = 'vaga' and a2.criado_em > now() - interval '120 days'
                         order by a2.criado_em desc limit 8) v) as exemplos
          from privado.funcoes_das_vagas f
          join public.anuncios a on a.id = f.anuncio_id
          left join privado.perguntas_da_funcao p on p.cbo = f.cbo
         where f.cbo is not null and a.tipo = 'vaga' and a.criado_em > now() - interval '120 days'
           and (p.cbo is null or p.gerado_em < now() - interval '60 days')
         group by f.cbo
        having count(*) >= 3
         order by count(*) desc
         limit least(greatest(coalesce(p_limite, 2), 1), 10)
      ) x), '[]'::jsonb);
end
$$;

create or replace function public.servidor_guardar_perguntas_da_funcao(
  p_chave text, p_cbo text, p_perguntas jsonb, p_vagas integer, p_modelo text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.perguntas_da_funcao as t (cbo, perguntas, vagas, modelo, gerado_em)
  values (p_cbo, p_perguntas, coalesce(p_vagas, 0), left(p_modelo, 60), now())
  on conflict (cbo) do update
     set perguntas = excluded.perguntas, vagas = excluded.vagas, modelo = excluded.modelo, gerado_em = now();
end
$$;

-- A conversa: as perguntas guardadas das funções que aparecem no que a pessoa contou
create or replace function public.servidor_perguntas_das_funcoes(p_chave text, p_cbos text[])
returns table (cbo text, perguntas jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select p.cbo, p.perguntas from privado.perguntas_da_funcao p where p.cbo = any (p_cbos[1:5]);
end
$$;
revoke execute on function public.servidor_funcoes_para_perguntas(text, integer),
  public.servidor_guardar_perguntas_da_funcao(text, text, jsonb, integer, text),
  public.servidor_perguntas_das_funcoes(text, text[]) from public;
grant execute on function public.servidor_funcoes_para_perguntas(text, integer),
  public.servidor_guardar_perguntas_da_funcao(text, text, jsonb, integer, text),
  public.servidor_perguntas_das_funcoes(text, text[]) to anon, authenticated, service_role;

-- O admin: as perguntas guardadas e o "Refazer" (o robô gera de novo na próxima rodada)
create or replace function public.admin_perguntas_das_funcoes()
returns table (cbo text, perguntas jsonb, vagas integer, modelo text, gerado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query
  select p.cbo, p.perguntas, p.vagas, p.modelo, p.gerado_em from privado.perguntas_da_funcao p order by p.vagas desc, p.cbo;
end
$$;

create or replace function public.admin_refazer_perguntas_da_funcao(p_cbo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  delete from privado.perguntas_da_funcao where cbo = p_cbo;
end
$$;
revoke execute on function public.admin_perguntas_das_funcoes(), public.admin_refazer_perguntas_da_funcao(text)
  from public, anon;
grant execute on function public.admin_perguntas_das_funcoes(), public.admin_refazer_perguntas_da_funcao(text)
  to authenticated;

-- 2. O cartão e o PDF ------------------------------------------------------------------------------------------------

-- o nome do WhatsApp (pode ser apelido) e o número, só para o cartão e o PDF (o formulário do site não recebe)
alter table privado.curriculos_preparados add column if not exists nome text;
alter table privado.curriculos_preparados add column if not exists telefone text;
alter table privado.curriculos_preparados drop constraint if exists curriculos_preparados_nome;
alter table privado.curriculos_preparados add constraint curriculos_preparados_nome
  check ((nome is null or char_length(nome) <= 80) and (telefone is null or telefone ~ '^[0-9]{10,15}$'));

create or replace function public.servidor_guardar_curriculo_preparado(
  p_chave text, p_conversa text, p_dados jsonb, p_nome text, p_telefone text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.curriculos_preparados (conversa, dados, nome, telefone)
  values (left(p_conversa, 200), p_dados, nullif(left(btrim(coalesce(p_nome, '')), 80), ''),
          nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), ''))
  returning token into v_token;
  return v_token;
end
$$;

-- O último currículo montado na conversa (7 dias), para o "cartão" e o "PDF" escritos depois da prévia
create or replace function public.servidor_ultimo_curriculo_preparado(p_chave text, p_conversa text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select p.token from privado.curriculos_preparados p
           where p.conversa = p_conversa and p.criado_em > now() - interval '7 days'
           order by p.criado_em desc limit 1);
end
$$;
revoke execute on function public.servidor_guardar_curriculo_preparado(text, text, jsonb, text, text),
  public.servidor_ultimo_curriculo_preparado(text, text) from public;
grant execute on function public.servidor_guardar_curriculo_preparado(text, text, jsonb, text, text),
  public.servidor_ultimo_curriculo_preparado(text, text) to anon, authenticated, service_role;

-- O cartão e o PDF (a Meta busca pelo link do token): o currículo, o nome e, só para o PDF, o número. Não conta como
-- "aberto no site".
create or replace function public.curriculo_preparado_para_arquivo(p_token text, p_com_telefone boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('dados', p.dados, 'nome', p.nome,
                            'telefone', case when p_com_telefone then p.telefone end)
    from privado.curriculos_preparados p
   where coalesce(p_token, '') ~ '^[0-9a-f]{64}$' and p.token = p_token and p.criado_em > now() - interval '7 days'
$$;
revoke execute on function public.curriculo_preparado_para_arquivo(text, boolean) from public;
grant execute on function public.curriculo_preparado_para_arquivo(text, boolean) to anon, authenticated, service_role;

-- 3. A pergunta depois das vagas ---------------------------------------------------------------------------------------

-- As conversas de quem procura trabalho em que a última mensagem é a das vagas (tem um dos links curtos de `p_marcas_vagas`:
-- /w/, ou /i/, /f/ e /m/ de quem veio do anúncio), de 10 minutos a 3 horas atrás, a pessoa
-- não escreveu depois, a pergunta (`p_marca_pergunta`) nunca foi, o número não tem currículo e o modo vale para ele.
create or replace function public.servidor_whatsapp_pergunta_curriculo(p_chave text, p_marcas_vagas text[], p_marca_pergunta text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo')::integer;
  v_modo text;
begin
  perform privado.exigir_servidor(p_chave);
  select c.curriculo_modo into v_modo from privado.config_whatsapp c where c.id and c.ativo and c.atendimento_ligado;
  if coalesce(v_modo, 'desligado') = 'desligado' or v_hora < 8 or v_hora >= 21
     or coalesce(array_length(p_marcas_vagas, 1), 0) = 0 or coalesce(p_marca_pergunta, '') = '' then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('chave', x.chave, 'numero', x.numero))
      from (
        select c.chave, c.numero
          from privado.whatsapp_conversas c
          join lateral (select m.de, m.texto, m.criado_em from privado.whatsapp_conversa_mensagens m
                         where m.chave = c.chave order by m.criado_em desc limit 1) u on true
         where c.situacao = 'robo'
           and c.ultima_da_pessoa_em > now() - interval '22 hours'
           and u.de = 'robo'
           and u.criado_em < now() - interval '10 minutes'
           and u.criado_em > now() - interval '3 hours'
           and c.perfil = 'trabalho'
           and exists (select 1 from unnest(p_marcas_vagas) mm where coalesce(mm, '') <> '' and strpos(u.texto, mm) > 0)
           and (v_modo = 'todos' or c.chave = any (privado.whatsapp_chaves_de_teste()))
           and not exists (select 1 from privado.whatsapp_conversa_mensagens m
                            where m.chave = c.chave and m.de = 'robo' and strpos(m.texto, p_marca_pergunta) > 0)
           -- quem já tem currículo pelo número do login ou do contato
           and not exists (select 1 from auth.users au join public.curriculos cv on cv.perfil_id = au.id
                            where coalesce(au.phone::text, '') <> '' and privado.chave_do_numero(au.phone::text) = c.chave)
           and not exists (select 1 from public.contatos ct join public.curriculos cv on cv.perfil_id = ct.perfil_id
                            where coalesce(ct.whatsapp, '') <> '' and privado.chave_do_numero(ct.whatsapp) = c.chave)
         limit 20
      ) x), '[]'::jsonb);
end
$$;
revoke execute on function public.servidor_whatsapp_pergunta_curriculo(text, text[], text) from public;
grant execute on function public.servidor_whatsapp_pergunta_curriculo(text, text[], text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270903120000_curriculo_whatsapp_fase1');
