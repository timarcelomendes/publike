-- O e-mail dos candidatos novos (24/11/2026; Marcelo: "o e-mail para quem publicou, sempre que houver 3 ou mais
-- candidatos novos [...] a gente deixa em preferências, se o usuário quiser mudar").
--
-- Antes, cada curtida mandava um e-mail ("Fulano curtiu Vendedora"), no máximo um a cada 30 minutos. Agora quem
-- publica escolhe em Preferências › Avisos (privado.email_candidatos):
--   * 'tres' (o padrão, sem linha): o e-mail sai quando juntam 3 ou mais candidatos novos esperando a resposta
--     (curtidas pendentes nas vagas da conta, desde o último e-mail de candidatos ou dos últimos 7 dias), com quantos
--     e as vagas, levando aos Candidatos;
--   * 'cada': como antes, um e-mail por candidato (com o limite de 30 minutos de Admin › E-mails);
--   * 'nenhum': nenhum e-mail de candidato (o sino, o celular e o WhatsApp continuam).
-- Quem tem 1 ou 2 candidatos parados continua recebendo o lembrete de 24 h e 72 h (lembrete_curtida).
-- O "candidatos_novos" entra no catálogo de Admin › E-mails, com no máximo um a cada 60 minutos.

create table if not exists privado.email_candidatos (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  jeito text not null check (jeito in ('tres', 'cada', 'nenhum')),
  mudou_em timestamptz not null default now()
);
revoke all on privado.email_candidatos from public, anon, authenticated;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('candidatos_novos', 'usuarios', 2, 'Candidatos novos',
     'Para quem publicou: quando juntam 3 ou mais candidatos novos esperando a resposta (o padrão; a pessoa muda em Preferências › Avisos para um e-mail por candidato ou nenhum).',
     array['nome', 'quantos', 'vagas', 'link'],
     '{{quantos}} candidatos novos esperam a sua resposta',
     E'Oi, {{nome}}!\n\n{{quantos}} candidatos novos curtiram as suas vagas e esperam a sua resposta:\n\n{{vagas}}\n\nResponda logo: quem recebe resposta no mesmo dia tem muito mais chance de vir para a entrevista.',
     'Ver os candidatos')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do update
  set nome = excluded.nome, descricao = excluded.descricao, variaveis = excluded.variaveis,
      assunto = case when modelos_email.assunto = modelos_email.assunto_padrao then excluded.assunto
                     else modelos_email.assunto end,
      corpo = case when modelos_email.corpo = modelos_email.corpo_padrao then excluded.corpo
                   else modelos_email.corpo end,
      botao = case when modelos_email.botao = modelos_email.botao_padrao then excluded.botao
                   else modelos_email.botao end,
      assunto_padrao = excluded.assunto_padrao, corpo_padrao = excluded.corpo_padrao,
      botao_padrao = excluded.botao_padrao;

insert into privado.regras_email (modelo, ligado, intervalo_min)
values ('candidatos_novos', true, 60)
on conflict (modelo) do nothing;

-- o jeito de quem publicou (sem linha: 'tres')
create or replace function privado.jeito_email_candidatos(p_perfil uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select e.jeito from privado.email_candidatos e where e.perfil_id = p_perfil), 'tres')
$$;
revoke execute on function privado.jeito_email_candidatos(uuid) from public, anon, authenticated;

-- Preferências › Avisos: ler e mudar (a conta pela qual a pessoa age; da equipe da agência, só quem administra)
create or replace function public.meu_email_candidatos()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then null else privado.jeito_email_candidatos(public.conta_atual()) end
$$;
revoke execute on function public.meu_email_candidatos() from public, anon;
grant execute on function public.meu_email_candidatos() to authenticated;

