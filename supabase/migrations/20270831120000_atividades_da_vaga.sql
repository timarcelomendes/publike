-- As atividades da vaga (22/11/2026; Marcelo: "6M = PERDE X % 5 ANOS 100% SE FAZIA AS MESMAS ATIVIDADES DA VAGA, TEM QUE
-- ANALISAR, LER A VAGA"; o Haiku, com a comparação Haiku x Sonnet antes de ligar). A nota de aderência já conta o tempo
-- na mesma função (src/lib/aderencia.ts); aqui a IA lê a vaga e o que a pessoa fazia nos trabalhos da mesma função e
-- diz se ela fazia as mesmas atividades ("sim"), parte delas ("parte") ou outras ("nao"), com o trecho do currículo.
-- Só os pares em que isso muda a nota: quem se candidatou a uma vaga no ar ou está visível em Talentos e tem trabalho
-- na mesma função da vaga (o servidor escolhe). "sem": não deu para comparar (sem o que a pessoa fazia, ou a resposta
-- não serviu): fica de fora da nota e não volta para a fila até a vaga ou o currículo mudar (a impressão).
-- Desligado até o admin ligar em Admin › Qualificados.
--
-- Pode rodar de novo.

create table if not exists privado.atividades_da_vaga (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  impressao text not null check (impressao ~ '^[0-9a-f]{32}$'),
  resultado text not null check (resultado in ('sim', 'parte', 'nao', 'sem')),
  trecho text not null default '' check (char_length(trecho) <= 300),
  modelo text check (modelo is null or char_length(modelo) <= 60),
  lido_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id)
);
create index if not exists atividades_da_vaga_perfil on privado.atividades_da_vaga (perfil_id);
alter table privado.atividades_da_vaga enable row level security;
revoke all on privado.atividades_da_vaga from public, anon, authenticated;

create table if not exists privado.config_atividades (
  id boolean primary key default true check (id),
  ligado boolean not null default false,
  modelo text check (modelo is null or char_length(modelo) <= 60),
  atualizado_em timestamptz not null default now()
);
insert into privado.config_atividades (id) values (true) on conflict (id) do nothing;
alter table privado.config_atividades enable row level security;
revoke all on privado.config_atividades from public, anon, authenticated;

-- O que o servidor precisa para escolher os pares: as vagas no ar com a função (CBO), quem se candidatou, quem está
-- visível em Talentos (as experiências, sem nome, foto, bairro nem contato) e o que já foi lido (a impressão)
create or replace function privado.dados_para_atividades()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with vagas as (
    select a.id, a.titulo, left(coalesce(a.descricao, ''), 2000) as descricao, f.cbo
      from public.anuncios a
      join privado.funcoes_das_vagas f on f.anuncio_id = a.id and f.cbo is not null
     where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
  ),
  candidaturas as (
    select k.anuncio_id, k.perfil_id from public.curtidas k join vagas v on v.id = k.anuncio_id
  ),
  pessoas as (
    select c.perfil_id, c.experiencias
      from public.curriculos c
      join public.perfis p on p.id = c.perfil_id
     where p.tipo = 'pessoa'
       and (p.suspenso_ate is null or p.suspenso_ate < now())
       and jsonb_typeof(c.experiencias) = 'array' and jsonb_array_length(c.experiencias) > 0
       and (exists (select 1 from public.curriculo_visivel x where x.perfil_id = c.perfil_id)
            or exists (select 1 from candidaturas k where k.perfil_id = c.perfil_id))
  )
  select jsonb_build_object(
    'vagas', coalesce((select jsonb_agg(to_jsonb(v)) from vagas v), '[]'::jsonb),
    'candidaturas', coalesce((select jsonb_agg(to_jsonb(k)) from candidaturas k), '[]'::jsonb),
    'pessoas', coalesce((select jsonb_agg(to_jsonb(x)) from pessoas x), '[]'::jsonb),
    'lidos', coalesce((select jsonb_agg(jsonb_build_object('anuncio_id', l.anuncio_id, 'perfil_id', l.perfil_id,
                                                           'impressao', l.impressao))
                         from privado.atividades_da_vaga l join vagas v on v.id = l.anuncio_id), '[]'::jsonb))
