-- Publicar pelo WhatsApp (19/11/2026; claude/plano-vagas-novas.md, item 3). Marcelo: "Gostei, implemente", "torne esse
-- motor que lê as imagens ainda melhor", "tem que ser bem completo e fácil.. e mostrar indicadores e permitir
-- personalização do recurso". A empresa manda para o número do Publike a foto do anúncio, o PDF ou o texto da vaga; a IA
-- lê (src/lib/ia/ler-vagas.ts) e o atendimento devolve o resumo com o botão "Conferir e publicar", que abre o publicar
-- já preenchido. Publicada a vaga, o WhatsApp avisa que está no ar e oferece mandar os candidatos por lá (o toque no
-- botão é o aceite). Como é a empresa que escreve primeiro, a resposta vai na janela de 24 horas, sem modelo da Meta.
--
--   1. privado.config_whatsapp: o recurso liga e desliga e se ajusta em Admin › Publicar pelo WhatsApp (fotos, PDF e
--      texto; vagas por mensagem; leituras por número por dia; o aviso de "está no ar"; a oferta dos avisos; a chamada
--      no site; os textos das respostas).
--   2. privado.whatsapp_midias: a foto ou o PDF que chegou (só o id da Meta, que vale 30 dias; a imagem não fica
--      guardada). O atendimento junta as fotos seguidas e lê todas de uma vez.
--   3. privado.whatsapp_leituras: cada leitura e o que deu (vaga, serviço, currículo, golpe, outra coisa, falha ou o
--      limite do dia), para os números do Admin.
--   4. privado.whatsapp_vagas: cada vaga lida, com o link (token) que abre o publicar preenchido; as vagas da mesma
--      mensagem formam um lote (a página /publicar/whatsapp/<token> mostra todas). Abrir o link e publicar ficam
--      marcados.
--   5. whatsapp_permissoes aceita a origem 'whatsapp' (o "Sim, quero receber" depois de publicar).
--
-- Pode rodar de novo.

-- 1. A configuração ---------------------------------------------------------------------------------------------------

alter table privado.config_whatsapp
  add column if not exists vagas_ligado boolean not null default true,
  add column if not exists vagas_fotos boolean not null default true,
  add column if not exists vagas_pdf boolean not null default true,
  add column if not exists vagas_texto boolean not null default true,
  -- todas as vagas que a IA lê (até 10) já vêm preparadas; o Admin pode baixar
  add column if not exists vagas_por_mensagem integer not null default 10,
  add column if not exists vagas_leituras_dia integer not null default 10,
  add column if not exists vagas_confirmar boolean not null default true,
  add column if not exists vagas_oferecer_avisos boolean not null default true,
  add column if not exists vagas_no_site boolean not null default true,
  add column if not exists vagas_textos jsonb not null default '{}'::jsonb;
alter table privado.config_whatsapp drop constraint if exists config_whatsapp_vagas_check;
alter table privado.config_whatsapp add constraint config_whatsapp_vagas_check check (
  vagas_por_mensagem between 1 and 10
  and vagas_leituras_dia between 1 and 50
  and jsonb_typeof(vagas_textos) = 'object'
  and octet_length(vagas_textos::text) <= 8000
);

-- 2. As fotos e os PDFs que chegam -------------------------------------------------------------------------------------

create table if not exists privado.whatsapp_midias (
  wamid text primary key,
  -- a ordem de chegada (no empate da hora)
  n bigint generated always as identity,
  conversa text not null,
  tipo text not null check (tipo in ('imagem', 'pdf')),
  midia_id text not null check (char_length(midia_id) between 1 and 200),
  mime text,
  legenda text,
  criado_em timestamptz not null default now(),
  lida_em timestamptz
);
create index if not exists whatsapp_midias_conversa_idx on privado.whatsapp_midias (conversa, criado_em desc);
alter table privado.whatsapp_midias enable row level security;
revoke all on privado.whatsapp_midias from public, anon, authenticated;

