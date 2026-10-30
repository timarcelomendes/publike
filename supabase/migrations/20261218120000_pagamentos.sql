-- Pagamentos pelo Asaas (claude/plano-checkout-asaas.md, decisões do usuário de 30/10/2026). Pode rodar de novo.
--
-- O Copiloto e os Testes Publike são vendidos separados (uma assinatura por conta e recurso), mensal ou
-- trimestral, com o preço posto no Admin. O cartão é pago na página do parceiro de pagamentos (o número do
-- cartão nunca passa pelo Publike); o Pix, dentro do Publike. Quem libera o recurso é a cobrança paga, que só
-- o servidor grava (com a chave do servidor), depois de conferir no Asaas: o `ate` do Copiloto e dos Testes
-- vai até o fim do período pago mais 3 dias de folga. A conta liberada sem prazo pelo Admin (`ate` null) não
-- muda. Fechado até o Admin abrir: o Assinar só aparece para as contas de teste.

-- 1. Tabelas ------------------------------------------------------------------------------------

create table if not exists privado.planos (
  id uuid primary key default gen_random_uuid(),
  recurso text not null check (recurso in ('copiloto', 'testes')),
  ciclo text not null check (ciclo in ('MONTHLY', 'QUARTERLY')),
  -- o valor de cada cobrança (o trimestral cobra os 3 meses juntos); null: sem preço, não aparece
  valor numeric(10, 2) check (valor is null or valor between 5 and 100000),
  ligado boolean not null default false,
  atualizado_em timestamptz not null default now(),
  unique (recurso, ciclo)
);
insert into privado.planos (recurso, ciclo)
values ('copiloto', 'MONTHLY'), ('copiloto', 'QUARTERLY'), ('testes', 'MONTHLY'), ('testes', 'QUARTERLY')
on conflict (recurso, ciclo) do nothing;

create table if not exists privado.config_pagamentos (
  id boolean primary key default true check (id),
  -- false: só as contas de teste (privado.pagamentos_teste) veem o Assinar
  aberto boolean not null default false,
  -- o serviço da nota fiscal: o id da lista do município ou o código (quando o município não tem lista)
  servico_nota text check (servico_nota is null or char_length(servico_nota) between 1 and 60),
  servico_nota_e_codigo boolean not null default false,
  descricao_nota text check (descricao_nota is null or char_length(descricao_nota) <= 250),
  atualizado_em timestamptz not null default now()
);
insert into privado.config_pagamentos (id) values (true) on conflict (id) do nothing;

create table if not exists privado.pagamentos_teste (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now()
);

create table if not exists privado.clientes_pagamento (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  asaas_id text not null unique,
  cpf_cnpj text not null check (cpf_cnpj ~ '^[0-9]{11}$|^[0-9A-Z]{12}[0-9]{2}$'),
  nome text not null check (char_length(nome) between 2 and 120),
  email text check (email is null or char_length(email) <= 200),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists privado.assinaturas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.perfis (id) on delete cascade,
  recurso text not null check (recurso in ('copiloto', 'testes')),
  plano_id uuid references privado.planos (id) on delete set null,
  ciclo text not null check (ciclo in ('MONTHLY', 'QUARTERLY')),
  valor numeric(10, 2) not null,
  forma text not null check (forma in ('cartao', 'pix')),
  -- a assinatura no Asaas (no cartão, chega pelo aviso depois do checkout)
  asaas_id text unique,
  checkout_id text unique,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'ativa', 'cancelada')),
  cartao_final text check (cartao_final is null or cartao_final ~ '^[0-9]{4}$'),
  cartao_bandeira text check (cartao_bandeira is null or char_length(cartao_bandeira) <= 30),
  proxima_cobranca date,
  nota_configurada boolean not null default false,
  criada_em timestamptz not null default now(),
  cancelada_em timestamptz
);
create index if not exists assinaturas_conta on privado.assinaturas (conta_id, recurso, criada_em desc);
-- uma assinatura valendo por conta e recurso
create unique index if not exists assinaturas_uma_ativa on privado.assinaturas (conta_id, recurso)
  where situacao = 'ativa';

create table if not exists privado.cobrancas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  asaas_id text not null unique,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  assinatura_id uuid references privado.assinaturas (id) on delete set null,
  recurso text not null check (recurso in ('copiloto', 'testes')),
  valor numeric(10, 2) not null,
  vencimento date not null,
  situacao text not null check (situacao in ('pendente', 'paga', 'atrasada', 'estornada', 'recusada', 'cancelada')),
  forma text not null check (forma in ('cartao', 'pix')),
  pago_em timestamptz,
  -- até quando a cobrança paga libera o recurso (o vencimento mais o ciclo); a folga entra no `ate`
  periodo_ate timestamptz not null,
  pix_payload text check (pix_payload is null or char_length(pix_payload) <= 1000),
  pix_expira timestamptz,
  -- a página do parceiro para pagar a fatura de cartão em aberto (outro cartão ou Pix)
  link_pagar text check (link_pagar is null or link_pagar ~ '^https://'),
  criada_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists cobrancas_conta on privado.cobrancas (conta_id, vencimento desc);

create table if not exists privado.notas_fiscais (
  asaas_id text primary key,
  cobranca_id uuid references privado.cobrancas (id) on delete cascade,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  situacao text not null check (situacao in ('agendada', 'autorizada', 'erro', 'cancelada')),
  numero text check (numero is null or char_length(numero) <= 40),
  emitida_em timestamptz,
  erro text check (erro is null or char_length(erro) <= 500),
  atualizado_em timestamptz not null default now()
);
create index if not exists notas_cobranca on privado.notas_fiscais (cobranca_id);

