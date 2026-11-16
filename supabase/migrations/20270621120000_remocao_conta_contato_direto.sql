-- A remoção agendada "só se não responder" não removia vaga com contato direto (16/11/2026, Marcelo: "Não saiu do ar
-- no prazo"). Com o contato direto, a curtida já vira match sozinha, e privado.candidatos_esperando só contava a
-- curtida pendente: deu 0, e o robô marcou "respondeu" um minuto depois do prazo, sem a empresa ter feito nada (a vaga
-- "Ajudante de logística…", agendada para 15/11 23:15, tinha 61 candidatos sem nenhuma etapa).
--
-- Agora, na vaga com contato direto, também espera resposta quem virou match sozinho e quem publicou ainda não mexeu:
-- sem etapa ou em "Novo". Chamar para entrevista, Em análise, Contratado ou Não seguir contam como resposta, como o
-- aviso da moderação pede. A vaga comum continua igual (o aceite já é a resposta).
--
-- Pode rodar de novo.

create or replace function privado.candidatos_esperando(p_anuncio uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
   where c.anuncio_id = p_anuncio
     and ((c.status = 'pendente' and c.aceita_em is null)
          or (a.contato_direto and c.status = 'match' and coalesce(e.etapa, 'novo') = 'novo'))
$$;

revoke execute on function privado.candidatos_esperando(uuid) from public, anon, authenticated;
