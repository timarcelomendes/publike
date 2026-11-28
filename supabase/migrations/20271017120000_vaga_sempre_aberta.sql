-- A vaga sempre aberta, o banco de reserva (28/11/2026; claude/plano-concentrar-contratacoes.md, parte 3, versão enxuta;
-- Marcelo: "Pode fazer tudo"). Para a função que se repete (portaria, limpeza, atendente): a vaga fica no ar o tempo
-- todo, quem se candidata entra na fila (curtidas.status 'reserva') e a empresa chama quando precisa. Pode rodar de novo.
--
-- 1. A vaga: anuncios.sempre_aberta. Ligada, não vence (prazo_dias null: o anuncio_prazo põe o fim em 9999), não tem
--    contato direto (a reserva espera o chamado) e o título ganha "(banco de reserva)", que aparece em toda lista, no
--    Google e no link do WhatsApp: quem procura não confunde com emprego imediato. Desligada, o título volta.
-- 2. A candidatura: na vaga sempre aberta, a curtida nova (e a curtida de novo, depois do match desfeito) entra como
--    'reserva', e não 'pendente': fica fora de "esperam a sua resposta", dos lembretes, da demora e das automações, que
--    olham 'pendente'. reserva_desde guarda a entrada; reserva_chamada_em, o chamado.
-- 3. chamar_da_reserva(vaga, pessoas): a empresa escolhe quem chamar (a ordem vem do site: a nota, a distância, quem
--    chegou mais recente); cada pessoa recebe no sino, no celular e por e-mail "abriu a vaga: ainda tem interesse?".
-- 4. responder_reserva(vaga, tenho): "Tenho" vira candidatura de verdade ('pendente', com a data de agora, e a empresa
--    recebe o aviso); "Não procuro mais" tira a pessoa da fila.
-- 5. A curtida na reserva não avisa a empresa um por um, e a vaga sempre aberta não recebe a pergunta "a vaga continua?".

-- 1. A vaga -------------------------------------------------------------------------------------------------------------

alter table public.anuncios add column if not exists sempre_aberta boolean not null default false;
grant insert (sempre_aberta), update (sempre_aberta) on public.anuncios to authenticated;

create or replace function privado.anuncio_sempre_aberta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo <> 'vaga' then
    new.sempre_aberta := false;
    return new;
  end if;
  if new.sempre_aberta then
    new.prazo_dias := null;
    new.contato_direto := false;
    if new.titulo !~* 'reserva' then
      new.titulo := left(btrim(new.titulo), 71) || ' (banco de reserva)';
    end if;
  elsif tg_op = 'UPDATE' and old.sempre_aberta then
    new.titulo := regexp_replace(new.titulo, '\s*\(banco de reserva\)$', '');
  end if;
  return new;
end
$$;
revoke execute on function privado.anuncio_sempre_aberta() from public, anon, authenticated;

-- antes do anuncios_zz_prazo (os gatilhos rodam em ordem alfabética), que lê o prazo_dias
drop trigger if exists anuncios_zs_sempre_aberta on public.anuncios;
create trigger anuncios_zs_sempre_aberta
  before insert or update on public.anuncios
  for each row execute function privado.anuncio_sempre_aberta();

-- 2. A candidatura na reserva -------------------------------------------------------------------------------------------

alter table public.curtidas add column if not exists reserva_desde timestamptz;
alter table public.curtidas add column if not exists reserva_chamada_em timestamptz;
alter table public.curtidas drop constraint if exists curtidas_status_check;
alter table public.curtidas add constraint curtidas_status_check
  check (status in ('pendente', 'match', 'dispensada', 'desfeito', 'reserva'));

create or replace function privado.curtida_na_reserva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pendente' and new.aceita_em is null
     and (tg_op = 'INSERT' or old.status = 'desfeito')
     and exists (select 1 from public.anuncios a where a.id = new.anuncio_id and a.sempre_aberta and a.status = 'ativo') then
    new.status := 'reserva';
    new.reserva_desde := now();
    new.reserva_chamada_em := null;
  end if;
  return new;
end
$$;
revoke execute on function privado.curtida_na_reserva() from public, anon, authenticated;

-- depois dos outros "antes" (curtidas_antes_de_inserir põe 'pendente'; a ordem é a alfabética)
drop trigger if exists curtidas_zreserva on public.curtidas;
create trigger curtidas_zreserva
  before insert or update on public.curtidas
  for each row execute function privado.curtida_na_reserva();

-- 3. A empresa chama da reserva -----------------------------------------------------------------------------------------

