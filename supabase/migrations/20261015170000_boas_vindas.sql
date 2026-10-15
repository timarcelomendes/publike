-- =====================================================================
-- Boas-vindas e envio de e-mail pelo admin
--
--   * Quem cria a conta recebe um e-mail de boas-vindas com os próximos
--     passos, de acordo com o perfil: quem procura trabalho, comércio ou
--     empresa (publicar a primeira vaga) e agência (publicar as vagas).
--     Liga e desliga no admin, em E-mails ("Boas-vindas").
--   * Admin manda qualquer modelo de e-mail para qualquer conta, na hora,
--     mesmo para quem desligou os avisos (para quando a pessoa não recebeu).
--   * Admin manda as boas-vindas para quem já se cadastrou e ainda não
--     recebeu (e não publicou nada).
--   * A página da conta mostra os últimos e-mails da pessoa.
--
-- Rode depois de 20261015150000_aceite_pendente.sql. Pode rodar de novo.
-- =====================================================================


-- 1. Opção no admin ---------------------------------------------------------------

alter table public.config_site add column if not exists email_boas_vindas boolean not null default true;


-- 2. Textos (editáveis no admin) -----------------------------------------------------

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('boas_vindas_pessoa', 'usuarios', 0, 'Boas-vindas: quem procura trabalho',
     'Quando uma pessoa cria a conta. Explica como achar vagas perto de casa, curtir e preencher o currículo.',
     array['nome', 'link'],
     'Boas-vindas ao Publike, {{nome}}',
     'Oi, {{nome}}. Que bom ter você no Publike!

Para achar trabalho perto de casa:

1. Informe o CEP de casa na busca. As vagas aparecem pela distância e pelo tempo de ônibus.
2. Curta as vagas que combinam com você. Se quem publicou curtir de volta, dá match e o WhatsApp de vocês aparece.
3. Preencha o seu currículo no perfil: estudos, experiências, cursos e CNH. Muitas vagas pedem.

Presta serviço, como diarista, pedreiro ou manicure? Monte a sua vitrine grátis em “Meus serviços”, e quem mora perto chama você.

Lembre: ninguém pode cobrar para você conseguir trabalho, nem pelo Publike nem fora dele.',
     'Ver vagas perto de mim'),

    ('boas_vindas_empresa', 'usuarios', 0, 'Boas-vindas: comércio e empresa',
     'Quando um comércio ou uma empresa cria a conta. Explica como publicar a primeira vaga.',
     array['nome', 'link'],
     '{{nome}}, publique a sua primeira vaga no Publike',
     'Oi, {{nome}}. Boas-vindas ao Publike!

A sua conta está pronta. Falta publicar a primeira vaga, e leva uns dois minutos:

1. Toque em “Publicar grátis” e conte o que a pessoa vai fazer, quanto paga e o horário.
2. Coloque o CEP e o número do endereço: quem mora perto vê a vaga primeiro, com o tempo de ônibus até a sua porta.
3. Quem se interessa curte a vaga. Você recebe um aviso, vê o perfil e o currículo, e curte de volta quem combina. Aí o WhatsApp de vocês aparece.

É grátis, sem plano e sem taxa por candidato. Precisa de ajuda? É só responder este e-mail.',
     'Publicar minha primeira vaga'),

    ('boas_vindas_agencia', 'usuarios', 0, 'Boas-vindas: agência de emprego',
     'Quando uma agência de emprego ou RH cria a conta. Explica como publicar as vagas dos clientes e a verificação do CNPJ.',
     array['nome', 'link'],
     '{{nome}}, publique as vagas da sua agência no Publike',
     'Oi, {{nome}}. Boas-vindas ao Publike!

A conta da sua agência está pronta. Para publicar as vagas:

1. Toque em “Publicar grátis”. Em cada vaga, diga para qual empresa ela é ou marque “Empresa confidencial”.
2. Se quiser, peça currículo: quem curtir preenche estudos, experiências, cursos e CNH.
3. No match, o candidato recebe o WhatsApp e o e-mail da agência, nunca os do cliente.

A equipe confere o CNPJ da agência. Depois disso, vocês podem ter até 200 vagas no ar e publicar 50 por dia.

Tem muitas vagas abertas? Responda este e-mail com a lista, que ajudamos a cadastrar. É tudo grátis, sem plano e sem taxa por candidato.',
     'Publicar as vagas')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- Qual modelo e qual página para cada tipo de conta.
create or replace function privado.boas_vindas_do_tipo(p_tipo text, out modelo text, out caminho text)
language sql
immutable
set search_path = ''
as $$
  select case p_tipo when 'agencia' then 'boas_vindas_agencia'
                     when 'pessoa' then 'boas_vindas_pessoa'
                     else 'boas_vindas_empresa' end,
         case p_tipo when 'pessoa' then '/?tipo=vaga' else '/publicar' end
