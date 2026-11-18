-- A API do Publike para o sistema de quem contrata (17/11/2026, Marcelo: "preciso criar api publica para vagas, uma
-- agencia pediu, tem CRM e quer integrar"). Escolhas dele: o CRM recebe os candidatos e muda a etapa; vale para os
-- planos pagos e para as contas grátis, com limite de uso por dia. Pode rodar de novo.
--
--   * A chave: criada em Configurações › API pelo dono da conta ou por um admin da equipe, numa conta que contrata
--     (comércio, empresa ou agência). Aparece uma vez só; aqui fica só o sha256 dela e o começo, para reconhecer na
--     lista. Apagar a chave corta o acesso na hora.
--   * O site (/api/v1, src/lib/servidor/api-publica.ts) lê a chave do pedido e manda o sha256 dela, com a chave do
--     servidor. O banco confere a chave e a conta, conta a chamada no dia de Brasília e recusa acima do limite. A
--     chamada que dá erro não conta (a contagem volta junto com o erro).
--   * O limite: o de graça para todas e um maior nos planos que liberam tudo (os mesmos dos contatos no convite e das
--     visões), em privado.config_api. Lá também dá para desligar a API inteira.
--   * O que sai é o que o painel mostra: só vagas (não os pedidos de serviço), sem as contas suspensas, e o contato do
--     candidato só depois do aceite e fora da moderação (como em meus_candidatos).
--   * Mudar a etapa usa as funções do site (responder_curtida, marcar_motivo_saida e salvar_etapa_candidato): depois de
--     conferir a chave, a função do servidor põe a conta no lugar de quem entrou (request.jwt.claims, só nesta
--     transação). As regras, os avisos ao candidato, o limite de etapas por dia e o "quem respondeu" (empresa) ficam
--     iguais aos do site.

-- 1. O que fica guardado -----------------------------------------------------------------------------------------------

create table if not exists privado.api_chaves (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.perfis (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  -- o começo da chave ("publike_api_3f9a1c"), para reconhecer na lista
  prefixo text not null check (char_length(prefixo) <= 24),
  hash text not null unique check (hash ~ '^[0-9a-f]{64}$'),
  criada_por uuid references public.perfis (id) on delete set null,
  criada_em timestamptz not null default now(),
  usada_em timestamptz,
  apagada_em timestamptz
);
create index if not exists api_chaves_da_conta on privado.api_chaves (conta_id) where apagada_em is null;

-- as chamadas de cada conta por dia (o dia de Brasília), os últimos 60 dias
create table if not exists privado.api_uso (
  conta_id uuid not null references public.perfis (id) on delete cascade,
  dia date not null,
  chamadas integer not null default 0 check (chamadas >= 0),
  primary key (conta_id, dia)
);

create table if not exists privado.config_api (
  id boolean primary key default true check (id),
  ligada boolean not null default true,
  limite_gratis integer not null default 1000 check (limite_gratis between 0 and 1000000),
  limite_plano integer not null default 20000 check (limite_plano between 0 and 1000000),
  chaves_por_conta integer not null default 5 check (chaves_por_conta between 1 and 50)
);
insert into privado.config_api (id) values (true) on conflict (id) do nothing;

alter table privado.api_chaves enable row level security;
alter table privado.api_uso enable row level security;
alter table privado.config_api enable row level security;
revoke all on privado.api_chaves, privado.api_uso, privado.config_api from public, anon, authenticated;

-- 2. O limite -----------------------------------------------------------------------------------------------------------

-- os planos que liberam tudo (assinatura ativa ou 30 dias pagos) e a cortesia do Plano Agência: o limite maior
create or replace function privado.api_com_plano(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.assinaturas a
                  where a.conta_id = p_conta and a.situacao = 'ativa' and privado.libera_tudo(a.recurso))
      or exists (select 1 from privado.cobrancas c
                  where c.conta_id = p_conta and c.situacao = 'paga' and privado.libera_tudo(c.recurso)
                    and c.periodo_ate + case when c.compra_id is null then interval '3 days' else interval '0' end > now())
      or exists (select 1 from privado.plano_agencia_cortesia x
                  where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
$$;

create or replace function privado.api_limite(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when privado.api_com_plano(p_conta) then c.limite_plano else c.limite_gratis end
    from privado.config_api c
$$;

-- o dia de Brasília (o limite recomeça à meia-noite daqui)
create or replace function privado.api_hoje()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

revoke execute on function privado.api_com_plano(uuid), privado.api_limite(uuid), privado.api_hoje()
  from public, anon, authenticated;

-- os limites para a página pública da documentação (/desenvolvedores)
create or replace function public.limites_da_api()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ligada', c.ligada, 'limite_gratis', c.limite_gratis, 'limite_plano', c.limite_plano)
    from privado.config_api c
$$;
revoke execute on function public.limites_da_api() from public;
grant execute on function public.limites_da_api() to anon, authenticated;

-- 3. As chaves, em Configurações › API ---------------------------------------------------------------------------------

-- quem cuida das chaves: o dono da conta ou um admin da equipe, numa conta que contrata. Devolve a conta.
create or replace function privado.api_conta_que_gerencia()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select public.conta_atual());
begin
  if v_conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.perfis p where p.id = v_conta and p.tipo in ('comercio', 'empresa', 'agencia')) then
    raise exception 'A API é para quem contrata: comércio, empresa ou agência.' using errcode = 'P0001',
      hint = 'so_quem_contrata';
  end if;
  if coalesce(public.papel_na_conta(), '') not in ('dono', 'admin') then
    raise exception 'Só o dono da conta ou um admin da equipe cria e apaga as chaves da API.' using errcode = '42501',
      hint = 'so_admin';
  end if;
  return v_conta;
end
$$;
revoke execute on function privado.api_conta_que_gerencia() from public, anon, authenticated;

-- a tela: as chaves (sem a chave inteira, que só aparece ao criar), o limite e o uso de hoje. null: sem conta.
create or replace function public.minha_api()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select public.conta_atual());
  v_papel text := coalesce(public.papel_na_conta(), '');
  c privado.config_api;
begin
  if v_conta is null then
    return null;
  end if;
  if not exists (select 1 from public.perfis p where p.id = v_conta and p.tipo in ('comercio', 'empresa', 'agencia')) then
    return jsonb_build_object('quem_contrata', false);
  end if;
  select * into c from privado.config_api;
  return jsonb_build_object(
    'quem_contrata', true,
    'pode_gerir', v_papel in ('dono', 'admin'),
    'ligada', coalesce(c.ligada, true),
    'com_plano', privado.api_com_plano(v_conta),
    'limite', privado.api_limite(v_conta),
    'limite_gratis', c.limite_gratis,
    'limite_plano', c.limite_plano,
    'chaves_por_conta', c.chaves_por_conta,
    'usadas_hoje', coalesce((select u.chamadas from privado.api_uso u
                              where u.conta_id = v_conta and u.dia = privado.api_hoje()), 0),
    'chaves', case when v_papel in ('dono', 'admin') then coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'nome', k.nome, 'prefixo', k.prefixo, 'criada_em', k.criada_em,
                                          'usada_em', k.usada_em, 'criada_por', p.nome) order by k.criada_em desc)
        from privado.api_chaves k
        left join public.perfis p on p.id = k.criada_por
       where k.conta_id = v_conta and k.apagada_em is null), '[]'::jsonb) else '[]'::jsonb end);