create or replace function public.mudar_email_candidatos(p_jeito text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if public.papel_na_conta() not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta muda os avisos.' using errcode = '42501';
  end if;
  if p_jeito not in ('tres', 'cada', 'nenhum') then
    raise exception 'Escolha uma opção.' using errcode = '22023';
  end if;
  insert into privado.email_candidatos (perfil_id, jeito) values (public.conta_atual(), p_jeito)
  on conflict (perfil_id) do update set jeito = excluded.jeito, mudou_em = now();
end
$$;
revoke execute on function public.mudar_email_candidatos(text) from public, anon;
grant execute on function public.mudar_email_candidatos(text) to authenticated;

-- A fila de e-mails: a curtida segue o jeito de quem publicou. O resto é o enfileirar_email da migração
-- 20270201120000, igual.
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
  v_grupo text := privado.grupo_do_aviso(p_modelo);
  v_sair jsonb := '{}'::jsonb;
  v_intervalo integer;
  v_jeito text;
  v_desde timestamptz;
  v_quantos integer;
  v_vagas text;
begin
  select * into cfg from public.config_site limit 1;
  if not found or not cfg.emails_ativos then
    return;
  end if;
  -- a chave de cada e-mail fica em Admin › E-mails › Todos (privado.regras_email)
  if not privado.email_ligado(p_modelo) then
    return;
  end if;
  -- avisos de conta vão mesmo para quem desligou os avisos
  if not de_conta then
    select c.receber_emails into quer from public.contatos c where c.perfil_id = p_usuario;
    if quer is false then
      return;
    end if;
  end if;
  -- o que a conta desligou na página Avisos e notificações (os avisos sem grupo chegam sempre)
  if v_grupo is not null and privado.aviso_desligado(p_usuario, p_modelo, 'email') then
    return;
  end if;
  -- a curtida (migração 20270923120000): pelo jeito de quem publicou. 'tres': junta até 3 candidatos novos e manda
  -- um e-mail só ("candidatos_novos"), que tem a sua própria chave e o seu intervalo
  if p_modelo = 'curtida' then
    v_jeito := privado.jeito_email_candidatos(p_usuario);
    if v_jeito = 'nenhum' then
      return;
    end if;
    if v_jeito = 'tres' then
      if not privado.email_ligado('candidatos_novos') then
        return;
      end if;
      select greatest(coalesce(max(f.criado_em), '-infinity'::timestamptz), now() - interval '7 days') into v_desde
        from privado.fila_emails f
       where f.usuario_id = p_usuario and f.modelo in ('candidatos_novos', 'curtida');
      select count(*)::integer,
             string_agg('• ' || x.titulo || case when x.n > 1 then ' (' || x.n || ')' else '' end, E'\n'
                        order by x.n desc, x.titulo)
        into v_quantos, v_vagas
        from (select a.titulo, count(*)::integer as n
                from public.curtidas c
                join public.anuncios a on a.id = c.anuncio_id
               where a.autor_id = p_usuario and c.status = 'pendente' and c.criado_em > v_desde
               group by a.id, a.titulo
               order by n desc
               limit 5) x;
      -- o total (todas as vagas), não só as 5 da lista
      select count(*)::integer into v_quantos
        from public.curtidas c
        join public.anuncios a on a.id = c.anuncio_id
       where a.autor_id = p_usuario and c.status = 'pendente' and c.criado_em > v_desde;
      if coalesce(v_quantos, 0) < 3 then
        return;
      end if;
      p_modelo := 'candidatos_novos';
      p_dados := jsonb_build_object('quantos', v_quantos::text, 'vagas', coalesce(v_vagas, ''),
                                    'caminho', '/painel/candidatos?situacao=responder');
    end if;
  end if;
  -- no máximo um e-mail do modelo a cada N minutos para a mesma pessoa (Admin › E-mails › Todos)
  select r.intervalo_min into v_intervalo from privado.regras_email r where r.modelo = p_modelo;
  if v_intervalo is not null and exists (
    select 1 from privado.fila_emails f
     where f.usuario_id = p_usuario and f.modelo = p_modelo
       and f.criado_em > now() - make_interval(mins => v_intervalo)
  ) then
    return;
  end if;
  -- e o limite por dia para a mesma pessoa (avisos de conta e de moderação passam sempre)
  if not de_conta and p_modelo not in ('em_analise', 'removido', 'liberado') and (
    select count(*) from privado.fila_emails f
     where f.usuario_id = p_usuario and f.criado_em > now() - interval '1 day'
  ) >= coalesce((select pe.por_dia from privado.parametros_email pe), 30) then
    return;
  end if;
  -- só para o e-mail de login confirmado (nunca para um endereço que a pessoa só digitou)
  select nullif(btrim(u.email::text), '') into destino
    from auth.users u
   where u.id = p_usuario and u.email_confirmed_at is not null;
  if destino is null or destino !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return;
  end if;
  -- o "parar de receber" deste grupo (o rodapé e o cabeçalho List-Unsubscribe); sem a chave, o e-mail sai
  -- assim mesmo, com o rodapé de antes
  if v_grupo is not null then
    begin
      v_sair := jsonb_build_object('sair', privado.chave_de_aviso(p_usuario), 'grupo_aviso', v_grupo);
    exception
      when others then
        v_sair := '{}'::jsonb;
    end;
  end if;
  insert into privado.fila_emails (modelo, para, usuario_id, dados)
  values (p_modelo, lower(destino), p_usuario,
          jsonb_build_object('nome', coalesce(privado.nome_para_email(p_usuario), ''))
          || coalesce(p_dados, '{}'::jsonb) || jsonb_strip_nulls(v_sair));
exception
  when others then
    raise warning 'Publike: e-mail % não entrou na fila (%).', p_modelo, sqlerrm;
end
$function$;

select privado.migracao_aplicada('20270923120000_email_de_candidatos_novos');