$$;


-- 3. A fila respeita a opção das boas-vindas ------------------------------------------
-- (a mesma função de 20261013180000_seguranca_e_lgpd.sql, com a opção nova)

CREATE OR REPLACE FUNCTION privado.enfileirar_email(p_usuario uuid, p_modelo text, p_dados jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg public.config_site;
  destino text;
  quer boolean;
  de_conta boolean := p_modelo in ('conta_suspensa', 'conta_banida', 'conta_reativada');
begin
  select * into cfg from public.config_site limit 1;
  if not found or not cfg.emails_ativos then
    return;
  end if;
  if (p_modelo = 'curtida' and not cfg.email_curtida)
     or (p_modelo = 'match' and not cfg.email_match)
     or (p_modelo in ('em_analise', 'removido', 'liberado') and not cfg.email_moderacao)
     or (de_conta and not cfg.email_conta)
     or (p_modelo like 'boas\_vindas\_%' and not cfg.email_boas_vindas) then
    return;
  end if;
  -- avisos de conta vão mesmo para quem desligou os avisos
  if not de_conta then
    select c.receber_emails into quer from public.contatos c where c.perfil_id = p_usuario;
    if quer is false then
      return;
    end if;
  end if;
  -- avisos que podem se repetir: no máximo um do mesmo tipo a cada 30 minutos para a mesma pessoa
  if p_modelo in ('curtida', 'etapa', 'contratacao', 'recomendacao', 'seguindo', 'mensagem') and exists (
    select 1 from privado.fila_emails f
     where f.usuario_id = p_usuario and f.modelo = p_modelo and f.criado_em > now() - interval '30 minutes'
  ) then
    return;
  end if;
  -- e no máximo 30 e-mails por dia para a mesma pessoa (avisos de conta e de moderação passam sempre)
  if not de_conta and p_modelo not in ('em_analise', 'removido', 'liberado') and (
    select count(*) from privado.fila_emails f
     where f.usuario_id = p_usuario and f.criado_em > now() - interval '1 day'
  ) >= 30 then
    return;
  end if;
  -- só para o e-mail de login confirmado (nunca para um endereço que a pessoa só digitou)
  select nullif(btrim(u.email::text), '') into destino
    from auth.users u
   where u.id = p_usuario and u.email_confirmed_at is not null;
  if destino is null or destino !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return;
  end if;
  insert into privado.fila_emails (modelo, para, usuario_id, dados)
  values (p_modelo, lower(destino), p_usuario,
          jsonb_build_object('nome', coalesce(privado.nome_para_email(p_usuario), ''))
          || coalesce(p_dados, '{}'::jsonb));
exception
  when others then
    raise warning 'Publike: e-mail % não entrou na fila (%).', p_modelo, sqlerrm;
end
$function$;


-- 4. Conta nova: boas-vindas ----------------------------------------------------------
-- Só no cadastro feito pela própria pessoa. Conta criada pela equipe (admin)
-- recebe o e-mail de acesso, que já explica o que fazer.

create or replace function privado.perfil_boas_vindas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
begin
  if new.id is distinct from (select auth.uid()) then
    return null;
  end if;
  select * into b from privado.boas_vindas_do_tipo(new.tipo);
  perform privado.enfileirar_email(new.id, b.modelo, jsonb_build_object('caminho', b.caminho));
  return null;
end
$$;

drop trigger if exists perfis_boas_vindas on public.perfis;
create trigger perfis_boas_vindas
  after insert on public.perfis
  for each row execute function privado.perfil_boas_vindas();


-- 5. Admin: mandar um e-mail para uma conta, na hora ----------------------------------
-- Vai mesmo com os avisos desligados (é a equipe pedindo). Para o e-mail de
-- login; sem ele (conta do celular), para o e-mail de contato do perfil.

create or replace function public.admin_enviar_email(p_usuario uuid, p_modelo text, p_dados jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.modelos_email;
  destino text;
  v_nome text;
  v_tipo text;
  dados jsonb := '{}'::jsonb;
  k text;
  valor text;
  novo bigint;
begin
  perform privado.exigir_admin();
  select * into m from public.modelos_email me where me.chave = p_modelo and me.grupo = 'usuarios';
  if not found then
    raise exception 'Escolha um modelo de e-mail para quem usa o site.' using errcode = 'P0001';
  end if;
  select coalesce(nullif(btrim(u.email::text), ''), nullif(btrim(c.email), '')), p.nome, p.tipo
    into destino, v_nome, v_tipo
    from auth.users u
    left join public.contatos c on c.perfil_id = u.id
    left join public.perfis p on p.id = u.id
   where u.id = p_usuario;
  if destino is null or destino !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Esta conta não tem e-mail para receber.' using errcode = 'P0001';
  end if;
  -- só as variáveis do modelo, como texto curto (o link é montado com o endereço do site)
  for k, valor in select * from jsonb_each_text(coalesce(p_dados, '{}'::jsonb)) loop
    if k = any (m.variaveis) and k not in ('link', 'nome') and btrim(coalesce(valor, '')) <> '' then
      dados := dados || jsonb_build_object(k, left(btrim(valor), 500));
    elsif k = 'caminho' and valor ~ '^/[^/]' and char_length(valor) <= 300 then
      dados := dados || jsonb_build_object('caminho', valor);
    end if;
  end loop;
  if not dados ? 'caminho' then
    dados := dados || jsonb_build_object('caminho',
      case when p_modelo like 'boas\_vindas\_%' then (privado.boas_vindas_do_tipo(v_tipo)).caminho else '/painel' end);
  end if;
  insert into privado.fila_emails (modelo, para, usuario_id, dados)
  values (p_modelo, lower(destino), p_usuario,
          jsonb_build_object('nome', coalesce(privado.nome_para_email(p_usuario), v_nome, '')) || dados)
  returning id into novo;
  perform privado.registrar('enviar_email', 'usuario', p_usuario::text, coalesce(v_nome, destino),
                            jsonb_build_object('modelo', p_modelo));
  return novo;
end
$$;


-- 6. Admin: boas-vindas para quem já se cadastrou ---------------------------------------
-- Quem ainda não recebeu nenhuma boas-vindas e não publicou nada. Segue as
-- regras da fila (opção ligada, avisos ligados, e-mail de login confirmado).

create or replace function public.admin_boas_vindas_pendentes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes bigint;
  depois bigint;
  p record;
  b record;
begin
  perform privado.exigir_admin();
  select count(*) into antes from privado.fila_emails f where f.modelo like 'boas\_vindas\_%';
  for p in
    select pf.id, pf.tipo from public.perfis pf
     where not exists (select 1 from public.anuncios a where a.autor_id = pf.id)
       and not exists (select 1 from privado.fila_emails f
                        where f.usuario_id = pf.id and f.modelo like 'boas\_vindas\_%')
       and (pf.suspenso_ate is null or pf.suspenso_ate <= now())
  loop
    select * into b from privado.boas_vindas_do_tipo(p.tipo);
    perform privado.enfileirar_email(p.id, b.modelo, jsonb_build_object('caminho', b.caminho));
  end loop;
  select count(*) into depois from privado.fila_emails f where f.modelo like 'boas\_vindas\_%';
  if depois > antes then
    perform privado.registrar('enviar_boas_vindas', 'config', 'emails', 'Boas-vindas',
                              jsonb_build_object('total', depois - antes));
  end if;
  return depois - antes;
end
$$;


-- 7. Admin: os últimos e-mails de uma conta ----------------------------------------------

create or replace function public.admin_emails_do_usuario(p_usuario uuid, p_limite integer default 15)
returns table (
  id bigint,
  modelo text,
  para text,
  status text,
  tentativas smallint,
  erro text,
  criado_em timestamptz,
  enviado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select f.id, f.modelo, f.para, f.status, f.tentativas, f.erro, f.criado_em, f.enviado_em
    from privado.fila_emails f
   where f.usuario_id = p_usuario
   order by f.id desc
   limit least(greatest(coalesce(p_limite, 15), 1), 50);
end
$$;


-- 8. Salvar as configurações de e-mail com a opção nova ----------------------------------

drop function if exists public.admin_salvar_config_emails(
  boolean, text, text, boolean, boolean, boolean, boolean, text[], boolean, boolean, boolean
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
  p_email_boas_vindas boolean default true
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
         atualizado_em = now(),
         atualizado_por = (select auth.uid())
   where id;
  perform privado.registrar('salvar_config', 'config', 'emails', 'E-mails', '{}'::jsonb);
end
$$;


-- 9. Permissões --------------------------------------------------------------------

revoke execute on function privado.boas_vindas_do_tipo(text), privado.perfil_boas_vindas() from public;
revoke execute on function public.admin_enviar_email(uuid, text, jsonb), public.admin_boas_vindas_pendentes(),
  public.admin_emails_do_usuario(uuid, integer),
  public.admin_salvar_config_emails(boolean, text, text, boolean, boolean, boolean, boolean, text[], boolean, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_enviar_email(uuid, text, jsonb), public.admin_boas_vindas_pendentes(),
  public.admin_emails_do_usuario(uuid, integer),
  public.admin_salvar_config_emails(boolean, text, text, boolean, boolean, boolean, boolean, text[], boolean, boolean, boolean, boolean)
  to service_role;

notify pgrst, 'reload schema';
