-- A garantia acompanhada com o cliente (10/11/2026; claude/plano-planos-empresa-e-agencia.md, etapa 2, recurso 3).
-- Rode depois de 20270409120000_relatorio_do_cliente.sql. Pode rodar de novo.
--
-- A colocação (20261019280000) já guarda o início e a garantia em dias, e a agência marca à mão quando a pessoa sai
-- (reposição). Com o Plano Agência (ou a cortesia), o Publike pergunta ao cliente, 7 dias antes de a garantia
-- acabar, se a pessoa continua: o cliente responde por um link, sem conta. "Saiu" marca a saída na colocação (é
-- reposição, dentro da garantia) e avisa a agência; "Continua" avisa também. Cliente sem e-mail: a agência recebe o
-- lembrete para perguntar ela mesma.

-- 1. Cada pergunta ao cliente (uma por colocação)
create table if not exists privado.garantias_cliente (
  anuncio_id uuid not null,
  perfil_id uuid not null,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  fim date not null,
  enviado_em timestamptz not null default now(),
  por_email boolean not null default false,
  resposta text check (resposta in ('continua', 'saiu')),
  respondida_em timestamptz,
  primary key (anuncio_id, perfil_id),
  foreign key (anuncio_id, perfil_id) references public.colocacoes (anuncio_id, perfil_id) on delete cascade
);
alter table privado.garantias_cliente enable row level security;
revoke all on privado.garantias_cliente from public, anon, authenticated;

-- 2. O e-mail ao cliente (o admin edita em Admin › E-mails)
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
values ('garantia_cliente', 'usuarios', 95, 'Garantia: a pessoa continua?',
        'Para o cliente da agência com o Plano Agência, 7 dias antes de a garantia da contratação acabar: a pessoa continua? O cliente responde pelo link, sem conta.',
        array['nome', 'agencia', 'pessoa', 'vaga', 'fim', 'link'],
        '{{pessoa}} continua com vocês?',
        E'Oi, {{nome}}.\n\nA garantia da contratação de {{pessoa}} ({{vaga}}), feita por {{agencia}}, vai até {{fim}}.\n\nEstá tudo certo? Responda com um toque: se a pessoa saiu, {{agencia}} fica sabendo na hora e cuida da reposição.',
        'Responder',
        '{{pessoa}} continua com vocês?',
        E'Oi, {{nome}}.\n\nA garantia da contratação de {{pessoa}} ({{vaga}}), feita por {{agencia}}, vai até {{fim}}.\n\nEstá tudo certo? Responda com um toque: se a pessoa saiu, {{agencia}} fica sabendo na hora e cuida da reposição.',
        'Responder')
on conflict (chave) do nothing;

