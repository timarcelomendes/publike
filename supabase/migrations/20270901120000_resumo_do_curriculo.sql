-- O resumo de recrutador (22/11/2026; claude/plano-curriculo-otimizado.md, fase 1; Marcelo: "Sim", com o resumo gerado
-- para todos os currículos, só com o que já está neles, e a pessoa vê e muda). Uma linha que a empresa entende em 5
-- segundos ("Cozinheira · cerca de 3 anos em restaurante · fritura, chapa e pré-preparo · curso de manipulação de
-- alimentos"). A leitura do currículo (migração 20270826120000) passa a escrever o resumo junto (versão 2: os
-- currículos já lidos são lidos de novo uma vez); a pessoa pode trocar pelo dela (curriculos.resumo) ou voltar ao
-- automático. As empresas veem o resumo de quem está em Talentos e de quem se candidatou às vagas delas.
--
-- Pode rodar de novo.

alter table public.curriculos add column if not exists resumo text;
alter table public.curriculos drop constraint if exists curriculos_resumo;
alter table public.curriculos add constraint curriculos_resumo
  check (resumo is null or char_length(resumo) between 10 and 200);

alter table privado.leituras_curriculo add column if not exists resumo text not null default '';
alter table privado.leituras_curriculo add column if not exists versao integer not null default 1;

-- O robô relê quem foi lido na versão de antes (sem o resumo), além de quem mudou o currículo
create or replace function public.servidor_curriculos_para_leitura(p_chave text, p_limite integer default 6)
returns table (perfil_id uuid, impressao text, titulo text, experiencias jsonb, escolaridade text, curso text,
               estudos jsonb, cursos text[], habilidades text[], cnh text, disponibilidade text[], tiradas text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select c.perfil_id, privado.impressao_do_curriculo(c), c.titulo, c.experiencias, c.escolaridade, c.curso,
         c.estudos, c.cursos, c.habilidades, c.cnh, c.disponibilidade, coalesce(l.tiradas, '{}')
    from public.curriculos c
    left join privado.leituras_curriculo l on l.perfil_id = c.perfil_id
   where privado.curriculo_para_leitura(c.perfil_id)
     and (l.perfil_id is null or l.impressao <> privado.impressao_do_curriculo(c) or l.versao < 2)
   order by (l.perfil_id is not null and l.impressao = privado.impressao_do_curriculo(c)), c.atualizado_em desc
   limit least(greatest(coalesce(p_limite, 6), 1), 30);
end
$$;

-- Guardar com o resumo (a versão 2); a de antes (sem o resumo) continua valendo enquanto o site novo não chega
create or replace function public.servidor_guardar_leitura(
  p_chave text,
  p_perfil uuid,
  p_impressao text,
  p_funcoes jsonb,
  p_nota integer,
  p_melhorar text[],
  p_modelo text,
  p_resumo text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.servidor_guardar_leitura(p_chave, p_perfil, p_impressao, p_funcoes, p_nota, p_melhorar, p_modelo);
  update privado.leituras_curriculo
     set resumo = case
                    when coalesce(p_resumo, '') ~ '(\d{4,5}[- ]?\d{4}|@|https?://|www\.)' then ''
                    else left(regexp_replace(trim(coalesce(p_resumo, '')), '\s+', ' ', 'g'), 200)
                  end,
         versao = 2
   where perfil_id = p_perfil;
end
$$;
revoke execute on function public.servidor_guardar_leitura(text, uuid, text, jsonb, integer, text[], text, text) from public;
grant execute on function public.servidor_guardar_leitura(text, uuid, text, jsonb, integer, text[], text, text)
  to anon, authenticated, service_role;

-- A pessoa: a leitura com o resumo automático e o dela
create or replace function public.minha_leitura_do_curriculo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
begin
  if eu is null then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'em_talentos', exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = eu),
      'funcoes', coalesce(l.funcoes, '[]'::jsonb),
      'nota', l.nota,
      'melhorar', coalesce(to_jsonb(l.melhorar), '[]'::jsonb),
      'lido_em', l.lido_em,
      'resumo', coalesce(l.resumo, ''),
      'meu_resumo', (select c.resumo from public.curriculos c where c.perfil_id = eu),
      -- o currículo mudou depois da leitura: a leitura nova vem na fila
      'desatualizada', l.perfil_id is not null and exists (
        select 1 from public.curriculos c where c.perfil_id = eu and privado.impressao_do_curriculo(c) <> l.impressao))
      from (select 1) um
      left join privado.leituras_curriculo l on l.perfil_id = eu);
end
$$;

-- A pessoa troca o resumo pelo dela (sem contato) ou volta ao automático (vazio)
create or replace function public.mudar_meu_resumo(p_resumo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  r text := nullif(regexp_replace(trim(coalesce(p_resumo, '')), '\s+', ' ', 'g'), '');
begin
  perform privado.exigir_conta_ativa();
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if r is not null and char_length(r) not between 10 and 200 then
    raise exception 'O resumo vai de 10 a 200 letras.' using errcode = '22023';
  end if;
  if r ~ '(\d{4,5}[- ]?\d{4}|@|https?://|www\.)' then
    raise exception 'Sem telefone, e-mail ou link no resumo: o contato aparece quando você aceitar.' using errcode = '22023';
  end if;
  update public.curriculos set resumo = r where perfil_id = eu;
  if not found then
    raise exception 'Salve o currículo primeiro.' using errcode = 'P0002';
  end if;
end
$$;
revoke execute on function public.mudar_meu_resumo(text) from public, anon;
grant execute on function public.mudar_meu_resumo(text) to authenticated;

-- Quem contrata: o resumo de quem está em Talentos ou se candidatou a uma vaga da conta (o dela, se mudou; senão, o
-- da leitura). Sem bloqueio entre os dois.
create or replace function public.resumos_dos_curriculos(p_perfis uuid[])
returns table (perfil_id uuid, resumo text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.perfil_id, coalesce(nullif(c.resumo, ''), nullif(l.resumo, ''))
    from public.curriculos c
    left join privado.leituras_curriculo l on l.perfil_id = c.perfil_id
   where c.perfil_id = any (p_perfis[1:500])
     and coalesce(nullif(c.resumo, ''), nullif(l.resumo, '')) is not null
     and public.conta_atual() is not null
     and not privado.ha_bloqueio(public.conta_atual(), c.perfil_id)
     and (exists (select 1 from public.curriculo_visivel v where v.perfil_id = c.perfil_id)
          or exists (select 1 from public.curtidas k join public.anuncios a on a.id = k.anuncio_id
                      where k.perfil_id = c.perfil_id and a.autor_id = public.conta_atual()))
$$;
revoke execute on function public.resumos_dos_curriculos(uuid[]) from public, anon;
grant execute on function public.resumos_dos_curriculos(uuid[]) to authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270901120000_resumo_do_curriculo');