create or replace function public.chamar_da_reserva(p_anuncio uuid, p_perfis uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
  v_quem text;
  v_eu uuid := (select public.conta_atual());
  r record;
  n integer := 0;
begin
  if v_eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select * into a from public.anuncios x where x.id = p_anuncio and x.autor_id = v_eu;
  if a.id is null then
    raise exception 'Essa vaga não é sua.' using errcode = '42501';
  end if;
  if not a.sempre_aberta or a.status <> 'ativo' then
    raise exception 'Só dá para chamar da reserva numa vaga sempre aberta que está no ar.' using errcode = 'P0001';
  end if;
  if cardinality(coalesce(p_perfis, '{}'::uuid[])) not between 1 and 30 then
    raise exception 'Escolha de 1 a 30 pessoas.' using errcode = '22023';
  end if;
  perform privado.conferir_limite('etapa', 300, 'Você mexeu em muitos candidatos hoje. Tente de novo amanhã.');
  v_quem := case when coalesce(a.contratante_confidencial, false) then 'A empresa'
                 else coalesce(nullif(btrim(a.contratante), ''), (select p.nome from public.perfis p where p.id = a.autor_id),
                               'A empresa') end;
  for r in
    select c.perfil_id from public.curtidas c
     where c.anuncio_id = p_anuncio and c.perfil_id = any (p_perfis) and c.status = 'reserva'
  loop
    update public.curtidas c set reserva_chamada_em = now()
     where c.anuncio_id = p_anuncio and c.perfil_id = r.perfil_id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
    values (r.perfil_id, 'convite', p_anuncio, a.autor_id,
            left(v_quem || ' abriu a vaga “' || regexp_replace(a.titulo, '\s*\(banco de reserva\)$', '')
                 || '”, em que você está na reserva. Ainda tem interesse? Responda na página da vaga.', 300),
            '/anuncio/' || p_anuncio);
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.chamar_da_reserva(uuid, uuid[]) from public, anon;
grant execute on function public.chamar_da_reserva(uuid, uuid[]) to authenticated;

-- 4. A pessoa responde ao chamado ---------------------------------------------------------------------------------------

create or replace function public.responder_reserva(p_anuncio uuid, p_tenho boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu uuid := (select public.conta_atual());
  c public.curtidas;
  a public.anuncios;
  v_quem text;
begin
  if v_eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select * into c from public.curtidas x where x.anuncio_id = p_anuncio and x.perfil_id = v_eu;
  if c.anuncio_id is null or c.status <> 'reserva' then
    raise exception 'Você não está na reserva desta vaga.' using errcode = 'P0001';
  end if;
  if not coalesce(p_tenho, false) then
    delete from public.curtidas x where x.anuncio_id = p_anuncio and x.perfil_id = v_eu;
    return 'saiu';
  end if;
  select * into a from public.anuncios x where x.id = p_anuncio;
  if a.status <> 'ativo' then
    raise exception 'Esta vaga saiu do ar.' using errcode = 'P0001';
  end if;
  update public.curtidas x set status = 'pendente', criado_em = now(), respondida_em = null
   where x.anuncio_id = p_anuncio and x.perfil_id = v_eu;
  select p.nome into v_quem from public.perfis p where p.id = v_eu;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (a.autor_id, 'curtida', p_anuncio, v_eu,
          left(coalesce(v_quem, 'Alguém') || ' confirmou que ainda tem interesse em “'
               || regexp_replace(a.titulo, '\s*\(banco de reserva\)$', '') || '” (veio da reserva).', 300));
  return 'pendente';
end
$$;
revoke execute on function public.responder_reserva(uuid, boolean) from public, anon;
grant execute on function public.responder_reserva(uuid, boolean) to authenticated;

-- 5. Sem o aviso um por um e sem a pergunta "a vaga continua?" -----------------------------------------------------------

create or replace function public.notificar_curtida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  dono uuid;
  v_titulo text;
  v_tipo text;
  v_direto boolean;
  quem text;
  v_convite boolean;
begin
  -- quem entra na reserva da vaga sempre aberta não avisa um por um: a empresa vê a fila e chama quando precisa
  if new.status = 'reserva' then
    return null;
  end if;
  select a.autor_id, a.titulo, a.tipo, a.contato_direto and a.status = 'ativo'
    into dono, v_titulo, v_tipo, v_direto
    from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into quem from public.perfis p where p.id = new.perfil_id;
  v_convite := exists (
    select 1 from public.convites_candidato k
     where k.anuncio_id = new.anuncio_id and k.perfil_id = new.perfil_id and k.aceito_em is not null);
  -- curtir, descurtir e curtir de novo não enche o sino de avisos
  if not exists (
    select 1 from public.notificacoes n
     where n.destinatario_id = dono and n.anuncio_id = new.anuncio_id and n.ator_id = new.perfil_id
       and n.tipo = 'curtida' and n.criado_em > now() - interval '24 hours'
  ) then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (dono, 'curtida', new.anuncio_id, new.perfil_id,
            left(case when v_convite
                      then coalesce(quem, 'Alguém') || ' aceitou seu convite para “' || v_titulo || '”.'
                           || case when exists (select 1 from public.curriculos cv where cv.perfil_id = new.perfil_id)
                                   then ' Deu match: o contato de vocês está liberado.'
                                   else ' Falta conferir o currículo: avisamos quando chegar.' end
                      when v_tipo = 'servico'
                      then coalesce(quem, 'Alguém') || ' quer contratar você: “' || v_titulo || '”.'
                      else coalesce(quem, 'Alguém') || ' curtiu “' || v_titulo || '”.'
                 end
                 || case when v_direto and not v_convite
                         then ' O contato de vocês já está liberado (contato direto).' else '' end, 300));
  end if;
  return null;
end
$function$;

create or replace function public.servidor_perguntar_se_continua(p_chave text, p_limite integer DEFAULT 50, p_agora boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  r record;
  n integer := 0;
  v_dias integer;
  v_texto text;
begin
  perform privado.exigir_servidor(p_chave);
  -- das 8h às 20h
  if not coalesce(p_agora, false) and (hora < 8 or hora >= 20) then
    return 0;
  end if;
  for r in
    select a.id, a.titulo, a.autor_id, a.criado_em,
           (select count(*) from public.curtidas c where c.anuncio_id = a.id)::integer as curtidas,
           (select count(*) from privado.pedidos_continua p
             where p.anuncio_id = a.id and p.avisado_em is null)::integer as pedidos
      from public.anuncios a
      join public.perfis pf on pf.id = a.autor_id
      left join privado.vagas_continua vc on vc.anuncio_id = a.id
     where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
       -- a vaga sempre aberta (migração 20271017120000) não pergunta: ela fica no ar de propósito
       and not a.sempre_aberta
       -- nos 2 dias antes de vencer, o aviso do vencimento já pergunta
       and a.expira_em > now() + interval '2 days'
       and (pf.suspenso_ate is null or pf.suspenso_ate <= now())
       -- no máximo uma pergunta a cada 7 dias por vaga
       and coalesce(vc.perguntada_em, '-infinity') < now() - interval '7 days'
       -- nem nos 5 dias depois do "Quem você contratou?" (migração 20271006120000)
       and not exists (select 1 from privado.perguntas_quem_contratou q
                        where q.anuncio_id = a.id and q.perguntada_em > now() - interval '5 days')
       and (
         (greatest(a.criado_em, coalesce(vc.confirmada_em, '-infinity')) < now() - interval '14 days'
          and (select count(*) from public.curtidas c where c.anuncio_id = a.id) >= 10)
         or exists (select 1 from privado.pedidos_continua p
                     where p.anuncio_id = a.id and p.avisado_em is null
                       and p.criado_em > coalesce(vc.perguntada_em, '-infinity'))
       )
     order by a.criado_em
     limit least(greatest(coalesce(p_limite, 50), 1), 200)
  loop
    v_dias := greatest(((now() at time zone 'America/Sao_Paulo')::date
                        - (r.criado_em at time zone 'America/Sao_Paulo')::date), 1);
    v_texto := 'Sua vaga “' || r.titulo || '” está no ar há ' || v_dias || ' dias'
               || case when r.curtidas = 1 then ' e tem 1 candidatura'
                       when r.curtidas > 1 then ' e tem ' || r.curtidas || ' candidaturas' else '' end
               || '. Ela ainda está aberta? Confirme em um toque, ou conte se já preencheu.'
               || case when r.pedidos = 1 then ' Uma pessoa perguntou.'
                       when r.pedidos > 1 then ' ' || r.pedidos || ' pessoas perguntaram.' else '' end;
    -- uma pergunta por vaga no sino: a nova tira a anterior
    delete from public.notificacoes nt
     where nt.destinatario_id = r.autor_id and nt.anuncio_id = r.id and nt.tipo = 'vaga_continua';
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    values (r.autor_id, 'vaga_continua', r.id, left(v_texto, 300), '/painel/anuncio/' || r.id || '/continua');
    insert into privado.vagas_continua (anuncio_id, perguntada_em) values (r.id, now())
    on conflict (anuncio_id) do update set perguntada_em = now();
    n := n + 1;
  end loop;
  return n;
end
$function$;

-- 6. Sair da reserva quando quiser (o "Desfazer curtida" de quem ainda espera vale também para a reserva) ----------------

drop policy if exists "desfazer curtida ainda sem resposta" on public.curtidas;
create policy "desfazer curtida ainda sem resposta" on public.curtidas
  for delete to authenticated
  using (perfil_id = (select public.conta_atual()) and status in ('pendente', 'reserva')
         and not (select public.minha_conta_suspensa()));

select privado.migracao_aplicada('20271017120000_vaga_sempre_aberta');
