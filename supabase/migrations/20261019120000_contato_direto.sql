-- Contato direto: quem publica pode liberar o contato para quem curtir, sem esperar o aceite.
-- Para o começo do Publike andar rápido: a curtida já vira match (os dois veem o WhatsApp e o
-- e-mail um do outro, como em qualquer match). É opção do anúncio: a vaga vem desligada e a
-- vitrine de serviços, ligada (nos formulários). Os anúncios que já existem ficam como estão.

alter table public.anuncios add column if not exists contato_direto boolean not null default false;
grant insert (contato_direto), update (contato_direto) on public.anuncios to authenticated;

-- Depois da curtida (ou de curtir de novo um match desfeito): com o contato direto ligado, já é
-- match. Vaga que pede currículo, de quem ainda não mandou: o aceite fica guardado e o match sai
-- quando o currículo chegar (como no aceite pela mão, em responder_curtida).
create or replace function privado.curtida_com_contato_direto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
  quem text;
begin
  if new.status <> 'pendente' or new.aceita_em is not null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status is distinct from 'desfeito' then
    return null;
  end if;
  select * into a from public.anuncios where id = new.anuncio_id;
  if a.id is null or not a.contato_direto or a.status <> 'ativo' then
    return null;
  end if;
  if exists (select 1 from public.perfis p where p.id = a.autor_id and p.suspenso_ate > now())
     or privado.ha_bloqueio(a.autor_id, new.perfil_id) then
    return null;
  end if;

  if a.tipo = 'vaga' and a.pede_curriculo
     and not exists (select 1 from public.curriculos cv where cv.perfil_id = new.perfil_id) then
    update public.curtidas set aceita_em = now()
     where anuncio_id = new.anuncio_id and perfil_id = new.perfil_id;
    select p.nome into quem from public.perfis p where p.id = a.autor_id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (new.perfil_id, 'aceite_curriculo', a.id, a.autor_id,
            left(coalesce(quem, 'Quem publicou') || ' recebe todos os interessados em “' || a.titulo
                 || '”. Falta só o seu currículo: mande e o contato de vocês aparece na hora.', 300));
    return null;
  end if;

  update public.curtidas set status = 'match', respondida_em = now()
   where anuncio_id = new.anuncio_id and perfil_id = new.perfil_id;
  return null;
end
$$;
revoke execute on function privado.curtida_com_contato_direto() from public;

-- "zz": roda depois dos outros gatilhos da curtida (o aviso de curtida sai antes do de match)
drop trigger if exists curtidas_zz_contato_direto on public.curtidas;
create trigger curtidas_zz_contato_direto
  after insert or update of status on public.curtidas
  for each row execute function privado.curtida_com_contato_direto();

-- O aviso do match diz que foi o contato direto (ninguém "curtiu de volta")
create or replace function public.notificar_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_tipo text;
  v_direto boolean;
  quem text;
  dono uuid;
begin
  if new.status = 'match' and old.status is distinct from 'match' then
    select a.titulo, a.tipo, a.contato_direto, p.nome, p.id into v_titulo, v_tipo, v_direto, quem, dono
      from public.anuncios a join public.perfis p on p.id = a.autor_id
     where a.id = new.anuncio_id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (new.perfil_id, 'match', new.anuncio_id, dono,
            case when v_direto and new.respondida_em > now() - interval '1 minute'
                      and (select auth.uid()) is distinct from dono
                 then 'Deu match! O contato de ' || coalesce(quem, 'quem publicou') || ' em “' || v_titulo
                      || '” já está liberado. Chame no WhatsApp.'
                 when v_tipo = 'servico'
                 then 'Deu match! ' || coalesce(quem, 'O profissional') || ' aceitou seu pedido em “' || v_titulo
                      || '”. Agora é só conversar.'
                 else 'Deu match! ' || coalesce(quem, 'Quem publicou') || ' curtiu você de volta em “' || v_titulo
                      || '”. Agora é só conversar.'
            end);
  end if;
  return null;
end
$$;

-- Quem publicou: o aviso da curtida já diz que o contato foi liberado
create or replace function public.notificar_curtida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dono uuid;
  v_titulo text;
  v_tipo text;
  v_direto boolean;
  quem text;
begin
  select a.autor_id, a.titulo, a.tipo, a.contato_direto and a.status = 'ativo'
    into dono, v_titulo, v_tipo, v_direto
    from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into quem from public.perfis p where p.id = new.perfil_id;
  -- curtir, descurtir e curtir de novo não enche o sino de avisos
  if not exists (
    select 1 from public.notificacoes n
     where n.destinatario_id = dono and n.anuncio_id = new.anuncio_id and n.ator_id = new.perfil_id
       and n.tipo = 'curtida' and n.criado_em > now() - interval '24 hours'
  ) then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (dono, 'curtida', new.anuncio_id, new.perfil_id,
            left(case when v_tipo = 'servico'
                      then coalesce(quem, 'Alguém') || ' quer contratar você: “' || v_titulo || '”.'
                      else coalesce(quem, 'Alguém') || ' curtiu “' || v_titulo || '”.'
                 end
                 || case when v_direto then ' O contato de vocês já está liberado (contato direto).' else '' end, 300));
  end if;
  return null;
end
$$;

-- A página do anúncio diz quando o contato sai na hora (e o formulário de editar traz a opção)
drop function if exists public.obter_anuncio(uuid);
create function public.obter_anuncio(p_id uuid)
returns table (
  id uuid,
  autor_id uuid,
  tipo text,
  titulo text,
  descricao text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  horario text,
  vagas smallint,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  status text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  expira_em timestamptz,
  autor_nome text,
  autor_tipo text,
  autor_foto text,
  autor_verificado boolean,
  autor_desde timestamptz,
  minha_curtida text,
  minha_mensagem text,
  oficio text,
  fotos text[],
  atende text[],
  pede_curriculo boolean,
  contratante text,
  contratante_confidencial boolean,
  autor_cnpj text,
  cep text,
  endereco text,
  local_exato boolean,
  pagamento_ate numeric,
  comissao boolean,
  beneficios_lista text[],
  escolaridade_minima text,
  experiencia text,
  cnh text,
  jornada text,
  modelo text,
  pcd text,
  perguntas jsonb,
  beneficios_extras text[],
  horario_detalhe jsonb,
  minhas_respostas jsonb,
  contato_direto boolean
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select a.id, a.autor_id, a.tipo, a.titulo, a.descricao, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios, a.horario, a.vagas,
         a.cidade, a.bairro,
         round(st_y(a.local::geometry)::numeric, 5)::double precision,
         round(st_x(a.local::geometry)::numeric, 5)::double precision,
         a.status, a.criado_em, a.atualizado_em, a.expira_em,
         p.nome, p.tipo, p.foto, p.verificado, p.criado_em,
         c.status, c.mensagem,
         a.oficio, a.fotos, a.atende, a.pede_curriculo,
         a.contratante, a.contratante_confidencial, p.cnpj,
         a.cep, a.endereco, a.local_exato,
         a.pagamento_ate, a.comissao, a.beneficios_lista, a.escolaridade_minima, a.experiencia, a.cnh,
         a.jornada, a.modelo, a.pcd,
         a.perguntas, a.beneficios_extras, a.horario_detalhe, c.respostas, a.contato_direto
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.id = p_id
$$;

grant execute on function public.obter_anuncio(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
