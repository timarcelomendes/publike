-- Currículo público por padrão (22/10/2026). Pode rodar de novo sem problema.
--
-- Antes, o currículo só aparecia para as empresas (Talentos do painel) e na aba Talentos se a
-- pessoa ligasse as duas opções no fim da página do currículo, e quase ninguém ligava: os
-- currículos ficavam escondidos. Agora o currículo de quem procura trabalho já sai aparecendo nos
-- dois lugares, como antes de ligar à mão: sem telefone, sem e-mail, sem o PDF e com o nome
-- encurtado na aba. Quem não quer, desliga, e a escolha fica guardada.
--   * Ao salvar o currículo pela primeira vez, ele entra em curriculo_visivel (empresas) e em
--     curriculo_na_vitrine (aba Talentos), menos o que a pessoa já tinha escondido antes.
--   * Desligar guarda a escolha em privado.curriculo_escondido (vale mesmo se a pessoa apagar o
--     currículo e fizer outro); ligar de novo apaga a escolha.
--   * Os currículos que já existiam sem nenhuma das duas opções passam a aparecer, e a pessoa
--     recebe um aviso no sino (curriculo_publico, só no sino) com o caminho para esconder.
--
-- Rode depois de 20261029120000_banners.sql.

-- 1. A escolha de esconder ----------------------------------------------------------------

create table if not exists privado.curriculo_escondido (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  -- desligou "Deixar as empresas me encontrarem" (que tira também da aba)
  empresas_em timestamptz,
  -- desligou "Aparecer na aba Talentos"
  aba_em timestamptz
);
comment on table privado.curriculo_escondido is
  'Quem escondeu o currículo das empresas ou da aba Talentos (o currículo aparece por padrão).';
revoke all on privado.curriculo_escondido from public, anon, authenticated;

-- A pessoa desligou uma das opções: guarda. Apagar o currículo inteiro (o currículo some junto)
-- não é escolha de esconder: aí o currículo já não existe quando a linha sai.
create or replace function privado.curriculo_escondeu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.curriculos c where c.perfil_id = old.perfil_id) then
    insert into privado.curriculo_escondido as e (perfil_id, empresas_em, aba_em)
    values (
      old.perfil_id,
      case when tg_table_name = 'curriculo_visivel' then now() end,
      case when tg_table_name = 'curriculo_na_vitrine' then now() end
    )
    on conflict (perfil_id) do update
      set empresas_em = coalesce(excluded.empresas_em, e.empresas_em),
          aba_em = coalesce(excluded.aba_em, e.aba_em);
  end if;
  return null;
end
$$;

-- Ligou de novo: a escolha de esconder sai.
create or replace function privado.curriculo_mostrou()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update privado.curriculo_escondido e
     set empresas_em = case when tg_table_name = 'curriculo_visivel' then null else e.empresas_em end,
         aba_em = case when tg_table_name = 'curriculo_na_vitrine' then null else e.aba_em end
   where e.perfil_id = new.perfil_id;
  return null;
end
$$;

drop trigger if exists curriculo_visivel_escondeu on public.curriculo_visivel;
create trigger curriculo_visivel_escondeu
  after delete on public.curriculo_visivel
  for each row execute function privado.curriculo_escondeu();
drop trigger if exists curriculo_na_vitrine_escondeu on public.curriculo_na_vitrine;
create trigger curriculo_na_vitrine_escondeu
  after delete on public.curriculo_na_vitrine
  for each row execute function privado.curriculo_escondeu();
drop trigger if exists curriculo_visivel_mostrou on public.curriculo_visivel;
create trigger curriculo_visivel_mostrou
  after insert on public.curriculo_visivel
  for each row execute function privado.curriculo_mostrou();
drop trigger if exists curriculo_na_vitrine_mostrou on public.curriculo_na_vitrine;
create trigger curriculo_na_vitrine_mostrou
  after insert on public.curriculo_na_vitrine
  for each row execute function privado.curriculo_mostrou();


-- 2. Currículo novo já aparece -----------------------------------------------------------------

create or replace function privado.curriculo_novo_aparece()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresas timestamptz;
  v_aba timestamptz;
begin
  -- currículo é de quem procura trabalho (conta de pessoa)
  if not exists (select 1 from public.perfis p where p.id = new.perfil_id and p.tipo = 'pessoa') then
    return null;
  end if;
  select e.empresas_em, e.aba_em into v_empresas, v_aba
    from privado.curriculo_escondido e where e.perfil_id = new.perfil_id;
  if v_empresas is null then
    insert into public.curriculo_visivel (perfil_id) values (new.perfil_id) on conflict do nothing;
    if v_aba is null then
      insert into public.curriculo_na_vitrine (perfil_id) values (new.perfil_id) on conflict do nothing;
    end if;
  end if;
  return null;
end
$$;

drop trigger if exists curriculos_novo_aparece on public.curriculos;
create trigger curriculos_novo_aparece
  after insert on public.curriculos
  for each row execute function privado.curriculo_novo_aparece();

revoke execute on function privado.curriculo_escondeu(), privado.curriculo_mostrou(),
  privado.curriculo_novo_aparece() from public, anon, authenticated;


-- 3. O aviso no sino (só no sino) ------------------------------------------------------------

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'recado_no_ar', 'recado_retido', 'recado_forca',
                  'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine',
                  'curriculo_publico'));

drop trigger if exists notificacoes_por_email on public.notificacoes;
create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row
  when (new.tipo not in ('recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa',
                         'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico'))
  execute function privado.notificacao_por_email();


-- 4. Os currículos que já existiam ------------------------------------------------------------
-- Só quem não tinha ligado nenhuma das duas opções (quem ligou só as empresas escolheu ficar
-- fora da aba) e nunca escondeu. Rodar de novo não repete o aviso: quem já aparece fica de fora.

do $$
declare
  v_id uuid;
begin
  for v_id in
    select c.perfil_id
      from public.curriculos c
      join public.perfis p on p.id = c.perfil_id
     where p.tipo = 'pessoa'
       and not exists (select 1 from public.curriculo_visivel v where v.perfil_id = c.perfil_id)
       and not exists (select 1 from privado.curriculo_escondido e
                        where e.perfil_id = c.perfil_id and e.empresas_em is not null)
  loop
    insert into public.curriculo_visivel (perfil_id) values (v_id) on conflict do nothing;
    if not exists (select 1 from privado.curriculo_escondido e where e.perfil_id = v_id and e.aba_em is not null) then
      insert into public.curriculo_na_vitrine (perfil_id) values (v_id) on conflict do nothing;
    end if;
    insert into public.notificacoes (destinatario_id, tipo, texto)
    values (
      v_id,
      'curriculo_publico',
      'Seu currículo agora aparece para as empresas da região e na aba Talentos, sem telefone, e-mail nem o PDF. Prefere não aparecer? Toque aqui e desligue no fim da página.'
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';