-- 3. As leituras -----------------------------------------------------------------------------------------------------

create table if not exists privado.whatsapp_leituras (
  id bigint generated always as identity primary key,
  conversa text not null,
  numero text not null,
  fonte text not null check (fonte in ('foto', 'pdf', 'texto')),
  resultado text not null
    check (resultado in ('vaga', 'servico', 'curriculo', 'golpe', 'outro', 'falhou', 'limite', 'grande')),
  vagas integer not null default 0 check (vagas between 0 and 20),
  empresa text check (empresa is null or char_length(empresa) <= 120),
  motivo text check (motivo is null or char_length(motivo) <= 300),
  ms integer,
  criado_em timestamptz not null default now()
);
create index if not exists whatsapp_leituras_criado_idx on privado.whatsapp_leituras (criado_em desc);
create index if not exists whatsapp_leituras_conversa_idx on privado.whatsapp_leituras (conversa, criado_em desc);
alter table privado.whatsapp_leituras enable row level security;
revoke all on privado.whatsapp_leituras from public, anon, authenticated;

-- 4. As vagas preparadas ---------------------------------------------------------------------------------------------

create table if not exists privado.whatsapp_vagas (
  id uuid primary key default gen_random_uuid(),
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  leitura_id bigint references privado.whatsapp_leituras (id) on delete set null,
  lote uuid not null,
  ordem smallint not null default 1,
  conversa text not null,
  numero text not null,
  empresa text check (empresa is null or char_length(empresa) <= 120),
  rascunho jsonb not null,
  criado_em timestamptz not null default now(),
  aberta_em timestamptz,
  publicada_em timestamptz,
  anuncio_id uuid references public.anuncios (id) on delete set null,
  conta_id uuid references public.perfis (id) on delete set null,
  -- o "Sua vaga está no ar" saiu pelo WhatsApp (uma vez por vaga)
  confirmada_em timestamptz,
  constraint whatsapp_vagas_token_check check (token ~ '^[0-9a-f]{64}$'),
  constraint whatsapp_vagas_rascunho_check
    check (jsonb_typeof(rascunho) = 'object' and octet_length(rascunho::text) <= 12000)
);
create index if not exists whatsapp_vagas_lote_idx on privado.whatsapp_vagas (lote, ordem);
create index if not exists whatsapp_vagas_criado_idx on privado.whatsapp_vagas (criado_em desc);
create index if not exists whatsapp_vagas_conversa_idx on privado.whatsapp_vagas (conversa, criado_em desc);
alter table privado.whatsapp_vagas enable row level security;
revoke all on privado.whatsapp_vagas from public, anon, authenticated;

-- 5. O aceite pelo botão do WhatsApp ----------------------------------------------------------------------------------

alter table privado.whatsapp_permissoes drop constraint if exists whatsapp_permissoes_origem_check;
alter table privado.whatsapp_permissoes add constraint whatsapp_permissoes_origem_check
  check (origem in ('avisos', 'curtir', 'quadro', 'cadastro', 'publicar', 'curriculo', 'painel', 'email', 'whatsapp'));

-- 6. As funções do robô (com a chave do servidor) ----------------------------------------------------------------------