-- cada aviso do Asaas uma vez só (a entrega é "pelo menos uma vez"); 400 dias, para conferir
create table if not exists privado.eventos_pagamento (
  id text primary key check (char_length(id) between 1 and 120),
  tipo text not null check (char_length(tipo) <= 80),
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  erro text check (erro is null or char_length(erro) <= 500)
);
create index if not exists eventos_pagamento_recebido on privado.eventos_pagamento (recebido_em desc);

-- as tentativas de assinar (no máximo 5 por conta por hora)
create table if not exists privado.tentativas_pagamento (
  conta_id uuid not null references public.perfis (id) on delete cascade,
  em timestamptz not null default now()
);
create index if not exists tentativas_pagamento_conta on privado.tentativas_pagamento (conta_id, em desc);

alter table privado.planos enable row level security;
alter table privado.config_pagamentos enable row level security;
alter table privado.pagamentos_teste enable row level security;
alter table privado.clientes_pagamento enable row level security;
alter table privado.assinaturas enable row level security;
alter table privado.cobrancas enable row level security;
alter table privado.notas_fiscais enable row level security;
alter table privado.eventos_pagamento enable row level security;
alter table privado.tentativas_pagamento enable row level security;
revoke all on privado.planos, privado.config_pagamentos, privado.pagamentos_teste, privado.clientes_pagamento,
  privado.assinaturas, privado.cobrancas, privado.notas_fiscais, privado.eventos_pagamento,
  privado.tentativas_pagamento from public, anon, authenticated;

-- o aviso de pagamento no sino (e no celular), com o link da tela
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'recado_no_ar', 'recado_retido', 'recado_forca',
                  'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine',
                  'curriculo_publico', 'visita', 'visitas_do_dia', 'visitas_novidade',
                  'avaliacao_liberada', 'avaliacao_removida', 'mensagem_equipe',
                  'vagas_semana', 'talentos_semana', 'comunicado', 'noticias_do_dia',
                  'teste_pedido', 'teste_feito', 'lembrete_curtida', 'sem_resposta', 'pagamento'));

drop trigger if exists notificacoes_para_celular on public.notificacoes;
create trigger notificacoes_para_celular
  after insert on public.notificacoes
  for each row
  when (new.tipo in ('curtida', 'match', 'mensagem', 'conexao', 'em_analise', 'removido', 'liberado',
                     'etapa', 'entrevista', 'entrevista_resposta', 'contratacao', 'aceite_curriculo',
                     'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas', 'vaga_preenchida',
                     'seguindo', 'busca', 'avaliacao', 'recado_retido', 'mensagem_equipe', 'equipe',
                     'vagas_semana', 'talentos_semana', 'noticias_do_dia', 'teste_pedido', 'teste_feito',
                     'lembrete_curtida', 'sem_resposta', 'pagamento'))
  execute function privado.notificacao_para_celular();


-- 2. Regras --------------------------------------------------------------------------------------

