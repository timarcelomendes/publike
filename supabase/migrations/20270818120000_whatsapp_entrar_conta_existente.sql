-- Entrar com o WhatsApp sem criar conta duplicada (20/11/2026; Marcelo: "e se a pessoa já tem uma conta com e-mail,
-- qual caminho, precisa verificar se existe o numero associado a alguma conta" e "tome cuidado absoluto").
--
-- O login por celular é o do Supabase Auth: o código vai pelo gancho "Send SMS" (/api/auth/codigo-whatsapp,
-- migração 20270817120000) e o Auth acha a conta pelo celular do login (auth.users.phone). Três caminhos:
--   1. O celular já é o login de uma conta: o código entra nela (o Auth faz isso sozinho).
--   2. O celular está só no cadastro (contatos.whatsapp) de uma conta com e-mail: o Publike não entra nela sozinho
--      (um número digitado errado daria a conta a um desconhecido). O código vai com o aviso "este WhatsApp está no
--      cadastro de uma conta com o e-mail m•••@gmail.com" (só no WhatsApp do número, nunca na tela).
--   3. Ninguém tem o número: conta nova.
-- E para o caminho 2 sumir: em Meu perfil, "Entrar também pelo WhatsApp" liga o número ao login com um código do
-- Publike (não o "phone_change" do Auth: no gancho, a troca e o login são difíceis de separar com segurança, então o
-- gancho recusa toda troca de celular pelo Auth). E quem aceita os avisos pelo botão do WhatsApp depois de publicar
-- ("Sim, quero receber") tem o número ligado ao login quando o cadastro da conta tem o mesmo número: são as duas
-- pontas dizendo a mesma coisa (a conta escreveu o número; o dono do número tocou no botão da vaga dela).
--
-- O celular do login fica sempre com o 55 e, no celular do Brasil, com o 9 (o WhatsApp guarda sem o 9; sem um
-- formato só, a mesma pessoa viraria duas contas). Esta migração passa para esse formato os que estavam sem o 9.
--
-- Nunca liga: conta da equipe do Publike ou da moderação, agência com equipe, conta suspensa, banida ou apagada, e
-- número que já é login de outra conta. Toda ligação fica registrada em privado.whatsapp_login. A conta da equipe ou
-- da moderação que já tenha um celular também não recebe o código (o gancho pergunta em contas_do_numero).
--
-- Pode rodar de novo.

-- 1. O formato do celular do login -------------------------------------------------------------------------------------

-- "556282028335", "(62) 98202-8335", "62982028335" → "5562982028335"; fixo (2 a 5) fica; inválido → null
create or replace function privado.telefone_do_login(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when d ~ '^55[1-9][1-9]9[0-9]{8}$' then d
           when d ~ '^55[1-9][1-9][6-9][0-9]{7}$' then substr(d, 1, 4) || '9' || substr(d, 5)
           when d ~ '^55[1-9][1-9][2-5][0-9]{7}$' then d
         end
    from (select case when x ~ '^55[0-9]{10,11}$' then x
                      when x ~ '^[0-9]{10,11}$' then '55' || x
                      else x end as d
            from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as x) a) b
$$;

-- os jeitos de escrever o mesmo número: o do login e, no celular, o sem o 9 (o do WhatsApp)
create or replace function privado.numeros_do_whatsapp(p text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when t is null then array[]::text[]
              when t ~ '^55[1-9][1-9]9[0-9]{8}$' then array[t, substr(t, 1, 4) || substr(t, 6)]
              else array[t] end
    from (select privado.telefone_do_login(p) as t) a
$$;

-- "marcelo@gmail.com" → "m•••@gmail.com"; "rh@padariapaoquente.com.br" → "r•••@p•••.com.br" (o domínio da empresa
-- também fica escondido: o aviso pode chegar a quem digitou o número errado)
create or replace function privado.email_mascarado(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when coalesce(p, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then null
           when lower(split_part(p, '@', 2)) in ('gmail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com',
                                                'outlook.com.br', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.br',
                                                'icloud.com', 'uol.com.br', 'bol.com.br', 'terra.com.br')
             then left(split_part(p, '@', 1), 1) || '•••@' || lower(split_part(p, '@', 2))
           else left(split_part(p, '@', 1), 1) || '•••@' || left(split_part(p, '@', 2), 1) || '•••'
                || substr(lower(split_part(p, '@', 2)), position('.' in split_part(p, '@', 2)))
         end
$$;

-- a equipe do Publike e a moderação: nunca ligadas pelo WhatsApp, nem citadas no aviso
create or replace function privado.conta_da_equipe_publike(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.painel_no_site p where p.usuario_id = p_usuario)
      or exists (select 1 from public.moderadores m where m.perfil_id = p_usuario)
      or exists (select 1 from auth.users u where u.id = p_usuario and lower(coalesce(u.email, '')) like '%@publike.org')
$$;
revoke all on function privado.conta_da_equipe_publike(uuid) from public, anon, authenticated;

-- 2. O registro e os códigos de ligar ----------------------------------------------------------------------------------

create table if not exists privado.whatsapp_login (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  numero text not null,
  origem text not null check (origem in ('codigo', 'aceite')),
  ligado_em timestamptz not null default now(),
  desligado_em timestamptz
);
create index if not exists whatsapp_login_usuario on privado.whatsapp_login (usuario_id);
alter table privado.whatsapp_login enable row level security;
revoke all on table privado.whatsapp_login from public, anon, authenticated;

-- o código do "Entrar também pelo WhatsApp" (só a impressão HMAC dele, feita no servidor do site; 10 minutos, 5 tentativas)
create table if not exists privado.whatsapp_ligacoes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  numero text not null,
  codigo_hash text not null check (codigo_hash ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '10 minutes',
  tentativas smallint not null default 0,
  usado_em timestamptz
);
create index if not exists whatsapp_ligacoes_usuario on privado.whatsapp_ligacoes (usuario_id, criado_em desc);
create index if not exists whatsapp_ligacoes_numero on privado.whatsapp_ligacoes (numero, criado_em desc);
alter table privado.whatsapp_ligacoes enable row level security;
revoke all on table privado.whatsapp_ligacoes from public, anon, authenticated;

-- 3. Ligar o número ao login (o único lugar que escreve o celular em auth.users) ------------------------------------

-- 'ligado', 'ja_ligado' (o mesmo número), 'ja_tem_outro', 'numero_em_uso', 'conta_invalida' ou 'numero_invalido'
create or replace function privado.ligar_whatsapp_ao_login(p_usuario uuid, p_numero text, p_origem text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tel text := privado.telefone_do_login(p_numero);
  v_variantes text[] := privado.numeros_do_whatsapp(p_numero);
  u record;
begin
  if v_tel is null then
    return 'numero_invalido';
  end if;
  select x.id, x.phone, x.deleted_at, x.banned_until, x.is_anonymous, x.is_sso_user
    into u
    from auth.users x
   where x.id = p_usuario
     for update;
  if not found or u.deleted_at is not null or coalesce(u.is_anonymous, false) or coalesce(u.is_sso_user, false)
     or (u.banned_until is not null and u.banned_until > now())
     or privado.conta_da_equipe_publike(p_usuario) then
    return 'conta_invalida';
  end if;
  if coalesce(u.phone, '') <> '' then
    return case when u.phone = any (v_variantes) then 'ja_ligado' else 'ja_tem_outro' end;
  end if;
  if exists (select 1 from auth.users o where o.id <> p_usuario and o.phone = any (v_variantes))
     or exists (select 1 from auth.identities i
                 where i.user_id <> p_usuario and i.provider = 'phone' and i.provider_id = any (v_variantes)) then
    return 'numero_em_uso';
  end if;
  update auth.users
     set phone = v_tel, phone_confirmed_at = now(), phone_change = '', phone_change_token = '',
         phone_change_sent_at = null, updated_at = now()
   where id = p_usuario;
  insert into privado.whatsapp_login (usuario_id, numero, origem) values (p_usuario, v_tel, p_origem);
  return 'ligado';
exception
  when unique_violation then
    return 'numero_em_uso';
end
$$;
revoke all on function privado.ligar_whatsapp_ao_login(uuid, text, text) from public, anon, authenticated;

-- 4. "Entrar também pelo WhatsApp" (Meu perfil): pedir o código e conferir ---------------------------------------------

-- O site gera o código, guarda a impressão aqui e manda pelo WhatsApp (só na janela de 24 horas, de graça). Devolve a
-- conversa e o número para o envio, ou o erro: 'numero_invalido', 'conta_invalida', 'ja_tem' (já entra com um
-- celular), 'numero_em_uso', 'muitos_pedidos' (5 por hora, por pessoa e por número) ou 'fora_da_janela'.
create or replace function public.servidor_whatsapp_ligacao_pedir(p_chave text, p_usuario uuid, p_numero text, p_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tel text := privado.telefone_do_login(p_numero);
  v_variantes text[] := privado.numeros_do_whatsapp(p_numero);
  u record;
  v_conversa text;
  v_numero text;
  v_janela boolean;
begin
  perform privado.exigir_servidor(p_chave);
  if v_tel is null then
    return jsonb_build_object('ok', false, 'erro', 'numero_invalido');
  end if;
  if coalesce(p_hash, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'erro', 'conta_invalida');
  end if;
  select x.phone, x.deleted_at, x.banned_until, x.is_anonymous into u from auth.users x where x.id = p_usuario;
  if not found or u.deleted_at is not null or coalesce(u.is_anonymous, false)
     or (u.banned_until is not null and u.banned_until > now()) or privado.conta_da_equipe_publike(p_usuario) then
    return jsonb_build_object('ok', false, 'erro', 'conta_invalida');
  end if;
  if coalesce(u.phone, '') <> '' then
    return jsonb_build_object('ok', false, 'erro', 'ja_tem');
  end if;
  if exists (select 1 from auth.users o where o.id <> p_usuario and o.phone = any (v_variantes))
     or exists (select 1 from auth.identities i
                 where i.user_id <> p_usuario and i.provider = 'phone' and i.provider_id = any (v_variantes)) then
    return jsonb_build_object('ok', false, 'erro', 'numero_em_uso');
  end if;
  if (select count(*) from privado.whatsapp_ligacoes l
       where l.usuario_id = p_usuario and l.criado_em > now() - interval '1 hour') >= 5
     or (select count(*) from privado.whatsapp_ligacoes l
          where l.numero = v_tel and l.criado_em > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'erro', 'muitos_pedidos');
  end if;
  select c.chave, c.numero, coalesce(c.ultima_da_pessoa_em > now() - interval '23 hours', false)
    into v_conversa, v_numero, v_janela
    from privado.whatsapp_conversas c
   where c.numero = any (v_variantes)
   order by c.ultima_da_pessoa_em desc nulls last
   limit 1;
  if v_conversa is null or not v_janela then
    return jsonb_build_object('ok', false, 'erro', 'fora_da_janela');
  end if;
  -- o código novo vale; os de antes, não
  update privado.whatsapp_ligacoes set expira_em = least(expira_em, now())
   where usuario_id = p_usuario and usado_em is null and expira_em > now();
  insert into privado.whatsapp_ligacoes (usuario_id, numero, codigo_hash) values (p_usuario, v_tel, p_hash);
  return jsonb_build_object('ok', true, 'conversa', v_conversa, 'numero', v_numero);
end
$$;

-- Confere o código (a impressão) e, certo, liga. Erros: 'numero_invalido', 'codigo_vencido', 'muitas_tentativas',
-- 'codigo_errado' (com quantas tentativas restam) e os da ligação ('ja_tem_outro', 'numero_em_uso', 'conta_invalida').
create or replace function public.servidor_whatsapp_ligacao_conferir(p_chave text, p_usuario uuid, p_numero text, p_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tel text := privado.telefone_do_login(p_numero);
  l privado.whatsapp_ligacoes;
  r text;
begin
  perform privado.exigir_servidor(p_chave);
  if v_tel is null then
    return jsonb_build_object('ok', false, 'erro', 'numero_invalido');
  end if;
  select * into l
    from privado.whatsapp_ligacoes x
   where x.usuario_id = p_usuario and x.numero = v_tel and x.usado_em is null
   order by x.id desc
   limit 1
     for update;
  if not found or l.expira_em <= now() then
    return jsonb_build_object('ok', false, 'erro', 'codigo_vencido');
  end if;
  if l.tentativas >= 5 then
    return jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  end if;
  if l.codigo_hash <> coalesce(p_hash, '') then
    update privado.whatsapp_ligacoes set tentativas = tentativas + 1 where id = l.id;
    return jsonb_build_object('ok', false, 'erro', case when l.tentativas + 1 >= 5 then 'muitas_tentativas' else 'codigo_errado' end,
                              'restam', greatest(0, 4 - l.tentativas));
  end if;
  update privado.whatsapp_ligacoes set usado_em = now() where id = l.id;
  r := privado.ligar_whatsapp_ao_login(p_usuario, v_tel, 'codigo');
  return jsonb_build_object('ok', r in ('ligado', 'ja_ligado'), 'erro', case when r in ('ligado', 'ja_ligado') then null else r end);
end
$$;

-- Desligar (Meu perfil): só quem também entra com o e-mail confirmado (senão a conta ficaria sem entrada).
-- 'desligado', 'nada' (não tinha) ou 'sem_email'.
create or replace function public.servidor_whatsapp_login_desligar(p_chave text, p_usuario uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  u record;
begin
  perform privado.exigir_servidor(p_chave);
  select x.phone, x.email, x.email_confirmed_at into u from auth.users x where x.id = p_usuario for update;
  if not found or coalesce(u.phone, '') = '' then
    return 'nada';
  end if;
  if coalesce(u.email, '') = '' or u.email_confirmed_at is null then
    return 'sem_email';
  end if;
  update auth.users
     set phone = null, phone_confirmed_at = null, phone_change = '', phone_change_token = '',
         phone_change_sent_at = null, updated_at = now()
   where id = p_usuario;
  delete from auth.identities where user_id = p_usuario and provider = 'phone';
  update privado.whatsapp_login set desligado_em = now() where usuario_id = p_usuario and desligado_em is null;
  return 'desligado';
end
$$;

-- 5. O aceite pelo botão do WhatsApp ("Sim, quero receber") liga o login quando o cadastro tem o mesmo número ----------

-- Chamada pelo site logo depois do aceite (servidor_whatsapp_aceite_pela_vaga), só com o login pelo celular ligado.
-- Liga só se: a conta escreveu esse número no cadastro (contatos.whatsapp), não tem equipe de agência, não é da equipe
-- do Publike, não está suspensa e ainda não entra com celular nenhum. {ligou: true|false}
create or replace function public.servidor_whatsapp_login_pela_vaga(p_chave text, p_conversa text, p_vaga uuid)
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
    return jsonb_build_object('ligou', false);
  end if;
  select c.numero into v_numero from privado.whatsapp_conversas c where c.chave = p_conversa;
  v_numero := privado.telefone_do_login(coalesce(v_numero, v.numero));
  if v_numero is null
     -- o aceite pelo botão é desta conta e deste número
     or not exists (select 1 from privado.whatsapp_permissoes w
                     where w.conta_id = v.conta_id and w.origem = 'whatsapp' and w.cancelado_em is null
                       and privado.telefone_do_login(w.numero) = v_numero)
     -- e a conta escreveu o mesmo número no cadastro
     or not exists (select 1 from public.contatos ct
                     where ct.perfil_id = v.conta_id and privado.telefone_do_login(ct.whatsapp) = v_numero)
     or exists (select 1 from public.equipe_agencia e where e.agencia_id = v.conta_id)
     or exists (select 1 from public.perfis p where p.id = v.conta_id and p.suspenso_ate is not null and p.suspenso_ate > now()) then
    return jsonb_build_object('ligou', false);
  end if;
  return jsonb_build_object('ligou', privado.ligar_whatsapp_ao_login(v.conta_id, v_numero, 'aceite') = 'ligado');
end
$$;

-- 6. O que o código pelo WhatsApp diz (o gancho) -----------------------------------------------------------------------

-- Para a mensagem do código: o e-mail (escondido) da conta que vai entrar e, para quem está criando conta pelo
-- celular, os e-mails (escondidos) de até 2 contas que têm este número no cadastro. A conta nova ainda não aparece aqui
-- (o Auth chama o gancho antes de gravar), por isso o "conta" vem vazio para ela. "equipe": a conta é da equipe do
-- Publike ou da moderação, que nunca entra pelo WhatsApp (o gancho não manda o código; entra só com o e-mail).
create or replace function public.servidor_whatsapp_contas_do_numero(p_chave text, p_numero text, p_usuario uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tel text := privado.telefone_do_login(p_numero);
begin
  perform privado.exigir_servidor(p_chave);
  if v_tel is null then
    return jsonb_build_object('conta', null, 'declaradas', '[]'::jsonb,
                              'equipe', p_usuario is not null and privado.conta_da_equipe_publike(p_usuario));
  end if;
  return jsonb_build_object(
    'equipe', p_usuario is not null and privado.conta_da_equipe_publike(p_usuario),
    'conta', (select privado.email_mascarado(u.email) from auth.users u where u.id = p_usuario),
    'declaradas', coalesce((
      select jsonb_agg(m.e order by m.e)
        from (select distinct privado.email_mascarado(u.email) as e
                from public.contatos ct
                join auth.users u on u.id = ct.perfil_id
               where privado.telefone_do_login(ct.whatsapp) = v_tel
                 and ct.perfil_id <> coalesce(p_usuario, '00000000-0000-0000-0000-000000000000'::uuid)
                 and u.deleted_at is null
                 and coalesce(u.email, '') <> ''
                 and not privado.conta_da_equipe_publike(u.id)
               limit 2) m
       where m.e is not null), '[]'::jsonb));
end
$$;

revoke execute on function public.servidor_whatsapp_ligacao_pedir(text, uuid, text, text),
  public.servidor_whatsapp_ligacao_conferir(text, uuid, text, text),
  public.servidor_whatsapp_login_desligar(text, uuid),
  public.servidor_whatsapp_login_pela_vaga(text, text, uuid),
  public.servidor_whatsapp_contas_do_numero(text, text, uuid) from public;
grant execute on function public.servidor_whatsapp_ligacao_pedir(text, uuid, text, text),
  public.servidor_whatsapp_ligacao_conferir(text, uuid, text, text),
  public.servidor_whatsapp_login_desligar(text, uuid),
  public.servidor_whatsapp_login_pela_vaga(text, text, uuid),
  public.servidor_whatsapp_contas_do_numero(text, text, uuid) to anon, authenticated, service_role;

-- 7. Os celulares de login guardados sem o 9 passam a ter o 9 (sem colidir com outra conta) ----------------------------
-- Pula o número que outra conta já tem em qualquer formato (com ou sem o 9): as duas ficam como estão, em vez de a
-- migração parar no índice único do celular.

update auth.users u
   set phone = privado.telefone_do_login(u.phone), updated_at = now()
 where coalesce(u.phone, '') <> ''
   and privado.telefone_do_login(u.phone) is not null
   and privado.telefone_do_login(u.phone) <> u.phone
   and not exists (select 1 from auth.users o
                    where o.id <> u.id and coalesce(o.phone, '') <> ''
                      and (o.phone = privado.telefone_do_login(u.phone)
                           or privado.telefone_do_login(o.phone) = privado.telefone_do_login(u.phone)));

update auth.identities i
   set provider_id = privado.telefone_do_login(i.provider_id),
       identity_data = case when i.identity_data ? 'phone'
                            then jsonb_set(i.identity_data, '{phone}', to_jsonb(privado.telefone_do_login(i.provider_id)))
                            else i.identity_data end,
       updated_at = now()
 where i.provider = 'phone'
   and privado.telefone_do_login(i.provider_id) is not null
   and privado.telefone_do_login(i.provider_id) <> i.provider_id
   and not exists (select 1 from auth.identities o
                    where o.provider = 'phone' and o.id <> i.id
                      and (o.provider_id = privado.telefone_do_login(i.provider_id)
                           or privado.telefone_do_login(o.provider_id) = privado.telefone_do_login(i.provider_id)));

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270818120000_whatsapp_entrar_conta_existente');