$$;
revoke execute on function privado.dados_para_atividades() from public, anon, authenticated;

-- O robô das filas (a chave do servidor; volatile: a conferência da chave grava a hora de uso)
create or replace function public.servidor_config_atividades(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select jsonb_build_object('ligado', c.ligado, 'modelo', c.modelo) from privado.config_atividades c where c.id);
end
$$;

create or replace function public.servidor_dados_para_atividades(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return privado.dados_para_atividades();
end
$$;

create or replace function public.servidor_guardar_atividades(
  p_chave text, p_anuncio uuid, p_perfil uuid, p_impressao text, p_resultado text, p_trecho text, p_modelo text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.atividades_da_vaga as t (anuncio_id, perfil_id, impressao, resultado, trecho, modelo, lido_em)
  values (p_anuncio, p_perfil, p_impressao, p_resultado, left(coalesce(p_trecho, ''), 300), left(p_modelo, 60), now())
  on conflict (anuncio_id, perfil_id) do update
     set impressao = excluded.impressao, resultado = excluded.resultado, trecho = excluded.trecho,
         modelo = excluded.modelo, lido_em = now();
end
$$;
revoke execute on function public.servidor_config_atividades(text), public.servidor_dados_para_atividades(text),
  public.servidor_guardar_atividades(text, uuid, uuid, text, text, text, text) from public;
grant execute on function public.servidor_config_atividades(text), public.servidor_dados_para_atividades(text),
  public.servidor_guardar_atividades(text, uuid, uuid, text, text, text, text) to anon, authenticated, service_role;

-- Quem publicou: as atividades lidas de quem está na vaga dela (para a nota em Candidatos, Talentos e na Triagem)
create or replace function public.atividades_da_vaga(p_anuncio uuid)
returns table (perfil_id uuid, resultado text, trecho text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.minha_vaga_qualquer(p_anuncio);
  return query
  select l.perfil_id, l.resultado, l.trecho
    from privado.atividades_da_vaga l
   where l.anuncio_id = p_anuncio and l.resultado <> 'sem';
end
$$;
revoke execute on function public.atividades_da_vaga(uuid) from public, anon;
grant execute on function public.atividades_da_vaga(uuid) to authenticated;

-- Quem procura: as próprias (a mesma nota que a empresa vê, nas vagas)
create or replace function public.minhas_atividades()
returns table (anuncio_id uuid, resultado text, trecho text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.anuncio_id, l.resultado, l.trecho
    from privado.atividades_da_vaga l
   where l.perfil_id = public.conta_atual() and l.resultado <> 'sem'
$$;
revoke execute on function public.minhas_atividades() from public, anon;
grant execute on function public.minhas_atividades() to authenticated;

-- O admin: ligar, o modelo, os números e os pares para a comparação Haiku x Sonnet
create or replace function public.admin_config_atividades(p_ligado boolean, p_modelo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  update privado.config_atividades
     set ligado = coalesce(p_ligado, ligado), modelo = coalesce(left(p_modelo, 60), modelo), atualizado_em = now()
   where id;
end
$$;

create or replace function public.admin_atividades()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return jsonb_build_object(
    'config', (select jsonb_build_object('ligado', c.ligado, 'modelo', c.modelo, 'atualizado_em', c.atualizado_em)
                 from privado.config_atividades c where c.id),
    'lidos', (select count(*) from privado.atividades_da_vaga),
    'por_resultado', coalesce((select jsonb_object_agg(x.resultado, x.n)
                                 from (select resultado, count(*) as n from privado.atividades_da_vaga group by 1) x),
                              '{}'::jsonb));
end
$$;

create or replace function public.admin_dados_para_atividades()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return privado.dados_para_atividades();
end
$$;
revoke execute on function public.admin_config_atividades(boolean, text), public.admin_atividades(),
  public.admin_dados_para_atividades() from public, anon;
grant execute on function public.admin_config_atividades(boolean, text), public.admin_atividades(),
  public.admin_dados_para_atividades() to authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270831120000_atividades_da_vaga');