end
$$;

-- cria a chave e devolve ela inteira (a única vez)
create or replace function public.criar_chave_api(p_nome text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := privado.api_conta_que_gerencia();
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  v_maximo integer;
  v_chave text;
begin
  if char_length(v_nome) not between 1 and 60 then
    raise exception 'Dê um nome à chave, com até 60 letras, como “CRM da agência”.' using errcode = '22023';
  end if;
  select c.chaves_por_conta into v_maximo from privado.config_api c;
  v_maximo := coalesce(v_maximo, 5);
  -- uma chave por vez: duas abas não passam do máximo juntas
  perform pg_advisory_xact_lock(hashtext('publike:api_chaves:' || v_conta::text));
  if (select count(*) from privado.api_chaves k where k.conta_id = v_conta and k.apagada_em is null) >= v_maximo then
    raise exception 'A conta já tem % chaves. Apague uma que não usa mais para criar outra.', v_maximo
      using errcode = 'P0001', hint = 'chaves_demais';
  end if;
  if (select count(*) from privado.api_chaves k
       where k.conta_id = v_conta and k.criada_em > now() - interval '24 hours') >= 20 then
    raise exception 'Você criou muitas chaves hoje. Tente de novo amanhã.' using errcode = 'P0001', hint = 'limite_chaves';
  end if;
  v_chave :='publike_api_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into privado.api_chaves (conta_id, nome, prefixo, hash, criada_por)
  values (v_conta, v_nome, left(v_chave, 18), encode(sha256(convert_to(v_chave, 'UTF8')), 'hex'), (select auth.uid()));
  return v_chave;
end
$$;

create or replace function public.apagar_chave_api(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := privado.api_conta_que_gerencia();
begin
  update privado.api_chaves k set apagada_em = now()
   where k.id = p_id and k.conta_id = v_conta and k.apagada_em is null;
  if not found then
    raise exception 'Chave não encontrada.' using errcode = 'P0002';
  end if;
end
$$;

revoke execute on function public.minha_api(), public.criar_chave_api(text), public.apagar_chave_api(uuid)
  from public, anon;
grant execute on function public.minha_api(), public.criar_chave_api(text), public.apagar_chave_api(uuid)
  to authenticated;

-- 4. A entrada de cada chamada -----------------------------------------------------------------------------------------

-- Confere a chave (o sha256 que o site manda), a conta e o limite do dia, conta a chamada e, daí em diante nesta
-- transação, age como a conta (as funções do site leem a conta de request.jwt.claims). Os erros levam um hint que o
-- site traduz no código HTTP: api_desligada (503), chave_invalida (401), conta_bloqueada (403) e limite (429).
create or replace function privado.api_entrar(p_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_conta uuid;
  v_usada timestamptz;
  v_limite integer;
  v_chamadas integer;
begin
  if (select c.ligada from privado.config_api c) is false then
    raise exception 'A API do Publike está desligada agora. Tente de novo mais tarde.' using errcode = 'P0001',
      hint = 'api_desligada';
  end if;
  if p_hash is not null and p_hash ~ '^[0-9a-f]{64}$' then
    select k.id, k.conta_id, k.usada_em into v_id, v_conta, v_usada
      from privado.api_chaves k
     where k.hash = p_hash and k.apagada_em is null;
  end if;
  if v_id is null then
    raise exception 'Chave da API inválida ou apagada.' using errcode = '28000', hint = 'chave_invalida';
  end if;
  if exists (select 1 from public.perfis p
              where p.id = v_conta and (p.suspenso_ate > now() or p.tipo not in ('comercio', 'empresa', 'agencia'))) then
    raise exception 'Esta conta não pode usar a API agora.' using errcode = '42501', hint = 'conta_bloqueada';
  end if;
  v_limite := privado.api_limite(v_conta);
  insert into privado.api_uso as u (conta_id, dia, chamadas) values (v_conta, privado.api_hoje(), 1)
  on conflict (conta_id, dia) do update set chamadas = u.chamadas + 1
  returning u.chamadas into v_chamadas;
  if v_chamadas > v_limite then
    raise exception 'A conta chegou ao limite de % chamadas da API hoje. Ele volta à meia-noite (horário de Brasília).',
      v_limite using errcode = 'P0001', hint = 'limite';
  end if;
  -- a primeira chamada do dia apaga o uso de mais de 60 dias desta conta
  if v_chamadas = 1 then
    delete from privado.api_uso u where u.conta_id = v_conta and u.dia < privado.api_hoje() - 60;
  end if;
  if v_usada is null or v_usada < now() - interval '1 minute' then
    update privado.api_chaves set usada_em = now() where id = v_id;
  end if;
  perform set_config('request.jwt.claim.sub', v_conta::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_conta, 'role', 'authenticated')::text, true);
  return v_conta;
end
$$;
revoke execute on function privado.api_entrar(text) from public, anon, authenticated;

-- 5. O que a API mostra ------------------------------------------------------------------------------------------------

-- as candidaturas às vagas da conta, como o painel mostra. `atualizada_em`: a última mudança (candidatura, resposta,
-- aceite, match desfeito ou etapa), para o CRM buscar só o que mudou.
create or replace function privado.api_candidaturas(p_conta uuid, p_vaga uuid default null, p_perfil uuid default null)
returns table (
  vaga_id uuid,
  vaga_titulo text,
  vaga_status text,
  candidato_id uuid,
  nome text,
  foto text,
  cidade text,
  bairro text,
  verificado boolean,
  situacao text,
  etapa text,
  mensagem text,
  whatsapp text,
  email text,
  tem_curriculo boolean,
  candidatou_em timestamptz,
  respondida_em timestamptz,
  etapa_em timestamptz,
  atualizada_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.titulo, a.status, p.id, p.nome, p.foto, p.cidade, p.bairro, p.verificado,
         case c.status
           when 'match' then 'aceita'
           when 'dispensada' then 'dispensada'
           when 'desfeito' then 'desfeita'
           else case when c.aceita_em is not null then 'aceita_falta_curriculo' else 'aguardando' end
         end,
         -- esperando resposta, uma etapa adiante de "Em análise" vale "Novo" (etapaQueVale no site)
         case when c.status = 'pendente' and coalesce(e.etapa, 'novo') not in ('novo', 'analise') then 'novo'
              else coalesce(e.etapa, 'novo') end,
         c.mensagem,
         case when c.status = 'match' and a.status not in ('em_analise', 'removido') then ct.whatsapp end,
         case when c.status = 'match' and a.status not in ('em_analise', 'removido') then ct.email end,
         exists (select 1 from public.curriculos cv where cv.perfil_id = p.id),
         c.criado_em, c.respondida_em, e.atualizado_em,
         greatest(c.criado_em, c.respondida_em, c.aceita_em, c.desfeito_em, e.atualizado_em)
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.perfis p on p.id = c.perfil_id
    left join public.contatos ct on ct.perfil_id = p.id
    left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
   where a.autor_id = p_conta
     and a.tipo = 'vaga'
     and (p_vaga is null or a.id = p_vaga)
     and (p_perfil is null or p.id = p_perfil)
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
$$;
revoke execute on function privado.api_candidaturas(uuid, uuid, uuid) from public, anon, authenticated;

-- GET /api/v1: a conta da chave, o limite e o uso de hoje (com esta chamada)
create or replace function public.servidor_api_conta(p_chave text, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
begin
  perform privado.exigir_servidor(p_chave);
  v_conta := privado.api_entrar(p_hash);
  return (select jsonb_build_object(
            'id', p.id, 'nome', p.nome, 'tipo', p.tipo,
            'com_plano', privado.api_com_plano(v_conta),
            'limite_por_dia', privado.api_limite(v_conta),
            'usadas_hoje', (select u.chamadas from privado.api_uso u where u.conta_id = v_conta and u.dia = privado.api_hoje()))
            from public.perfis p where p.id = v_conta);
end
$$;

-- GET /api/v1/vagas: as vagas da conta (as 500 mais novas), para o CRM ligar os candidatos às vagas
create or replace function public.servidor_api_vagas(p_chave text, p_hash text, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
begin
  perform privado.exigir_servidor(p_chave);
  v_conta := privado.api_entrar(p_hash);
  return coalesce((
    select jsonb_agg(to_jsonb(v) order by v.criada_em desc)
      from (select a.id, a.titulo, a.status, a.regime, a.cidade, a.bairro, a.contratante, a.contratante_confidencial,
                   a.criado_em as criada_em, a.expira_em,
                   (select count(*) from public.curtidas c join public.perfis p on p.id = c.perfil_id
                     where c.anuncio_id = a.id and (p.suspenso_ate is null or p.suspenso_ate <= now()))::integer
                     as candidaturas
              from public.anuncios a
             where a.autor_id = v_conta and a.tipo = 'vaga' and (p_status is null or a.status = p_status)
             order by a.criado_em desc
             limit 500) v), '[]'::jsonb);
end
$$;

-- GET /api/v1/candidaturas: o que mudou, da mudança mais antiga para a mais nova, em páginas de até 100. `p_desde`:
-- só o que mudou depois dessa hora; `p_depois`: o cursor da página anterior ("<atualizada_em>|<vaga>|<candidato>").
create or replace function public.servidor_api_candidaturas(
  p_chave text,
  p_hash text,
  p_vaga uuid default null,
  p_desde timestamptz default null,
  p_depois text default null,
  p_limite integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_em timestamptz;
  v_vaga uuid;
  v_perfil uuid;
  v_lista jsonb;
  v_mais boolean;
begin
  perform privado.exigir_servidor(p_chave);
  v_conta := privado.api_entrar(p_hash);
  if p_depois is not null then
    begin
      v_em := split_part(p_depois, '|', 1)::timestamptz;
      v_vaga := split_part(p_depois, '|', 2)::uuid;
      v_perfil := split_part(p_depois, '|', 3)::uuid;
    exception when others then
      raise exception 'O cursor não vale. Use o “proximo” que a página anterior devolveu.' using errcode = '22023',
        hint = 'cursor_invalido';
    end;
  end if;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.atualizada_em, l.vaga_id, l.candidato_id), '[]'::jsonb)
    into v_lista
    from (select *
            from privado.api_candidaturas(v_conta, p_vaga, null) x
           where (p_desde is null or x.atualizada_em > p_desde)
             and (v_em is null or (x.atualizada_em, x.vaga_id, x.candidato_id) > (v_em, v_vaga, v_perfil))
           order by x.atualizada_em, x.vaga_id, x.candidato_id
           limit v_limite + 1) l;
  v_mais := jsonb_array_length(v_lista) > v_limite;
  if v_mais then
    v_lista := v_lista - v_limite;
  end if;
  return jsonb_build_object('candidaturas', v_lista, 'mais', v_mais);
end
$$;

-- GET /api/v1/vagas/{vaga}/candidaturas/{candidato}: a candidatura com o currículo (o mesmo que o painel mostra, por
-- curriculos_dos_interessados agindo como a conta), as perguntas da vaga e as respostas
create or replace function public.servidor_api_candidato(p_chave text, p_hash text, p_vaga uuid, p_perfil uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
  v_item jsonb;
  v_curriculo jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  v_conta := privado.api_entrar(p_hash);
  select to_jsonb(l) into v_item from privado.api_candidaturas(v_conta, p_vaga, p_perfil) l;
  if v_item is null then
    raise exception 'Candidatura não encontrada.' using errcode = 'P0002', hint = 'nao_encontrada';
  end if;
  select to_jsonb(cv) - 'perfil_id' - 'arquivo' || jsonb_build_object('tem_pdf', cv.arquivo is not null)
    into v_curriculo
    from public.curriculos_dos_interessados(p_vaga) cv
   where cv.perfil_id = p_perfil;
  return v_item || jsonb_build_object(
    'curriculo', v_curriculo,
    'perguntas', (select a.perguntas from public.anuncios a where a.id = p_vaga),
    'respostas', (select c.respostas from public.curtidas c where c.anuncio_id = p_vaga and c.perfil_id = p_perfil));
end
$$;

-- POST aceitar e dispensar, PUT etapa: as funções do site, agindo como a conta. Devolve a candidatura como ficou.
create or replace function public.servidor_api_responder(
  p_chave text,
  p_hash text,
  p_vaga uuid,
  p_perfil uuid,
  p_acao text,
  p_etapa text default null,
  p_motivo text default null,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
  v_nota text;
begin
  perform privado.exigir_servidor(p_chave);
  v_conta := privado.api_entrar(p_hash);
  if p_acao is null or p_acao not in ('aceitar', 'dispensar', 'etapa') then
    raise exception 'Ação inválida: use aceitar, dispensar ou etapa.' using errcode = '22023', hint = 'acao_invalida';
  end if;
  if not exists (select 1 from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                  where c.anuncio_id = p_vaga and c.perfil_id = p_perfil and a.autor_id = v_conta and a.tipo = 'vaga') then
    raise exception 'Candidatura não encontrada.' using errcode = 'P0002', hint = 'nao_encontrada';
  end if;
  if p_acao = 'aceitar' then
    -- o contato da conta vai para o candidato: sem o WhatsApp e o e-mail no perfil, não aceita (a regra do site)
    if not exists (select 1 from public.contatos ct
                    where ct.perfil_id = v_conta
                      and nullif(btrim(coalesce(ct.whatsapp, '')), '') is not null
                      and nullif(btrim(coalesce(ct.email, '')), '') is not null) then
      raise exception 'Para aceitar candidatos, a conta precisa do WhatsApp e do e-mail no perfil do Publike: é o contato que o candidato recebe.'
        using errcode = 'P0001', hint = 'falta_contato';
    end if;
    perform public.responder_curtida(p_vaga, p_perfil, 'match');
  elsif p_acao = 'dispensar' then
    if p_motivo is not null then
      perform public.marcar_motivo_saida(p_vaga, array[p_perfil], p_motivo);
    end if;
    perform public.responder_curtida(p_vaga, p_perfil, 'dispensada');
  else
    -- sem anotação no pedido, a de antes continua (a função do site grava a que recebe)
    select e.nota into v_nota from public.etapas_candidatos e where e.anuncio_id = p_vaga and e.perfil_id = p_perfil;
    perform public.salvar_etapa_candidato(p_vaga, p_perfil, p_etapa, coalesce(p_nota, v_nota));
  end if;
  return (select to_jsonb(l) from privado.api_candidaturas(v_conta, p_vaga, p_perfil) l);
end
$$;

revoke execute on function public.servidor_api_conta(text, text), public.servidor_api_vagas(text, text, text),
  public.servidor_api_candidaturas(text, text, uuid, timestamptz, text, integer),
  public.servidor_api_candidato(text, text, uuid, uuid),
  public.servidor_api_responder(text, text, uuid, uuid, text, text, text, text) from public;
grant execute on function public.servidor_api_conta(text, text), public.servidor_api_vagas(text, text, text),
  public.servidor_api_candidaturas(text, text, uuid, timestamptz, text, integer),
  public.servidor_api_candidato(text, text, uuid, uuid),
  public.servidor_api_responder(text, text, uuid, uuid, text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270713120000_api_publica');