-- o que vale agora (o recurso só roda com o WhatsApp e o atendimento ligados)
-- (volatile, não stable: a conferência da chave do servidor marca o uso, e o PostgREST roda as stable só para leitura)
create or replace function public.servidor_whatsapp_vagas_config(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_whatsapp;
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_whatsapp where id;
  if not found then
    return jsonb_build_object('ligado', false);
  end if;
  return jsonb_build_object(
    'ligado', c.ativo and coalesce(c.atendimento_ligado, false) and c.vagas_ligado,
    'fotos', c.vagas_fotos,
    'pdf', c.vagas_pdf,
    'texto', c.vagas_texto,
    'por_mensagem', c.vagas_por_mensagem,
    'leituras_dia', c.vagas_leituras_dia,
    'confirmar', c.vagas_confirmar,
    'oferecer_avisos', c.vagas_oferecer_avisos,
    'textos', c.vagas_textos);
end
$$;

-- a foto ou o PDF que chegou (o webhook guarda antes de o atendimento responder)
create or replace function public.servidor_whatsapp_midia(
  p_chave text, p_wamid text, p_numero text, p_tipo text, p_midia text, p_mime text default null,
  p_legenda text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(p_wamid, '') = '' or coalesce(p_midia, '') = '' or p_tipo not in ('imagem', 'pdf') then
    return;
  end if;
  insert into privado.whatsapp_midias (wamid, conversa, tipo, midia_id, mime, legenda)
  values (left(p_wamid, 200), privado.chave_do_numero(p_numero), p_tipo, left(p_midia, 200), left(p_mime, 100),
          nullif(left(btrim(coalesce(p_legenda, '')), 1000), ''))
  on conflict (wamid) do nothing;
  -- o id da Meta vale 30 dias
  delete from privado.whatsapp_midias m where m.criado_em < now() - interval '30 days';
end
$$;

-- as fotos e os PDFs desta vez: os que ainda não foram lidos, dos últimos 30 minutos (no máximo 6, os mais antigos
-- primeiro), e quantas leituras o número já fez nas últimas 24 horas
create or replace function public.servidor_whatsapp_midias_da_vez(p_chave text, p_conversa text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return jsonb_build_object(
    'midias', coalesce((
      select jsonb_agg(jsonb_build_object('wamid', x.wamid, 'tipo', x.tipo, 'midia', x.midia_id, 'mime', x.mime,
                                          'legenda', x.legenda) order by x.criado_em, x.n)
        from (select m.* from privado.whatsapp_midias m
               where m.conversa = p_conversa and m.lida_em is null and m.criado_em > now() - interval '30 minutes'
               order by m.criado_em, m.n limit 6) x), '[]'::jsonb),
    'leituras_hoje', (select count(*) from privado.whatsapp_leituras l
                       where l.conversa = p_conversa and l.criado_em > now() - interval '24 hours'
                         and l.resultado not in ('limite', 'grande')));
end
$$;

-- guarda a leitura e as vagas lidas (um lote, cada uma com o seu link); as fotos e os PDFs ficam como lidos
create or replace function public.servidor_whatsapp_leitura(
  p_chave text, p_conversa text, p_numero text, p_fonte text, p_resultado text, p_empresa text default null,
  p_motivo text default null, p_ms integer default null, p_vagas jsonb default '[]'::jsonb,
  p_midias text[] default '{}'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_leitura bigint;
  v_lote uuid := gen_random_uuid();
  v_vaga jsonb;
  v_ordem integer := 0;
  v_token text;
  v_lista jsonb := '[]'::jsonb;
  v_empresa text := nullif(left(btrim(coalesce(p_empresa, '')), 120), '');
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.whatsapp_leituras (conversa, numero, fonte, resultado, vagas, empresa, motivo, ms)
  values (p_conversa, regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'), p_fonte, p_resultado,
          case when p_resultado = 'vaga' and jsonb_typeof(p_vagas) = 'array' then least(jsonb_array_length(p_vagas), 10) else 0 end,
          v_empresa, nullif(left(btrim(coalesce(p_motivo, '')), 300), ''), p_ms)
  returning id into v_leitura;
  if cardinality(coalesce(p_midias, '{}')) > 0 then
    update privado.whatsapp_midias m set lida_em = now()
     where m.conversa = p_conversa and m.wamid = any (p_midias) and m.lida_em is null;
  end if;
  if p_resultado = 'vaga' and jsonb_typeof(p_vagas) = 'array' then
    for v_vaga in select value from jsonb_array_elements(p_vagas) limit 10 loop
      continue when jsonb_typeof(v_vaga) <> 'object' or octet_length(v_vaga::text) > 12000;
      v_ordem := v_ordem + 1;
      insert into privado.whatsapp_vagas (leitura_id, lote, ordem, conversa, numero, empresa, rascunho)
      values (v_leitura, v_lote, v_ordem, p_conversa, regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'),
              v_empresa, v_vaga)
      returning token into v_token;
      v_lista := v_lista || jsonb_build_object('token', v_token, 'titulo', v_vaga ->> 'titulo');
    end loop;
  end if;
  -- o que foi lido fica 30 dias (o tempo do link) e depois só o cargo, para os números; tudo sai em 180 dias, como as
  -- mensagens da conversa (/privacidade)
  update privado.whatsapp_vagas v
     set rascunho = jsonb_build_object('titulo', left(coalesce(v.rascunho ->> 'titulo', ''), 120))
   where v.criado_em < now() - interval '30 days' and v.rascunho ? 'descricao';
  delete from privado.whatsapp_vagas v where v.criado_em < now() - interval '180 days';
  delete from privado.whatsapp_leituras l where l.criado_em < now() - interval '180 days';
  return jsonb_build_object('leitura', v_leitura, 'lote', v_lote, 'vagas', v_lista);
end
$$;

-- publicada pelo link: o que o "Sua vaga está no ar" precisa (uma vez por vaga; null quando já saiu ou não vale)
create or replace function public.servidor_whatsapp_vaga_publicada(p_chave text, p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v privado.whatsapp_vagas;
  cv privado.whatsapp_conversas;
  v_titulo text;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.whatsapp_vagas x set confirmada_em = now()
   where x.token = p_token and x.publicada_em is not null and x.anuncio_id is not null and x.confirmada_em is null
  returning * into v;
  if not found then
    return null;
  end if;
  select * into cv from privado.whatsapp_conversas c where c.chave = v.conversa;
  select a.titulo into v_titulo from public.anuncios a where a.id = v.anuncio_id;
  return jsonb_build_object(
    'id', v.id,
    'numero', coalesce(cv.numero, v.numero),
    'conversa', v.conversa,
    'anuncio_id', v.anuncio_id,
    'titulo', coalesce(v_titulo, v.rascunho ->> 'titulo'),
    'conta_id', v.conta_id,
    -- a janela de 24 horas da Meta (com folga): sem ela, a mensagem livre não sai
    'na_janela', coalesce(cv.ultima_da_pessoa_em > now() - interval '23 hours', false),
    'situacao', cv.situacao,
    'restantes', (select count(*) from privado.whatsapp_vagas o where o.lote = v.lote and o.publicada_em is null),
    'ja_recebe', exists (select 1 from privado.whatsapp_permissoes w
                          where w.conta_id = v.conta_id and w.cancelado_em is null));
end
$$;

-- o "Sim, quero receber" depois de publicar: o aceite dos avisos pelo WhatsApp, com o número da conversa
create or replace function public.servidor_whatsapp_aceite_pela_vaga(p_chave text, p_conversa text, p_vaga uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v privado.whatsapp_vagas;
  v_numero text;
begin
  perform privado.exigir_servidor(p_chave);
  select * into v from privado.whatsapp_vagas x where x.id = p_vaga and x.conversa = p_conversa;
  if not found or v.conta_id is null then
    return jsonb_build_object('ok', false);
  end if;
  select c.numero into v_numero from privado.whatsapp_conversas c where c.chave = p_conversa;
  v_numero := regexp_replace(coalesce(v_numero, v.numero), '\D', '', 'g');
  if v_numero !~ '^55[1-9][0-9][0-9]{8,9}$' then
    return jsonb_build_object('ok', false);
  end if;
  insert into privado.whatsapp_permissoes as w (conta_id, numero, origem, aceito_em, cancelado_em)
  values (v.conta_id, v_numero, 'whatsapp', now(), null)
  on conflict (conta_id) do update
    set numero = excluded.numero, origem = excluded.origem, aceito_em = now(), cancelado_em = null,
        cancelado_por = null;
  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.servidor_whatsapp_vagas_config(text),
  public.servidor_whatsapp_midia(text, text, text, text, text, text, text),
  public.servidor_whatsapp_midias_da_vez(text, text),
  public.servidor_whatsapp_leitura(text, text, text, text, text, text, text, integer, jsonb, text[]),
  public.servidor_whatsapp_vaga_publicada(text, text),
  public.servidor_whatsapp_aceite_pela_vaga(text, text, uuid) from public;
grant execute on function public.servidor_whatsapp_vagas_config(text),
  public.servidor_whatsapp_midia(text, text, text, text, text, text, text),
  public.servidor_whatsapp_midias_da_vez(text, text),
  public.servidor_whatsapp_leitura(text, text, text, text, text, text, text, integer, jsonb, text[]),
  public.servidor_whatsapp_vaga_publicada(text, text),
  public.servidor_whatsapp_aceite_pela_vaga(text, text, uuid) to anon, authenticated, service_role;

-- 7. O link (sem entrar): a vaga, o lote e o publicar ------------------------------------------------------------------

-- a vaga do link (30 dias); abrir fica marcado
create or replace function public.vaga_do_whatsapp(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v privado.whatsapp_vagas;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  update privado.whatsapp_vagas x set aberta_em = coalesce(x.aberta_em, now())
   where x.token = p_token and x.criado_em > now() - interval '30 days'
  returning * into v;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'empresa', v.empresa,
    'rascunho', v.rascunho,
    'ordem', v.ordem,
    'total', (select count(*) from privado.whatsapp_vagas o where o.lote = v.lote),
    'publicada', v.publicada_em is not null,
    'anuncio_id', v.anuncio_id);
end
$$;

-- as vagas da mesma mensagem (a página do lote)
create or replace function public.lote_do_whatsapp(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v privado.whatsapp_vagas;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into v from privado.whatsapp_vagas x where x.token = p_token and x.criado_em > now() - interval '30 days';
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'empresa', v.empresa,
    'criado_em', v.criado_em,
    'vagas', (select coalesce(jsonb_agg(jsonb_build_object('token', o.token, 'ordem', o.ordem, 'rascunho', o.rascunho,
                                                          'publicada', o.publicada_em is not null,
                                                          'anuncio_id', o.anuncio_id) order by o.ordem), '[]'::jsonb)
                from privado.whatsapp_vagas o where o.lote = v.lote));
end
$$;

-- publicou pelo link: a vaga fica ligada ao anúncio e à conta (só o anúncio de quem está publicando)
create or replace function public.publicar_vaga_do_whatsapp(p_token text, p_anuncio uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  v privado.whatsapp_vagas;
begin
  if eu is null or coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = eu) then
    return null;
  end if;
  update privado.whatsapp_vagas x
     set publicada_em = coalesce(x.publicada_em, now()),
         anuncio_id = coalesce(x.anuncio_id, p_anuncio),
         conta_id = coalesce(x.conta_id, eu),
         aberta_em = coalesce(x.aberta_em, now())
   where x.token = p_token and x.criado_em > now() - interval '30 days'
  returning * into v;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v.id,
    'restantes', (select count(*) from privado.whatsapp_vagas o where o.lote = v.lote and o.publicada_em is null));
end
$$;

revoke execute on function public.vaga_do_whatsapp(text), public.lote_do_whatsapp(text),
  public.publicar_vaga_do_whatsapp(text, uuid) from public;
grant execute on function public.vaga_do_whatsapp(text), public.lote_do_whatsapp(text)
  to anon, authenticated, service_role;
grant execute on function public.publicar_vaga_do_whatsapp(text, uuid) to authenticated, service_role;

-- a chamada "Mande a vaga pelo WhatsApp" no site (/empresas e /publicar): só com tudo ligado
create or replace function public.whatsapp_vagas_no_site()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.ativo and coalesce(c.atendimento_ligado, false) and c.vagas_ligado and c.vagas_no_site
                     from privado.config_whatsapp c where c.id), false)
$$;
revoke execute on function public.whatsapp_vagas_no_site() from public;
grant execute on function public.whatsapp_vagas_no_site() to anon, authenticated, service_role;

-- 8. O Admin: os números e a configuração ------------------------------------------------------------------------------

create or replace function public.admin_whatsapp_vagas(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dias integer := least(greatest(coalesce(p_dias, 30), 1), 365);
  desde timestamptz := now() - make_interval(days => dias);
  c privado.config_whatsapp;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  select * into c from privado.config_whatsapp where id;
  return jsonb_build_object(
    'dias', dias,
    'config', jsonb_build_object(
      'whatsapp_ligado', coalesce(c.ativo, false),
      'atendimento_ligado', coalesce(c.atendimento_ligado, false),
      'ligado', coalesce(c.vagas_ligado, true),
      'fotos', coalesce(c.vagas_fotos, true),
      'pdf', coalesce(c.vagas_pdf, true),
      'texto', coalesce(c.vagas_texto, true),
      'por_mensagem', coalesce(c.vagas_por_mensagem, 10),
      'leituras_dia', coalesce(c.vagas_leituras_dia, 10),
      'confirmar', coalesce(c.vagas_confirmar, true),
      'oferecer_avisos', coalesce(c.vagas_oferecer_avisos, true),
      'no_site', coalesce(c.vagas_no_site, true),
      'textos', coalesce(c.vagas_textos, '{}'::jsonb)),
    'numeros', (
      select jsonb_build_object(
        'leituras', count(*) filter (where l.resultado not in ('limite')),
        'com_vaga', count(*) filter (where l.resultado = 'vaga'),
        'servico', count(*) filter (where l.resultado = 'servico'),
        'curriculo', count(*) filter (where l.resultado = 'curriculo'),
        'golpe', count(*) filter (where l.resultado = 'golpe'),
        'outro', count(*) filter (where l.resultado = 'outro'),
        'falhou', count(*) filter (where l.resultado = 'falhou'),
        'limite', count(*) filter (where l.resultado in ('limite', 'grande')),
        'fotos', count(*) filter (where l.fonte = 'foto' and l.resultado not in ('limite')),
        'pdfs', count(*) filter (where l.fonte = 'pdf' and l.resultado not in ('limite')),
        'textos', count(*) filter (where l.fonte = 'texto' and l.resultado not in ('limite')),
        'numeros', count(distinct l.conversa),
        'segundos', round((percentile_cont(0.5) within group (order by l.ms) filter (where l.ms is not null))::numeric / 1000, 1))
        from privado.whatsapp_leituras l where l.criado_em >= desde),
    'vagas', (
      select jsonb_build_object(
        'lidas', count(*),
        'abertas', count(*) filter (where v.aberta_em is not null),
        'publicadas', count(*) filter (where v.publicada_em is not null),
        'contas', count(distinct v.conta_id) filter (where v.publicada_em is not null),
        'contas_novas', count(distinct v.conta_id) filter (
          where v.publicada_em is not null
            and exists (select 1 from auth.users u where u.id = v.conta_id and u.created_at >= v.criado_em - interval '10 minutes')),
        'confirmadas', count(*) filter (where v.confirmada_em is not null),
        'minutos', round((percentile_cont(0.5) within group (order by extract(epoch from v.publicada_em - v.criado_em) / 60)
                          filter (where v.publicada_em is not null))::numeric, 0))
        from privado.whatsapp_vagas v where v.criado_em >= desde),
    'aceites', (select count(*) from privado.whatsapp_permissoes w where w.origem = 'whatsapp' and w.aceito_em >= desde
                  and w.cancelado_em is null),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'leituras', d.leituras, 'vagas', d.vagas, 'publicadas', d.publicadas)
                       order by d.dia)
        from (select g.dia::date as dia,
                     (select count(*) from privado.whatsapp_leituras l
                       where (l.criado_em at time zone 'America/Sao_Paulo')::date = g.dia::date
                         and l.resultado not in ('limite')) as leituras,
                     (select count(*) from privado.whatsapp_vagas v
                       where (v.criado_em at time zone 'America/Sao_Paulo')::date = g.dia::date) as vagas,
                     (select count(*) from privado.whatsapp_vagas v
                       where (v.publicada_em at time zone 'America/Sao_Paulo')::date = g.dia::date) as publicadas
                from generate_series((now() at time zone 'America/Sao_Paulo')::date - least(dias, 30) + 1,
                                     (now() at time zone 'America/Sao_Paulo')::date, '1 day') g(dia)) d), '[]'::jsonb),
    'ultimas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em desc)
        from (select v.id, v.criado_em, v.empresa, v.rascunho ->> 'titulo' as titulo, v.ordem,
                     v.aberta_em, v.publicada_em, v.anuncio_id, v.conta_id, v.conversa,
                     privado.whatsapp_mascarado(v.numero) as numero
                from privado.whatsapp_vagas v
               order by v.criado_em desc limit 30) x), '[]'::jsonb),
    'sem_vaga', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em desc)
        from (select l.criado_em, l.fonte, l.resultado, l.motivo, l.conversa
                from privado.whatsapp_leituras l
               where l.resultado not in ('vaga')
               order by l.criado_em desc limit 15) x), '[]'::jsonb));
