-- Admin › Esperando também no site no ar, para a equipe publike.org (23/11/2026; o plano do aceite pela conversa:
-- a mensagem de Esperando leva o link "Quero receber meus candidatos pelo WhatsApp", e a equipe manda pelo celular).
-- Até aqui a tela só abria no computador do dono (lia as tabelas com a chave de serviço). Agora as mesmas contas em
-- funções que conferem a equipe (privado.eh_admin() ou privado.equipe_publike()): a lista, o link de acesso da conta
-- que nunca entrou e o "avisada". A regra é a de `empresasComGenteEsperando` (src/lib/admin/dados.ts): quem curtiu e
-- espera o aceite, e quem deu match nos últimos 30 dias sem mensagem da empresa (a automática não conta) e sem a
-- empresa ter tocado no contato do candidato. Pode rodar de novo.

create or replace function privado.exigir_equipe_esperando()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike vê quem está esperando.' using errcode = '42501';
  end if;
end
$$;

create or replace function public.equipe_empresas_esperando(p_conta uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform privado.exigir_equipe_esperando();
  with vagas as (
    select a.id, a.titulo, a.autor_id
      from public.anuncios a
     where a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > now()
       and (p_conta is null or a.autor_id = p_conta)
  ),
  pessoas as (
    -- quem curtiu e espera o aceite
    select v.autor_id as empresa, k.perfil_id, v.titulo as vaga, k.criado_em as desde, 'esperando' as lista
      from public.curtidas k join vagas v on v.id = k.anuncio_id
     where k.status = 'pendente' and k.aceita_em is null
    union all
    -- quem deu match (30 dias) e não recebeu mensagem nem contato da empresa
    select v.autor_id, k.perfil_id, v.titulo, coalesce(k.respondida_em, k.criado_em), 'sem_conversa'
      from public.curtidas k join vagas v on v.id = k.anuncio_id
     where k.status = 'match'
       and coalesce(k.respondida_em, k.criado_em) >= now() - interval '30 days'
       and not exists (
         select 1 from public.conversas x
           join public.mensagens m on m.conversa_id = x.id
          where x.conta_a = least(k.perfil_id, v.autor_id) and x.conta_b = greatest(k.perfil_id, v.autor_id)
            and m.autor_id = v.autor_id and m.automatica = false)
       and not exists (
         select 1 from privado.historico_etapas h
          where h.anuncio_id = k.anuncio_id and h.perfil_id = k.perfil_id and h.o_que like 'contato:%')
  ),
  empresas as (
    select p.empresa,
           jsonb_agg(jsonb_build_object('nome', coalesce(c.nome, 'Alguém'), 'vaga', p.vaga, 'desde', p.desde)
                     order by p.desde) filter (where p.lista = 'esperando') as esperando,
           jsonb_agg(jsonb_build_object('nome', coalesce(c.nome, 'Alguém'), 'vaga', p.vaga, 'desde', p.desde)
                     order by p.desde) filter (where p.lista = 'sem_conversa') as sem_conversa,
           min(p.desde) as mais_antiga
      from pessoas p left join public.perfis c on c.id = p.perfil_id
     group by p.empresa
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.empresa,
           'nome', coalesce(pf.nome, 'Conta sem perfil'),
           'tipo', coalesce(pf.tipo, 'empresa'),
           'whatsapp', ct.whatsapp,
           'esperando', coalesce(e.esperando, '[]'::jsonb),
           'sem_conversa', coalesce(e.sem_conversa, '[]'::jsonb),
           'mais_antiga', e.mais_antiga,
           'tem_login', u.id is not null,
           'email_confirmado', u.email is not null and u.email_confirmed_at is not null,
           'ultimo_login', u.last_sign_in_at,
           'visto_em', (select ap.quando from public.admin_aparelho_do_usuario(e.empresa) ap limit 1),
           'avisada_em', (select max(av.avisada_em) from privado.empresas_avisadas av where av.conta_id = e.empresa)
         )), '[]'::jsonb)
    into v
    from empresas e
    left join public.perfis pf on pf.id = e.empresa
    left join public.contatos ct on ct.perfil_id = e.empresa
    left join auth.users u on u.id = e.empresa;
  return v;
end
$$;
revoke execute on function public.equipe_empresas_esperando(uuid) from public, anon;
grant execute on function public.equipe_empresas_esperando(uuid) to authenticated, service_role;

-- o link de acesso da conta que nunca pôs e-mail (o mesmo do "Mandar acesso pelo WhatsApp"); null: a conta tem e-mail
create or replace function public.equipe_link_de_acesso_esperando(p_conta uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  perform privado.exigir_equipe_esperando();
  if not exists (select 1 from auth.users u where u.id = p_conta and u.email is null) then
    return null;
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.acessos_conta (token, perfil_id) values (v_token, p_conta);
  return v_token;
end
$$;
revoke execute on function public.equipe_link_de_acesso_esperando(uuid) from public, anon;
grant execute on function public.equipe_link_de_acesso_esperando(uuid) to authenticated, service_role;

-- a equipe abriu o WhatsApp (ou copiou a mensagem) para a conta
create or replace function public.equipe_marcar_empresa_avisada(p_conta uuid, p_pessoas integer default 0)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_equipe_esperando();
  return public.admin_marcar_empresa_avisada(p_conta, p_pessoas);
end
$$;
revoke execute on function public.equipe_marcar_empresa_avisada(uuid, integer) from public, anon;
grant execute on function public.equipe_marcar_empresa_avisada(uuid, integer) to authenticated, service_role;

-- a tela na lista de Admin › Quem vê cada tela (só a equipe publike.org)
insert into privado.telas_do_admin (rota, somente_publike) values ('/admin/esperando', true)
on conflict (rota) do nothing;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270915130000_esperando_no_site');