-- 3. As filas: as garantias que acabam em até 7 dias (e não acabaram há mais de 3), de agência com o plano
create or replace function public.servidor_perguntar_garantias(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
  v_token text;
  v_fim date;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_email text;
begin
  perform privado.exigir_servidor(p_chave);
  for r in
    select k.anuncio_id, k.perfil_id, k.inicio, k.garantia_dias, a.titulo, a.autor_id,
           c.nome as cliente, c.responsavel, c.email, ag.nome as agencia, pp.nome as pessoa
      from public.colocacoes k
      join public.anuncios a on a.id = k.anuncio_id
      join public.clientes_agencia c on c.id = a.cliente_id
      join public.perfis ag on ag.id = a.autor_id
      join public.perfis pp on pp.id = k.perfil_id
     where k.saiu_em is null and k.garantia_dias > 0
       and k.inicio + k.garantia_dias between hoje - 3 and hoje + 7
       and not exists (select 1 from privado.garantias_cliente g
                        where g.anuncio_id = k.anuncio_id and g.perfil_id = k.perfil_id)
       and privado.agencia_com_plano(a.autor_id)
     limit 50
  loop
    v_fim := r.inicio + r.garantia_dias;
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_email := lower(btrim(coalesce(r.email, '')));
    insert into privado.garantias_cliente (anuncio_id, perfil_id, token, fim, por_email)
    values (r.anuncio_id, r.perfil_id, v_token, v_fim, privado.email_valido(v_email));
    if privado.email_valido(v_email) then
      insert into privado.fila_emails (modelo, para, dados)
      values ('garantia_cliente', v_email, jsonb_build_object(
        'nome', coalesce(nullif(btrim(r.responsavel), ''), r.cliente),
        'agencia', r.agencia,
        'pessoa', split_part(btrim(r.pessoa), ' ', 1),
        'vaga', r.titulo,
        'fim', to_char(v_fim, 'DD/MM/YYYY'),
        'caminho', '/garantia/' || v_token));
    else
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (r.autor_id, 'contratacao', r.anuncio_id,
              left('A garantia de ' || split_part(btrim(r.pessoa), ' ', 1) || ' (' || r.titulo || ') vai até '
                   || to_char(v_fim, 'DD/MM') || '. ' || r.cliente
                   || ' não tem e-mail no cadastro: pergunte se está tudo certo.', 300));
    end if;
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.servidor_perguntar_garantias(text) from public;
grant execute on function public.servidor_perguntar_garantias(text) to anon, authenticated, service_role;

-- 4. O cliente, pelo link (sem conta): o que é perguntado e a resposta
create or replace function public.garantia_por_link(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'agencia', ag.nome, 'agencia_foto', ag.foto, 'cliente', c.nome, 'vaga', a.titulo,
    'pessoa', split_part(btrim(pp.nome), ' ', 1), 'fim', g.fim, 'resposta', g.resposta,
    'respondida_em', g.respondida_em)
    from privado.garantias_cliente g
    join public.anuncios a on a.id = g.anuncio_id
    join public.clientes_agencia c on c.id = a.cliente_id
    join public.perfis ag on ag.id = a.autor_id
    join public.perfis pp on pp.id = g.perfil_id
   where coalesce(p_token, '') ~ '^[0-9a-f]{64}$' and g.token = p_token
$$;

create or replace function public.responder_garantia(p_token text, p_resposta text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g privado.garantias_cliente;
  v_autor uuid;
  v_titulo text;
  v_cliente text;
  v_pessoa text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' or p_resposta not in ('continua', 'saiu') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  select * into g from privado.garantias_cliente x where x.token = p_token for update;
  if g.token is null then
    raise exception 'Este link não vale.' using errcode = 'P0002';
  end if;
  if g.resposta is not null then
    return jsonb_build_object('resposta', g.resposta, 'ja_respondido', true);
  end if;
  update privado.garantias_cliente set resposta = p_resposta, respondida_em = now()
   where anuncio_id = g.anuncio_id and perfil_id = g.perfil_id;
  select a.autor_id, a.titulo, c.nome, split_part(btrim(pp.nome), ' ', 1)
    into v_autor, v_titulo, v_cliente, v_pessoa
    from public.anuncios a
    join public.clientes_agencia c on c.id = a.cliente_id
    join public.perfis pp on pp.id = g.perfil_id
   where a.id = g.anuncio_id;
  if p_resposta = 'saiu' then
    -- a saída dentro da garantia é reposição (a colocação já conta assim)
    update public.colocacoes set saiu_em = greatest(inicio, least(hoje, g.fim)), atualizado_em = now()
     where anuncio_id = g.anuncio_id and perfil_id = g.perfil_id and saiu_em is null;
  end if;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
  values (v_autor, 'contratacao', g.anuncio_id,
          left(case when p_resposta = 'saiu'
                    then v_cliente || ' avisou que ' || v_pessoa || ' saiu (' || v_titulo
                         || '), dentro da garantia: é reposição. Reabra a vaga ou chame outro finalista.'
                    else v_cliente || ' confirmou que ' || v_pessoa || ' continua (' || v_titulo
                         || '). Garantia cumprida.' end, 300));
  return jsonb_build_object('resposta', p_resposta, 'ja_respondido', false);
end
$$;

revoke execute on function public.garantia_por_link(text), public.responder_garantia(text, text) from public;
grant execute on function public.garantia_por_link(text), public.responder_garantia(text, text)
  to anon, authenticated;

-- 5. A agência: como está a pergunta de cada colocação (para Contratados)
create or replace function public.garantias_da_conta()
returns table (anuncio_id uuid, perfil_id uuid, fim date, enviado_em timestamptz, por_email boolean,
               resposta text, respondida_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.anuncio_id, g.perfil_id, g.fim, g.enviado_em, g.por_email, g.resposta, g.respondida_em
    from privado.garantias_cliente g
    join public.anuncios a on a.id = g.anuncio_id
   where a.autor_id = (select public.conta_atual())
$$;
revoke execute on function public.garantias_da_conta() from public, anon;
grant execute on function public.garantias_da_conta() to authenticated;

notify pgrst, 'reload schema';