end
$$;

create or replace function public.admin_salvar_whatsapp_vagas(
  p_ligado boolean, p_fotos boolean, p_pdf boolean, p_texto boolean, p_por_mensagem integer, p_leituras_dia integer,
  p_confirmar boolean, p_oferecer_avisos boolean, p_no_site boolean, p_textos jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_textos jsonb := '{}'::jsonb;
  k text;
  t text;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  -- só os textos conhecidos, cada um até 600 letras (vazio volta ao padrão)
  if jsonb_typeof(p_textos) = 'object' then
    for k, t in select key, value from jsonb_each_text(p_textos) loop
      continue when k not in ('intro', 'fim', 'botao', 'lote', 'botao_lote', 'nao_e_vaga', 'curriculo', 'servico',
                              'golpe', 'no_ar', 'oferta');
      continue when btrim(coalesce(t, '')) = '';
      v_textos := v_textos || jsonb_build_object(k, left(btrim(t), 600));
    end loop;
  end if;
  update privado.config_whatsapp
     set vagas_ligado = coalesce(p_ligado, vagas_ligado),
         vagas_fotos = coalesce(p_fotos, vagas_fotos),
         vagas_pdf = coalesce(p_pdf, vagas_pdf),
         vagas_texto = coalesce(p_texto, vagas_texto),
         vagas_por_mensagem = least(greatest(coalesce(p_por_mensagem, vagas_por_mensagem), 1), 10),
         vagas_leituras_dia = least(greatest(coalesce(p_leituras_dia, vagas_leituras_dia), 1), 50),
         vagas_confirmar = coalesce(p_confirmar, vagas_confirmar),
         vagas_oferecer_avisos = coalesce(p_oferecer_avisos, vagas_oferecer_avisos),
         vagas_no_site = coalesce(p_no_site, vagas_no_site),
         vagas_textos = case when p_textos is null then vagas_textos else v_textos end,
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id;
end
$$;

revoke execute on function public.admin_whatsapp_vagas(integer),
  public.admin_salvar_whatsapp_vagas(boolean, boolean, boolean, boolean, integer, integer, boolean, boolean, boolean, jsonb)
  from public, anon;
grant execute on function public.admin_whatsapp_vagas(integer),
  public.admin_salvar_whatsapp_vagas(boolean, boolean, boolean, boolean, integer, integer, boolean, boolean, boolean, jsonb)
  to authenticated, service_role;

-- a tela na lista de Admin › Quem vê cada tela (só a equipe publike.org)
insert into privado.telas_do_admin (rota, somente_publike) values ('/admin/publicar-pelo-whatsapp', true)
on conflict (rota) do nothing;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270806120000_publicar_pelo_whatsapp');
