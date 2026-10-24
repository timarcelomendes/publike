-- Falhas ao publicar vaga e ao salvar currículo (04/11/2026). Pode rodar de novo.
--
--   Toda vez que publicar/editar uma vaga ou salvar o currículo dá errado, o site registra
--   em privado.falhas_cadastro (90 dias) e a equipe é avisada por e-mail (modelo aviso_falha,
--   para os e-mails de "Avisos para a equipe"):
--     * erro do sistema (banco, envio do PDF, leitura da IA, salvar que não chegou ao servidor,
--       erro inesperado): aviso na hora, no máximo um por falha igual a cada 15 minutos;
--     * erro de preenchimento (campo faltando ou errado): só registra. Se a mesma conta errar
--       3 vezes em 30 minutos no mesmo formulário, a equipe é avisada de que a pessoa travou
--       (no máximo um aviso por conta e formulário a cada 6 horas).
--   No máximo 20 avisos de falha por hora no total, para um problema geral não lotar a caixa.
--   Admin › Falhas lista tudo; o aviso liga e desliga em E-mails › Avisos para a equipe.
--
-- Rode depois de 20261103120000_recado_com_curriculo.sql.

-- 1. Opção no admin --------------------------------------------------------------------

alter table public.config_site add column if not exists aviso_falha boolean not null default true;


-- 2. Registro --------------------------------------------------------------------------

create table if not exists privado.falhas_cadastro (
  id bigint generated always as identity primary key,
  onde text not null check (onde in ('vaga', 'curriculo')),
  etapa text not null check (etapa in ('validacao', 'banco', 'arquivo', 'leitura', 'conexao', 'inesperado')),
  -- o que a pessoa viu na tela
  mensagem text not null check (char_length(mensagem) <= 500),
  -- o erro técnico (código e texto do banco, da exceção, do Storage)
  detalhe text check (char_length(detalhe) <= 1000),
  codigo text check (char_length(codigo) <= 60),
  campos text[] not null default '{}' check (cardinality(campos) <= 40),
  pagina text check (char_length(pagina) <= 300),
  navegador text check (char_length(navegador) <= 300),
  conta_id uuid references auth.users (id) on delete set null,
  pessoa_id uuid references auth.users (id) on delete set null,
  avisado boolean not null default false,
  criado_em timestamptz not null default now()
);
-- Sem regras: ninguém lê nem escreve direto pela API, só pelas funções abaixo.
alter table privado.falhas_cadastro enable row level security;
create index if not exists falhas_cadastro_criado_idx on privado.falhas_cadastro (criado_em desc);
create index if not exists falhas_cadastro_conta_idx on privado.falhas_cadastro (conta_id, criado_em desc)
  where conta_id is not null;


-- 3. Texto do e-mail (editável no admin) ------------------------------------------------

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('aviso_falha', 'equipe', 13, 'Falha na vaga ou no currículo',
     'Aviso para a equipe quando publicar uma vaga ou salvar um currículo dá erro do sistema (no máximo um por falha igual a cada 15 minutos), ou quando alguém erra o mesmo formulário 3 vezes em 30 minutos.',
     array['resumo', 'onde', 'tipo', 'mensagem', 'detalhe', 'quem', 'pagina', 'total', 'link'],
     'Falha: {{resumo}}',
     '{{resumo}}.

Onde: {{onde}}
Tipo: {{tipo}}
Quem: {{quem}}
Página: {{pagina}}

O que a pessoa viu: {{mensagem}}

Detalhe: {{detalhe}}

Falhas iguais nas últimas 24 horas: {{total}}.',
     'Ver as falhas')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;


-- 4. Aviso para a equipe respeita a opção nova ------------------------------------------