create or replace function privado.nome_do_recurso(p_recurso text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_recurso when 'copiloto' then 'Copiloto' else 'Testes Publike' end
$$;

create or replace function privado.meses_do_ciclo(p_ciclo text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_ciclo when 'QUARTERLY' then 3 else 1 end
$$;

-- a conta pode assinar: comércio, empresa ou agência, e os pagamentos abertos (ou a conta de teste)
create or replace function privado.pode_pagar(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis p where p.id = p_conta and p.tipo in ('comercio', 'empresa', 'agencia'))
     and (coalesce((select c.aberto from privado.config_pagamentos c where c.id), false)
          or exists (select 1 from privado.pagamentos_teste t where t.conta_id = p_conta))
$$;

-- o `ate` do recurso pelas cobranças pagas (+ 3 dias de folga) e pelo teste grátis; sem prazo (admin) não muda
create or replace function privado.recalcular_recurso_pago(p_conta uuid, p_recurso text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago timestamptz;
  v_teste timestamptz;
  v_novo timestamptz;
  v_tem boolean;
  v_ate timestamptz;
begin
  select max(c.periodo_ate) + interval '3 days' into v_pago
    from privado.cobrancas c
   where c.conta_id = p_conta and c.recurso = p_recurso and c.situacao = 'paga';
  select x.fim into v_teste from privado.experimentos x where x.conta_id = p_conta and x.recurso = p_recurso;
  v_novo := greatest(v_pago, v_teste);
  if p_recurso = 'copiloto' then
    select true, c.ate into v_tem, v_ate from privado.copiloto_contas c where c.conta_id = p_conta;
  else
    select true, t.ate into v_tem, v_ate from privado.testes_contas t where t.conta_id = p_conta;
  end if;
  -- liberado sem prazo pelo Publike: fica como está
  if coalesce(v_tem, false) and v_ate is null then
    return;
  end if;
  if v_novo is null then
    return;
  end if;
  if p_recurso = 'copiloto' then
    insert into privado.copiloto_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;
  else
    insert into privado.testes_contas (conta_id, liberado_em, ate) values (p_conta, now(), v_novo)
    on conflict (conta_id) do update set ate = excluded.ate;
  end if;
end
$$;

create or replace function privado.avisar_pagamento(p_conta uuid, p_texto text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notificacoes (destinatario_id, tipo, texto, link)
  values (p_conta, 'pagamento', left(p_texto, 300), p_link)
$$;

create or replace function privado.data_br(p timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
$$;


-- 3. Da conta (com login) ------------------------------------------------------------------------

-- o que a tela de assinar precisa: se pode, os planos com preço, as assinaturas e os dados de cobrança
create or replace function public.pagamentos_da_conta()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
begin
  if (select auth.uid()) is null or conta is null then
    return null;
  end if;
  return jsonb_build_object(
    'pode', privado.pode_pagar(conta),
    'tipo', (select p.tipo from public.perfis p where p.id = conta),
    'planos', coalesce((select jsonb_agg(jsonb_build_object('id', pl.id, 'recurso', pl.recurso, 'ciclo', pl.ciclo,
                                                           'valor', pl.valor) order by pl.recurso, pl.ciclo)
                          from privado.planos pl where pl.ligado and pl.valor is not null), '[]'::jsonb),
    'assinaturas', coalesce((select jsonb_agg(jsonb_build_object(
                               'id', a.id, 'recurso', a.recurso, 'ciclo', a.ciclo, 'valor', a.valor, 'forma', a.forma,
                               'situacao', a.situacao, 'cartao_final', a.cartao_final,
                               'cartao_bandeira', a.cartao_bandeira,
                               -- a fatura em aberto mais próxima, ou a que o Asaas ainda vai gerar
                               'proxima_cobranca', case when a.situacao <> 'cancelada' then coalesce(
                                 (select min(c.vencimento) from privado.cobrancas c
                                   where c.assinatura_id = a.id and c.situacao in ('pendente', 'atrasada', 'recusada')),
                                 a.proxima_cobranca) end,
                               'criada_em', a.criada_em, 'cancelada_em', a.cancelada_em,
                               'pago_ate', (select max(c.periodo_ate) from privado.cobrancas c
                                             where c.assinatura_id = a.id and c.situacao = 'paga'))
                               order by a.criada_em desc)
                              from privado.assinaturas a
                             where a.conta_id = conta
                               and (a.situacao <> 'pendente' or a.asaas_id is not null)),
                            '[]'::jsonb),
    'cliente', (select jsonb_build_object('cpf_cnpj', c.cpf_cnpj, 'nome', c.nome, 'email', c.email)
                  from privado.clientes_pagamento c where c.conta_id = conta),
    'testes_ate', (select jsonb_object_agg(x.recurso, x.fim) from privado.experimentos x
                    where x.conta_id = conta and x.fim > now()),
    'pago_ate', (select jsonb_object_agg(q.recurso, q.ate)
                   from (select c.recurso, max(c.periodo_ate) as ate from privado.cobrancas c
                          where c.conta_id = conta and c.situacao = 'paga' group by c.recurso) q
                  where q.ate > now())
  );
end
$$;

create or replace function public.minhas_faturas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'numero', c.numero, 'recurso', c.recurso, 'valor', c.valor, 'vencimento', c.vencimento,
           'situacao', c.situacao, 'forma', c.forma, 'pago_em', c.pago_em, 'link_pagar', c.link_pagar,
           'nota', (select jsonb_build_object('situacao', n.situacao, 'numero', n.numero)
                      from privado.notas_fiscais n where n.cobranca_id = c.id
                     order by n.atualizado_em desc limit 1))
           order by c.vencimento desc, c.numero desc), '[]'::jsonb)
    from privado.cobrancas c
   where (select auth.uid()) is not null and c.conta_id = public.conta_atual()
$$;

create or replace function public.minha_fatura(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', c.id, 'numero', c.numero, 'recurso', c.recurso, 'valor', c.valor, 'vencimento', c.vencimento,
           'situacao', c.situacao, 'forma', c.forma, 'pago_em', c.pago_em, 'periodo_ate', c.periodo_ate,
           'link_pagar', c.link_pagar, 'pix_payload', c.pix_payload, 'pix_expira', c.pix_expira,
           'asaas_id', c.asaas_id,
           'ciclo', a.ciclo,
           'conta', jsonb_build_object('nome', coalesce(cl.nome, p.nome), 'cpf_cnpj', cl.cpf_cnpj),
           'nota', (select jsonb_build_object('situacao', n.situacao, 'numero', n.numero, 'asaas_id', n.asaas_id)
                      from privado.notas_fiscais n where n.cobranca_id = c.id
                     order by n.atualizado_em desc limit 1))
    from privado.cobrancas c
    join public.perfis p on p.id = c.conta_id
    left join privado.assinaturas a on a.id = c.assinatura_id
    left join privado.clientes_pagamento cl on cl.conta_id = c.conta_id
   where (select auth.uid()) is not null and c.id = p_id and c.conta_id = public.conta_atual()
$$;

-- a tela do Pix pergunta se já pagou
create or replace function public.situacao_da_cobranca(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.situacao from privado.cobrancas c
   where (select auth.uid()) is not null and c.id = p_id and c.conta_id = public.conta_atual()
$$;

revoke execute on function public.pagamentos_da_conta(), public.minhas_faturas(), public.minha_fatura(uuid),
  public.situacao_da_cobranca(uuid) from public, anon;
grant execute on function public.pagamentos_da_conta(), public.minhas_faturas(), public.minha_fatura(uuid),
  public.situacao_da_cobranca(uuid) to authenticated;

-- o estado dos dois recursos (as páginas do painel leem daqui): agora diz se a conta assina e se pode assinar
create or replace function public.recursos_pagos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  contrata boolean;
  pagar boolean;
  r text;
  ate_ timestamptz;
  tem boolean;
  e privado.experimentos;
  assina boolean;
  saida jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is null or conta is null then
    return null;
  end if;
  select p.tipo in ('comercio', 'empresa', 'agencia') into contrata from public.perfis p where p.id = conta;
  pagar := privado.pode_pagar(conta);
  foreach r in array array['copiloto', 'testes'] loop
    if r = 'copiloto' then
      select true, c.ate into tem, ate_ from privado.copiloto_contas c where c.conta_id = conta;
    else
      select true, t.ate into tem, ate_ from privado.testes_contas t where t.conta_id = conta;
    end if;
    select * into e from privado.experimentos x where x.conta_id = conta and x.recurso = r;
    assina := exists (select 1 from privado.assinaturas a
                       where a.conta_id = conta and a.recurso = r and a.situacao = 'ativa');
    saida := saida || jsonb_build_object(r, jsonb_build_object(
      'liberado', coalesce(tem, false) and (ate_ is null or ate_ > now()),
      'ate', case when coalesce(tem, false) then ate_ end,
      'experimentou', e.conta_id is not null,
      'fim_experimento', e.fim,
      'quer_continuar', e.quer_continuar_em is not null,
      'pode_experimentar', coalesce(contrata, false) and e.conta_id is null
                           and not (coalesce(tem, false) and (ate_ is null or ate_ > now())),
      'assinante', assina,
      -- assinar: quem pode pagar, sem a liberação sem prazo e sem assinatura valendo, com o plano à venda
      'pode_assinar', pagar and not assina and not (coalesce(tem, false) and ate_ is null)
                      -- o Pix já assinado, esperando a 1ª fatura
                      and not exists (select 1 from privado.assinaturas a
                                       where a.conta_id = conta and a.recurso = r and a.situacao = 'pendente'
                                         and a.asaas_id is not null)
                      and exists (select 1 from privado.planos pl
                                   where pl.recurso = r and pl.ligado and pl.valor is not null)));
    tem := null; ate_ := null; e := null;
  end loop;
  return saida;
end
$$;


-- 4. Do servidor (com a chave do servidor) -------------------------------------------------------

create or replace function public.servidor_pagamento_contexto(p_chave text, p_conta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return jsonb_build_object(
    'pode', privado.pode_pagar(p_conta),
    'nome', (select p.nome from public.perfis p where p.id = p_conta),
    'email', (select u.email from auth.users u where u.id = p_conta),
    'cliente', (select jsonb_build_object('asaas_id', c.asaas_id, 'cpf_cnpj', c.cpf_cnpj, 'nome', c.nome,
                                          'email', c.email)
                  from privado.clientes_pagamento c where c.conta_id = p_conta),
    'planos', coalesce((select jsonb_agg(jsonb_build_object('id', pl.id, 'recurso', pl.recurso, 'ciclo', pl.ciclo,
                                                           'valor', pl.valor))
                          from privado.planos pl where pl.ligado and pl.valor is not null), '[]'::jsonb),
    'ativas', coalesce((select jsonb_agg(a.recurso) from privado.assinaturas a
                         where a.conta_id = p_conta
                           and (a.situacao = 'ativa' or (a.situacao = 'pendente' and a.asaas_id is not null))),
                       '[]'::jsonb),
    'sem_prazo', jsonb_build_object(
      'copiloto', exists (select 1 from privado.copiloto_contas c where c.conta_id = p_conta and c.ate is null),
      'testes', exists (select 1 from privado.testes_contas t where t.conta_id = p_conta and t.ate is null)),
    'testes_ate', (select jsonb_object_agg(x.recurso, x.fim) from privado.experimentos x
                    where x.conta_id = p_conta and x.fim > now()),
    -- até quando já está pago (assinar de novo, ou trocar o cartão, começa a cobrar daí)
    'pago_ate', (select jsonb_object_agg(q.recurso, q.ate)
                   from (select c.recurso, max(c.periodo_ate) as ate from privado.cobrancas c
                          where c.conta_id = p_conta and c.situacao = 'paga' group by c.recurso) q
                  where q.ate > now()),
    'nota', (select jsonb_build_object('servico', c.servico_nota, 'e_codigo', c.servico_nota_e_codigo,
                                       'descricao', c.descricao_nota)
               from privado.config_pagamentos c where c.id and c.servico_nota is not null)
  );
end
$$;

-- no máximo 5 tentativas de assinar por conta por hora
create or replace function public.servidor_pagamento_tentativa(p_chave text, p_conta uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if (select count(*) from privado.tentativas_pagamento t
       where t.conta_id = p_conta and t.em > now() - interval '1 hour') >= 5 then
    return false;
  end if;
  insert into privado.tentativas_pagamento (conta_id) values (p_conta);
  delete from privado.tentativas_pagamento where em < now() - interval '2 days';
  return true;
end
$$;

create or replace function public.servidor_pagamento_cliente(p_chave text, p_conta uuid, p_asaas_id text,
                                                             p_cpf_cnpj text, p_nome text, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.clientes_pagamento (conta_id, asaas_id, cpf_cnpj, nome, email)
  values (p_conta, p_asaas_id, p_cpf_cnpj, p_nome, nullif(p_email, ''))
  on conflict (conta_id) do update
    set asaas_id = excluded.asaas_id, cpf_cnpj = excluded.cpf_cnpj, nome = excluded.nome,
        email = excluded.email, atualizado_em = now();
end
$$;

create or replace function public.servidor_pagamento_assinatura(p_chave text, p_conta uuid, p_plano uuid,
                                                                p_forma text, p_asaas_id text, p_checkout_id text,
                                                                p_proxima date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pl privado.planos;
  v_id uuid;
begin
  perform privado.exigir_servidor(p_chave);
  select * into pl from privado.planos where id = p_plano;
  if pl.id is null then
    raise exception 'Plano inválido.' using errcode = 'P0001';
  end if;
  insert into privado.assinaturas (conta_id, recurso, plano_id, ciclo, valor, forma, asaas_id, checkout_id,
                                   proxima_cobranca)
  values (p_conta, pl.recurso, pl.id, pl.ciclo, pl.valor, p_forma, nullif(p_asaas_id, ''),
          nullif(p_checkout_id, ''), p_proxima)
  returning id into v_id;
  return v_id;
end
$$;

-- a assinatura do Asaas (do aviso ou da consulta) ligada à nossa: pelo código, ou, a do checkout do cartão,
-- pelo cliente e pelo recurso que vai na descrição
create or replace function public.servidor_pagamento_vincular(p_chave text, p_sub jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a privado.assinaturas;
  v_conta uuid;
  v_recurso text;
  v_desc text := lower(coalesce(p_sub ->> 'description', ''));
  v_trocadas jsonb := '[]'::jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  -- o aviso e a volta do checkout chegam juntos: um de cada vez por cliente
  perform pg_advisory_xact_lock(hashtext('pagamento:' || coalesce(p_sub ->> 'customer', p_sub ->> 'id')));
  select * into a from privado.assinaturas where asaas_id = p_sub ->> 'id';
  if a.id is null then
    select c.conta_id into v_conta from privado.clientes_pagamento c where c.asaas_id = p_sub ->> 'customer';
    if v_conta is null then
      return null;
    end if;
    v_recurso := case when v_desc like '%copiloto%' then 'copiloto' when v_desc like '%testes%' then 'testes' end;
    select * into a from privado.assinaturas s
     where s.conta_id = v_conta and s.asaas_id is null and s.forma = 'cartao' and s.situacao = 'pendente'
       and (v_recurso is null or s.recurso = v_recurso)
     order by s.criada_em desc limit 1;
    if a.id is null then
      return null;
    end if;
    update privado.assinaturas set asaas_id = p_sub ->> 'id' where id = a.id returning * into a;
  end if;
  -- o cartão passou no checkout: a assinatura vale desde já (no teste grátis, a 1ª cobrança vem no fim dele);
  -- a do mesmo recurso que estava valendo (troca de ciclo ou de cartão) deixa de valer
  if a.forma = 'cartao' and a.situacao = 'pendente' and not coalesce((p_sub ->> 'deleted')::boolean, false)
     and upper(coalesce(p_sub ->> 'status', 'ACTIVE')) = 'ACTIVE' then
    with t as (
      update privado.assinaturas set situacao = 'cancelada', cancelada_em = now()
       where conta_id = a.conta_id and recurso = a.recurso and situacao in ('ativa', 'pendente') and id <> a.id
         and asaas_id is not null
      returning asaas_id)
    select coalesce(jsonb_agg(t.asaas_id), '[]'::jsonb) into v_trocadas from t;
    update privado.assinaturas set situacao = 'ativa' where id = a.id returning * into a;
    perform privado.avisar_pagamento(a.conta_id,
      case when jsonb_array_length(v_trocadas) > 0
           then 'Cartão do ' || privado.nome_do_recurso(a.recurso) || ' trocado.'
           else 'Assinatura do ' || privado.nome_do_recurso(a.recurso) || ' feita com o cartão.' end,
      '/painel/assinatura');
  end if;
  if p_sub ->> 'nextDueDate' is not null and a.situacao <> 'cancelada' then
    update privado.assinaturas set proxima_cobranca = (p_sub ->> 'nextDueDate')::date where id = a.id;
  end if;
  return jsonb_build_object('assinatura_id', a.id, 'conta', a.conta_id, 'recurso', a.recurso,
                            'situacao', a.situacao, 'nota_configurada', a.nota_configurada,
                            'asaas_id', a.asaas_id, 'trocadas', v_trocadas);
end
$$;

-- a cobrança, como o Asaas devolve (sempre consultada no Asaas, nunca só pelo aviso): grava, libera e avisa
create or replace function public.servidor_pagamento_cobranca(p_chave text, p_pag jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a privado.assinaturas;
  antes privado.cobrancas;
  c privado.cobrancas;
  v_status text := upper(coalesce(p_pag ->> 'status', ''));
  v_situacao text;
  v_venc date := (p_pag ->> 'dueDate')::date;
  v_pago timestamptz;
  v_forma text := case when upper(coalesce(p_pag ->> 'billingType', '')) = 'PIX' then 'pix' else 'cartao' end;
  v_final text := p_pag #>> '{creditCard,creditCardNumber}';
  v_bandeira text := p_pag #>> '{creditCard,creditCardBrand}';
  v_link text := p_pag ->> 'invoiceUrl';
  v_nome text;
  v_primeira boolean;
begin
  perform privado.exigir_servidor(p_chave);
  -- a mesma cobrança, um aviso de cada vez (para avisar a conta uma vez só)
  perform pg_advisory_xact_lock(hashtext('pagamento:' || coalesce(p_pag ->> 'customer', p_pag ->> 'id')));
  select * into a from privado.assinaturas where asaas_id = p_pag ->> 'subscription';
  if a.id is null or v_venc is null then
    return null;
  end if;
  v_situacao := case
    when coalesce((p_pag ->> 'deleted')::boolean, false) then 'cancelada'
    when v_status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH') then 'paga'
    when v_status in ('REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED',
                      'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL') then 'estornada'
    when v_status = 'OVERDUE' then 'atrasada'
    else 'pendente'
  end;
  -- recusa do cartão (o aviso traz o evento; a cobrança continua em aberto): marcada pelo servidor
  if p_pag ->> 'publike_recusada' = 'true' and v_situacao in ('pendente', 'atrasada') then
    v_situacao := 'recusada';
  end if;
  -- a data do pagamento (o Asaas manda só o dia): meio-dia em Brasília, para não cair no dia anterior
  v_pago := case when v_situacao = 'paga'
                 then (coalesce((p_pag ->> 'clientPaymentDate')::date, (p_pag ->> 'confirmedDate')::date,
                                (p_pag ->> 'paymentDate')::date, (now() at time zone 'America/Sao_Paulo')::date)
                       + interval '12 hours') at time zone 'America/Sao_Paulo' end;
  if v_link is not null and v_link !~ '^https://' then
    v_link := null;
  end if;
  select * into antes from privado.cobrancas where asaas_id = p_pag ->> 'id';
  insert into privado.cobrancas (asaas_id, conta_id, assinatura_id, recurso, valor, vencimento, situacao, forma,
                                 pago_em, periodo_ate, link_pagar)
  values (p_pag ->> 'id', a.conta_id, a.id, a.recurso, (p_pag ->> 'value')::numeric, v_venc, v_situacao, v_forma,
          v_pago,
          ((v_venc + make_interval(months => privado.meses_do_ciclo(a.ciclo)))::timestamp + interval '23 hours 59 minutes')
            at time zone 'America/Sao_Paulo',
          v_link)
  on conflict (asaas_id) do update
    set situacao = excluded.situacao, valor = excluded.valor, vencimento = excluded.vencimento,
        pago_em = coalesce(privado.cobrancas.pago_em, excluded.pago_em), periodo_ate = excluded.periodo_ate,
        link_pagar = coalesce(excluded.link_pagar, privado.cobrancas.link_pagar), forma = excluded.forma,
        atualizado_em = now()
  returning * into c;

  -- o cartão (só os 4 últimos números e a bandeira, como o Asaas devolve)
  if v_forma = 'cartao' and (v_final ~ '^[0-9]{4}$' or v_bandeira is not null) then
    update privado.assinaturas
       set cartao_final = coalesce(case when v_final ~ '^[0-9]{4}$' then v_final end, cartao_final),
           cartao_bandeira = coalesce(left(v_bandeira, 30), cartao_bandeira)
     where id = a.id;
  end if;
  v_nome := privado.nome_do_recurso(a.recurso);
  v_primeira := not exists (select 1 from privado.cobrancas x where x.assinatura_id = a.id and x.id <> c.id);
  if v_situacao = 'paga' and antes.situacao is distinct from 'paga' then
    if a.situacao = 'pendente' then
      -- a do mesmo recurso que estava valendo (troca de ciclo) deixa de valer
      update privado.assinaturas set situacao = 'cancelada', cancelada_em = now()
       where conta_id = a.conta_id and recurso = a.recurso and situacao = 'ativa' and id <> a.id;
      update privado.assinaturas set situacao = 'ativa' where id = a.id;
    end if;
    update privado.assinaturas
       set proxima_cobranca = greatest(proxima_cobranca, (c.periodo_ate at time zone 'America/Sao_Paulo')::date)
     where id = a.id and situacao <> 'cancelada';
    perform privado.recalcular_recurso_pago(a.conta_id, a.recurso);
    perform privado.avisar_pagamento(a.conta_id,
      'Pagamento confirmado: o ' || v_nome || ' está liberado até ' || privado.data_br(c.periodo_ate) || '.',
      '/painel/faturas');
  elsif v_situacao = 'estornada' and antes.situacao is distinct from 'estornada' then
    perform privado.recalcular_recurso_pago(a.conta_id, a.recurso);
    perform privado.avisar_pagamento(a.conta_id, 'O pagamento do ' || v_nome || ' foi estornado.', '/painel/faturas');
  elsif v_situacao = 'atrasada' and antes.situacao is distinct from 'atrasada' and a.situacao = 'ativa' then
    perform privado.avisar_pagamento(a.conta_id,
      'A fatura do ' || v_nome || ' venceu. Pague em até 3 dias para o recurso não fechar.', '/painel/faturas');
  elsif v_situacao = 'recusada' and antes.situacao is distinct from 'recusada' then
    perform privado.avisar_pagamento(a.conta_id,
      'O cartão não passou na cobrança do ' || v_nome || '. Pague a fatura com outro cartão ou com Pix.',
      '/painel/faturas');
  elsif v_situacao = 'pendente' and antes.id is null and not v_primeira and v_forma = 'pix' then
    perform privado.avisar_pagamento(a.conta_id,
      'A fatura do ' || v_nome || ' vence em ' || privado.data_br(v_venc::timestamptz) || '. Pague com Pix em Faturas.',
      '/painel/faturas');
  end if;
  return jsonb_build_object('cobranca_id', c.id, 'conta', a.conta_id, 'recurso', a.recurso, 'situacao', c.situacao,
                            'nova', antes.id is null, 'forma', c.forma, 'assinatura_id', a.id,
                            'assinatura_situacao', a.situacao,
                            'assinatura_asaas', a.asaas_id, 'nota_configurada', a.nota_configurada,
                            'tem_pix', c.pix_payload is not null);
end
$$;

create or replace function public.servidor_pagamento_pix(p_chave text, p_asaas_id text, p_payload text,
                                                         p_expira timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.cobrancas set pix_payload = left(p_payload, 1000), pix_expira = p_expira, atualizado_em = now()
   where asaas_id = p_asaas_id;
end
$$;

create or replace function public.servidor_pagamento_nota_configurada(p_chave text, p_assinatura uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.assinaturas set nota_configurada = true where id = p_assinatura;
end
$$;

-- a nota fiscal, como o Asaas devolve: grava e, autorizada, avisa
create or replace function public.servidor_pagamento_nota(p_chave text, p_nota jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c privado.cobrancas;
  antes text;
  v_situacao text := case upper(coalesce(p_nota ->> 'status', ''))
    when 'AUTHORIZED' then 'autorizada'
    when 'ERROR' then 'erro'
    when 'CANCELED' then 'cancelada'
    when 'CANCELLED' then 'cancelada'
    else 'agendada' end;
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.cobrancas where asaas_id = p_nota ->> 'payment';
  if c.id is null then
    return;
  end if;
  select n.situacao into antes from privado.notas_fiscais n where n.asaas_id = p_nota ->> 'id';
  insert into privado.notas_fiscais (asaas_id, cobranca_id, conta_id, situacao, numero, emitida_em, erro)
  values (p_nota ->> 'id', c.id, c.conta_id, v_situacao, left(p_nota ->> 'number', 40),
          case when v_situacao = 'autorizada' then now() end,
          case when v_situacao = 'erro' then left(p_nota ->> 'statusDescription', 500) end)
  on conflict (asaas_id) do update
    set situacao = excluded.situacao, numero = coalesce(excluded.numero, privado.notas_fiscais.numero),
        emitida_em = coalesce(privado.notas_fiscais.emitida_em, excluded.emitida_em), erro = excluded.erro,
        atualizado_em = now();
  if v_situacao = 'autorizada' and antes is distinct from 'autorizada' then
    perform privado.avisar_pagamento(c.conta_id,
      'A nota fiscal do ' || privado.nome_do_recurso(c.recurso) || ' saiu. Ela está em Faturas.', '/painel/faturas');
  end if;
end
$$;

-- o aviso do Asaas: true na primeira vez (o mesmo aviso pode chegar mais de uma vez)
create or replace function public.servidor_pagamento_evento(p_chave text, p_id text, p_tipo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.eventos_pagamento (id, tipo) values (left(p_id, 120), left(p_tipo, 80))
  on conflict (id) do nothing;
  if not found then
    -- já chegou: processa de novo só o que deu erro
    return exists (select 1 from privado.eventos_pagamento e
                    where e.id = left(p_id, 120) and e.processado_em is null and e.erro is not null);
  end if;
  delete from privado.eventos_pagamento where recebido_em < now() - interval '400 days';
  return true;
end
$$;

create or replace function public.servidor_pagamento_evento_fim(p_chave text, p_id text, p_erro text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.eventos_pagamento
     set processado_em = case when p_erro is null then now() end, erro = left(p_erro, 500)
   where id = left(p_id, 120);
end
$$;

-- a assinatura de uma conta (para cancelar: confere que é dela)
create or replace function public.servidor_pagamento_da_conta(p_chave text, p_conta uuid, p_assinatura uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select jsonb_build_object('id', a.id, 'recurso', a.recurso, 'asaas_id', a.asaas_id, 'situacao', a.situacao,
                                    'forma', a.forma)
            from privado.assinaturas a where a.id = p_assinatura and a.conta_id = p_conta);
end
$$;

-- cancelada (por quem assina ou pelo Asaas): o recurso fica até o fim do que já foi pago
create or replace function public.servidor_pagamento_cancelada(p_chave text, p_asaas_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a privado.assinaturas;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.assinaturas set situacao = 'cancelada', cancelada_em = coalesce(cancelada_em, now())
   where asaas_id = p_asaas_id and situacao <> 'cancelada'
  returning * into a;
  if a.id is null then
    return;
  end if;
  update privado.cobrancas set situacao = 'cancelada', atualizado_em = now()
   where assinatura_id = a.id and situacao in ('pendente', 'atrasada', 'recusada');
  perform privado.avisar_pagamento(a.conta_id,
    'A assinatura do ' || privado.nome_do_recurso(a.recurso) || ' foi cancelada. O que já foi pago continua valendo.',
    '/painel/assinatura');
end
$$;

-- a cobrança de uma conta (o Pix da fatura em aberto, a nota): confere que é dela
create or replace function public.servidor_pagamento_cobranca_da_conta(p_chave text, p_conta uuid, p_cobranca uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select jsonb_build_object('id', c.id, 'asaas_id', c.asaas_id, 'situacao', c.situacao, 'forma', c.forma,
                                    'pix_payload', c.pix_payload, 'pix_expira', c.pix_expira,
                                    'nota_asaas', (select n.asaas_id from privado.notas_fiscais n
                                                    where n.cobranca_id = c.id and n.situacao = 'autorizada'
                                                    order by n.atualizado_em desc limit 1))
            from privado.cobrancas c where c.id = p_cobranca and c.conta_id = p_conta);
end
$$;

revoke execute on function public.servidor_pagamento_contexto(text, uuid),
  public.servidor_pagamento_tentativa(text, uuid),
  public.servidor_pagamento_cliente(text, uuid, text, text, text, text),
  public.servidor_pagamento_assinatura(text, uuid, uuid, text, text, text, date),
  public.servidor_pagamento_vincular(text, jsonb), public.servidor_pagamento_cobranca(text, jsonb),
  public.servidor_pagamento_pix(text, text, text, timestamptz),
  public.servidor_pagamento_nota_configurada(text, uuid), public.servidor_pagamento_nota(text, jsonb),
  public.servidor_pagamento_evento(text, text, text), public.servidor_pagamento_evento_fim(text, text, text),
  public.servidor_pagamento_da_conta(text, uuid, uuid), public.servidor_pagamento_cancelada(text, text),
  public.servidor_pagamento_cobranca_da_conta(text, uuid, uuid)
  from public;
grant execute on function public.servidor_pagamento_contexto(text, uuid),
  public.servidor_pagamento_tentativa(text, uuid),
  public.servidor_pagamento_cliente(text, uuid, text, text, text, text),
  public.servidor_pagamento_assinatura(text, uuid, uuid, text, text, text, date),
  public.servidor_pagamento_vincular(text, jsonb), public.servidor_pagamento_cobranca(text, jsonb),
  public.servidor_pagamento_pix(text, text, text, timestamptz),
  public.servidor_pagamento_nota_configurada(text, uuid), public.servidor_pagamento_nota(text, jsonb),
  public.servidor_pagamento_evento(text, text, text), public.servidor_pagamento_evento_fim(text, text, text),
  public.servidor_pagamento_da_conta(text, uuid, uuid), public.servidor_pagamento_cancelada(text, text),
  public.servidor_pagamento_cobranca_da_conta(text, uuid, uuid)
  to anon, authenticated, service_role;


-- 5. Admin (só service_role) ---------------------------------------------------------------------

create or replace function public.admin_pagamentos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'config', (select to_jsonb(c) - 'id' from privado.config_pagamentos c where c.id),
    'planos', coalesce((select jsonb_agg(to_jsonb(pl) order by pl.recurso, pl.ciclo) from privado.planos pl), '[]'::jsonb),
    'teste', coalesce((select jsonb_agg(jsonb_build_object('conta_id', t.conta_id, 'nome', p.nome,
                                                          'email', u.email) order by t.criado_em desc)
                         from privado.pagamentos_teste t
                         join public.perfis p on p.id = t.conta_id
                         left join auth.users u on u.id = t.conta_id), '[]'::jsonb),
    'assinaturas', coalesce((select jsonb_agg(jsonb_build_object(
                               'id', a.id, 'conta_id', a.conta_id, 'nome', p.nome, 'recurso', a.recurso,
                               'ciclo', a.ciclo, 'valor', a.valor, 'forma', a.forma, 'situacao', a.situacao,
                               'proxima_cobranca', a.proxima_cobranca, 'criada_em', a.criada_em,
                               'atrasadas', (select count(*) from privado.cobrancas c
                                              where c.assinatura_id = a.id
                                                and c.situacao in ('atrasada', 'recusada')))
                               order by a.criada_em desc)
                              from (select * from privado.assinaturas order by criada_em desc limit 300) a
                              join public.perfis p on p.id = a.conta_id), '[]'::jsonb),
    'por_mes', (select coalesce(sum(a.valor / privado.meses_do_ciclo(a.ciclo)), 0)
                  from privado.assinaturas a where a.situacao = 'ativa'),
    'notas_com_erro', coalesce((select jsonb_agg(jsonb_build_object('asaas_id', n.asaas_id, 'erro', n.erro,
                                                                   'nome', p.nome, 'em', n.atualizado_em)
                                                 order by n.atualizado_em desc)
                                  from privado.notas_fiscais n join public.perfis p on p.id = n.conta_id
                                 where n.situacao = 'erro'), '[]'::jsonb),
    'eventos_com_erro', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'erro', e.erro,
                                                                     'em', e.recebido_em) order by e.recebido_em desc)
                                    from (select * from privado.eventos_pagamento
                                           where erro is not null order by recebido_em desc limit 50) e),
                                 '[]'::jsonb)
  )
$$;

create or replace function public.admin_salvar_plano(p_id uuid, p_valor numeric, p_ligado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ligado and p_valor is null then
    raise exception 'Ponha o preço antes de ligar o plano.' using errcode = 'P0001';
  end if;
  update privado.planos set valor = p_valor, ligado = p_ligado, atualizado_em = now() where id = p_id;
end
$$;

create or replace function public.admin_config_pagamentos(p_aberto boolean, p_servico text, p_e_codigo boolean,
                                                          p_descricao text)
returns void
language sql
security definer
set search_path = ''
as $$
  update privado.config_pagamentos
     set aberto = p_aberto, servico_nota = nullif(trim(p_servico), ''), servico_nota_e_codigo = p_e_codigo,
         descricao_nota = nullif(trim(p_descricao), ''), atualizado_em = now()
   where id
$$;

-- a conta de teste pelo e-mail de login ou pelo código da conta
create or replace function public.admin_pagamentos_teste(p_conta text, p_marcar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_conta ~ '^[0-9a-f-]{36}$' then
    v_id := p_conta::uuid;
  else
    select u.id into v_id from auth.users u where lower(u.email) = lower(trim(p_conta));
  end if;
  if v_id is null or not exists (select 1 from public.perfis p where p.id = v_id) then
    raise exception 'Conta não encontrada.' using errcode = 'P0001';
  end if;
  if p_marcar then
    insert into privado.pagamentos_teste (conta_id) values (v_id) on conflict do nothing;
  else
    delete from privado.pagamentos_teste where conta_id = v_id;
  end if;
end
$$;

revoke execute on function public.admin_pagamentos(), public.admin_salvar_plano(uuid, numeric, boolean),
  public.admin_config_pagamentos(boolean, text, boolean, text), public.admin_pagamentos_teste(text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_pagamentos(), public.admin_salvar_plano(uuid, numeric, boolean),
  public.admin_config_pagamentos(boolean, text, boolean, text), public.admin_pagamentos_teste(text, boolean)
  to service_role;

notify pgrst, 'reload schema';