create or replace function privado.avisar_equipe(p_modelo text, p_dados jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.config_site;
begin
  select * into cfg from public.config_site limit 1;
  if not found or not cfg.emails_ativos then
    return;
  end if;
  if (p_modelo = 'aviso_denuncia' and not cfg.aviso_denuncia)
     or (p_modelo = 'aviso_cadastro' and not cfg.aviso_cadastro)
     or (p_modelo = 'aviso_retirado' and not cfg.aviso_retirado)
     or (p_modelo = 'aviso_falha' and not cfg.aviso_falha) then
    return;
  end if;
  insert into privado.fila_emails (modelo, para, dados)
  select p_modelo, d.email, coalesce(p_dados, '{}'::jsonb)
    from (select distinct lower(btrim(x)) as email from unnest(cfg.avisos_para) as x) d
   where d.email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
exception
  when others then
    raise warning 'Publike: aviso % não entrou na fila (%).', p_modelo, sqlerrm;
end
$$;


-- 5. Registrar (o site chama; com ou sem conta) -----------------------------------------

create or replace function public.registrar_falha_cadastro(
  p_onde text,
  p_etapa text,
  p_mensagem text,
  p_detalhe text default null,
  p_codigo text default null,
  p_campos text[] default '{}',
  p_pagina text default null,
  p_navegador text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select public.conta_atual());
  v_pessoa uuid := (select auth.uid());
  v_id bigint;
  v_chave text;
  v_total integer;
  v_resumo text;
  v_quem text;
  v_onde text := case p_onde when 'vaga' then 'Publicar ou editar vaga' else 'Salvar currículo' end;
  v_tipo text := case p_etapa
                   when 'validacao' then 'preenchimento'
                   when 'banco' then 'banco de dados'
                   when 'arquivo' then 'envio do PDF ou da foto'
                   when 'leitura' then 'leitura do arquivo pela IA'
                   when 'conexao' then 'o salvar não chegou ao servidor'
                   else 'erro inesperado'
                 end;
begin
  if p_onde is null or p_onde not in ('vaga', 'curriculo')
     or p_etapa is null or p_etapa not in ('validacao', 'banco', 'arquivo', 'leitura', 'conexao', 'inesperado') then
    return;
  end if;

  -- limites: 30 por conta por hora; sem conta, 300 por hora no total
  if v_conta is not null then
    if (select count(*) from privado.falhas_cadastro f
         where f.conta_id = v_conta and f.criado_em > now() - interval '1 hour') >= 30 then
      return;
    end if;
  elsif (select count(*) from privado.falhas_cadastro f
          where f.conta_id is null and f.criado_em > now() - interval '1 hour') >= 300 then
    return;
  end if;

  insert into privado.falhas_cadastro (onde, etapa, mensagem, detalhe, codigo, campos, pagina, navegador, conta_id, pessoa_id)
  values (
    p_onde,
    p_etapa,
    left(coalesce(nullif(btrim(p_mensagem), ''), '(sem mensagem)'), 500),
    left(nullif(btrim(p_detalhe), ''), 1000),
    left(nullif(btrim(p_codigo), ''), 60),
    coalesce((select array_agg(left(c, 60)) from unnest(p_campos[1:40]) c where c is not null), '{}'),
    left(nullif(btrim(p_pagina), ''), 300),
    left(nullif(btrim(p_navegador), ''), 300),
    v_conta,
    v_pessoa
  )
  returning id into v_id;

  -- limpeza de vez em quando
  if v_id % 200 = 0 then
    delete from privado.falhas_cadastro where criado_em < now() - interval '90 days';
  end if;

  -- erro de preenchimento: só avisa quando a pessoa travou
  if p_etapa = 'validacao' then
    if v_conta is null
       or (select count(*) from privado.falhas_cadastro f
            where f.conta_id = v_conta and f.onde = p_onde and f.etapa = 'validacao'
              and f.criado_em > now() - interval '30 minutes') < 3 then
      return;
    end if;
    v_chave := 'travou:' || v_conta || ':' || p_onde;
    v_resumo := case p_onde when 'vaga' then 'alguém não consegue publicar a vaga' else 'alguém não consegue salvar o currículo' end;
    if exists (select 1 from privado.fila_emails e
                where e.modelo = 'aviso_falha' and e.criado_em > now() - interval '6 hours'
                  and e.dados ->> 'chave' = v_chave) then
      return;
    end if;
  else
    v_chave := p_onde || ':' || p_etapa || ':' || coalesce(nullif(btrim(p_codigo), ''), left(btrim(coalesce(p_detalhe, p_mensagem, '')), 80));
    v_resumo := case p_onde when 'vaga' then 'erro ao publicar vaga' else 'erro ao salvar currículo' end;
    if exists (select 1 from privado.fila_emails e
                where e.modelo = 'aviso_falha' and e.criado_em > now() - interval '15 minutes'
                  and e.dados ->> 'chave' = v_chave) then
      return;
    end if;
  end if;

  -- um problema geral não lota a caixa
  if (select count(distinct e.dados ->> 'chave') from privado.fila_emails e
       where e.modelo = 'aviso_falha' and e.criado_em > now() - interval '1 hour') >= 20 then
    return;
  end if;

  select count(*) into v_total
    from privado.falhas_cadastro f
   where f.onde = p_onde and f.etapa = p_etapa and f.criado_em > now() - interval '24 hours'
     and (p_etapa = 'validacao' and f.conta_id = v_conta
          or p_etapa <> 'validacao' and coalesce(f.codigo, '') = coalesce(left(nullif(btrim(p_codigo), ''), 60), ''));

  select coalesce(p.nome, 'conta sem nome') || ' (' || coalesce(p.tipo, '?') || ')' into v_quem
    from public.perfis p where p.id = v_conta;

  perform privado.avisar_equipe('aviso_falha', jsonb_build_object(
    'chave', v_chave,
    'resumo', upper(left(v_resumo, 1)) || substr(v_resumo, 2),
    'onde', v_onde,
    'tipo', v_tipo,
    'mensagem', left(coalesce(nullif(btrim(p_mensagem), ''), '(sem mensagem)'), 500),
    'detalhe', coalesce(left(nullif(btrim(p_detalhe), ''), 500),
                        case when cardinality(p_campos) > 0 then 'campos: ' || array_to_string(p_campos[1:20], ', ') end,
                        '—'),
    'quem', coalesce(v_quem, 'sem conta (ainda não entrou)'),
    'pagina', coalesce(left(nullif(btrim(p_pagina), ''), 300), '—'),
    'total', v_total::text,
    'caminho', '/admin/falhas'));

  update privado.falhas_cadastro set avisado = true where id = v_id;
exception
  when others then
    -- registrar a falha nunca pode virar outra falha para a pessoa
    raise warning 'Publike: a falha não foi registrada (%).', sqlerrm;
end
$$;


-- 6. Admin › Falhas ---------------------------------------------------------------------

create or replace function public.admin_listar_falhas(p_limite integer default 200)
returns table (
  id bigint,
  onde text,
  etapa text,
  mensagem text,
  detalhe text,
  codigo text,
  campos text[],
  pagina text,
  navegador text,
  conta_id uuid,
  conta_nome text,
  conta_tipo text,
  avisado boolean,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query
  select f.id, f.onde, f.etapa, f.mensagem, f.detalhe, f.codigo, f.campos, f.pagina, f.navegador,
         f.conta_id, p.nome, p.tipo, f.avisado, f.criado_em
    from privado.falhas_cadastro f
    left join public.perfis p on p.id = f.conta_id
   order by f.id desc
   limit least(greatest(coalesce(p_limite, 200), 1), 500);
end
$$;


-- 7. Salvar as configurações de e-mail com a opção nova ----------------------------------

drop function if exists public.admin_salvar_config_emails(
  boolean, text, text, boolean, boolean, boolean, boolean, text[], boolean, boolean, boolean, boolean
);
create or replace function public.admin_salvar_config_emails(
  p_emails_ativos boolean,
  p_remetente_nome text,
  p_responder_para text,
  p_email_curtida boolean,
  p_email_match boolean,
  p_email_moderacao boolean,
  p_email_conta boolean,
  p_avisos_para text[],
  p_aviso_denuncia boolean,
  p_aviso_cadastro boolean,
  p_aviso_retirado boolean,
  p_email_boas_vindas boolean default true,
  p_aviso_falha boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lista text[];
  responder text := nullif(lower(btrim(coalesce(p_responder_para, ''))), '');
begin
  perform privado.exigir_admin();
  select coalesce(array_agg(distinct lower(btrim(x))), '{}') into lista
    from unnest(coalesce(p_avisos_para, '{}')) as x
   where btrim(x) <> '';
  if exists (select 1 from unnest(lista) as x where x !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Confira os e-mails que recebem os avisos da equipe.' using errcode = 'P0001';
  end if;
  if cardinality(lista) > 10 then
    raise exception 'Coloque no máximo 10 e-mails para os avisos.' using errcode = 'P0001';
  end if;
  if responder is not null and responder !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Confira o e-mail de resposta.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_remetente_nome, ''))) not between 2 and 60 then
    raise exception 'O nome do remetente precisa ter entre 2 e 60 letras.' using errcode = 'P0001';
  end if;
  update public.config_site
     set emails_ativos = coalesce(p_emails_ativos, true),
         remetente_nome = btrim(p_remetente_nome),
         responder_para = responder,
         email_curtida = coalesce(p_email_curtida, true),
         email_match = coalesce(p_email_match, true),
         email_moderacao = coalesce(p_email_moderacao, true),
         email_conta = coalesce(p_email_conta, true),
         email_boas_vindas = coalesce(p_email_boas_vindas, true),
         avisos_para = lista,
         aviso_denuncia = coalesce(p_aviso_denuncia, true),
         aviso_cadastro = coalesce(p_aviso_cadastro, true),
         aviso_retirado = coalesce(p_aviso_retirado, true),
         aviso_falha = coalesce(p_aviso_falha, true),
         atualizado_em = now(),
         atualizado_por = (select auth.uid())
   where id;
  perform privado.registrar('salvar_config', 'config', 'emails', 'E-mails', '{}'::jsonb);
end
$$;


-- 8. Permissões --------------------------------------------------------------------------

revoke all on privado.falhas_cadastro from public, anon, authenticated;

revoke execute on function public.registrar_falha_cadastro(text, text, text, text, text, text[], text, text)
  from public;
grant execute on function public.registrar_falha_cadastro(text, text, text, text, text, text[], text, text)
  to anon, authenticated, service_role;

revoke execute on function
  public.admin_listar_falhas(integer),
  public.admin_salvar_config_emails(
    boolean, text, text, boolean, boolean, boolean, boolean, text[], boolean, boolean, boolean, boolean, boolean)
from public, anon, authenticated;
grant execute on function
  public.admin_listar_falhas(integer),
  public.admin_salvar_config_emails(
    boolean, text, text, boolean, boolean, boolean, boolean, text[], boolean, boolean, boolean, boolean, boolean)
to service_role;

notify pgrst, 'reload schema';
