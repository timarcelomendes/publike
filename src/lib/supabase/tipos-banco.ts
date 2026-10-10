// Tipos do banco, no formato que o `supabase gen types typescript` gera.
// Se mudar a migração, atualize aqui ou gere de novo com a CLI do Supabase:
//   npx supabase gen types typescript --project-id SEU_ID > src/lib/supabase/tipos-banco.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type SemTabela = { [_ in never]: never };

export type Database = {
  public: {
    Tables: {
      perfis: {
        Row: {
          id: string;
          nome: string;
          tipo: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          sobre: string | null;
          servicos: string[];
          verificado: boolean;
          criado_em: string;
          atualizado_em: string;
          /** conta suspensa até esta data (banimento = daqui a 100 anos) */
          suspenso_ate: string | null;
          /** só agências: 14 caracteres, sem pontuação (aceita o CNPJ com letras) */
          cnpj: string | null;
        };
        Insert: {
          id: string;
          nome: string;
          tipo?: string;
          foto?: string | null;
          cidade?: string;
          bairro?: string | null;
          sobre?: string | null;
          servicos?: string[];
          cnpj?: string | null;
        };
        Update: {
          nome?: string;
          tipo?: string;
          foto?: string | null;
          cidade?: string;
          bairro?: string | null;
          sobre?: string | null;
          servicos?: string[];
          cnpj?: string | null;
        };
        Relationships: [];
      };
      contatos: {
        Row: {
          perfil_id: string;
          whatsapp: string | null;
          email: string | null;
          receber_emails: boolean;
          atualizado_em: string;
        };
        Insert: {
          perfil_id: string;
          whatsapp?: string | null;
          email?: string | null;
          receber_emails?: boolean;
        };
        Update: {
          whatsapp?: string | null;
          email?: string | null;
          receber_emails?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "contatos_perfil_id_fkey";
            columns: ["perfil_id"];
            isOneToOne: true;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
        ];
      };
      salvas: {
        Row: { perfil_id: string; anuncio_id: string; criado_em: string };
        Insert: { anuncio_id: string };
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      dispensas: {
        Row: { perfil_id: string; anuncio_id: string; criado_em: string };
        Insert: { anuncio_id: string };
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      /** CEP de casa de quem procura: só a própria pessoa lê; ponto arredondado (~300 m) */
      casas: {
        Row: { perfil_id: string; cep: string; cidade: string; bairro: string; local: unknown; atualizado_em: string };
        Insert: { cep: string; cidade: string; bairro?: string; local: string };
        Update: { cep?: string; cidade?: string; bairro?: string; local?: string };
        Relationships: [];
      };
      preferencias: {
        Row: { perfil_id: string; procuro: string | null; atualizado_em: string };
        Insert: { procuro?: string | null };
        Update: { procuro?: string | null };
        Relationships: [];
      };
      moderadores: {
        Row: { perfil_id: string; criado_em: string };
        Insert: { perfil_id: string };
        Update: { perfil_id?: string };
        Relationships: [];
      };
      anuncios: {
        Row: {
          id: string;
          autor_id: string;
          tipo: string;
          titulo: string;
          descricao: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          horario: string | null;
          vagas: number;
          cidade: string;
          bairro: string;
          local: unknown;
          status: string;
          criado_em: string;
          atualizado_em: string;
          expira_em: string;
          busca: unknown;
          nota_moderacao: string | null;
          oficio: string | null;
          fotos: string[];
          atende: string[];
          pede_curriculo: boolean;
          /** vaga de agência: a empresa que contrata (null se confidencial) */
          contratante: string | null;
          contratante_confidencial: boolean;
          /** CEP e endereço (só comércio, empresa e agência; senão null) */
          cep: string | null;
          endereco: string | null;
          /** o ponto é o endereço exato (senão é uma área de ~500 m) */
          local_exato: boolean;
        };
        Insert: {
          tipo: string;
          titulo: string;
          descricao: string;
          categoria: string;
          regime?: string | null;
          pagamento_valor?: number | null;
          pagamento_unidade?: string | null;
          beneficios?: string | null;
          horario?: string | null;
          vagas?: number;
          cidade: string;
          bairro: string;
          /** EWKT, por exemplo: SRID=4326;POINT(-49.25 -16.68) */
          local: string;
          oficio?: string | null;
          fotos?: string[];
          atende?: string[];
          pede_curriculo?: boolean;
          contratante?: string | null;
          contratante_confidencial?: boolean;
          cep?: string | null;
          endereco?: string | null;
        };
        Update: {
          titulo?: string;
          descricao?: string;
          categoria?: string;
          regime?: string | null;
          pagamento_valor?: number | null;
          pagamento_unidade?: string | null;
          beneficios?: string | null;
          horario?: string | null;
          vagas?: number;
          cidade?: string;
          bairro?: string;
          local?: string;
          status?: string;
          oficio?: string | null;
          fotos?: string[];
          atende?: string[];
          pede_curriculo?: boolean;
          contratante?: string | null;
          contratante_confidencial?: boolean;
          cep?: string | null;
          endereco?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "anuncios_autor_id_fkey";
            columns: ["autor_id"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
        ];
      };
      curriculos: {
        Row: {
          perfil_id: string;
          escolaridade: string | null;
          curso: string | null;
          experiencias: Json;
          cursos: string[];
          cnh: string | null;
          disponibilidade: string[];
          arquivo: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          perfil_id: string;
          escolaridade?: string | null;
          curso?: string | null;
          experiencias?: Json;
          cursos?: string[];
          cnh?: string | null;
          disponibilidade?: string[];
          arquivo?: string | null;
        };
        Update: {
          escolaridade?: string | null;
          curso?: string | null;
          experiencias?: Json;
          cursos?: string[];
          cnh?: string | null;
          disponibilidade?: string[];
          arquivo?: string | null;
        };
        Relationships: [];
      };
      curtidas: {
        Row: {
          anuncio_id: string;
          perfil_id: string;
          mensagem: string | null;
          status: string;
          criado_em: string;
          respondida_em: string | null;
          desfeito_por: string | null;
          desfeito_motivo: string | null;
          desfeito_em: string | null;
          desfeito_futuro: boolean | null;
        };
        Insert: {
          anuncio_id: string;
          mensagem?: string | null;
        };
        Update: SemTabela;
        Relationships: [
          {
            foreignKeyName: "curtidas_anuncio_id_fkey";
            columns: ["anuncio_id"];
            isOneToOne: false;
            referencedRelation: "anuncios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curtidas_perfil_id_fkey";
            columns: ["perfil_id"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
        ];
      };
      denuncias: {
        Row: {
          id: number;
          anuncio_id: string;
          autor_id: string | null;
          motivo: string;
          detalhes: string | null;
          status: string;
          criado_em: string;
        };
        Insert: {
          anuncio_id: string;
          motivo: string;
          detalhes?: string | null;
        };
        Update: SemTabela;
        Relationships: [];
      };
      config_site: {
        Row: {
          id: boolean;
          emails_ativos: boolean;
          remetente_nome: string;
          responder_para: string | null;
          email_curtida: boolean;
          email_match: boolean;
          email_moderacao: boolean;
          email_conta: boolean;
          avisos_para: string[];
          aviso_denuncia: boolean;
          aviso_cadastro: boolean;
          aviso_retirado: boolean;
          ia_moderacao: boolean;
          ia_melhorar_texto: boolean;
          ia_resumo: boolean;
          ia_modelo: string;
          email_logo: boolean;
          email_logo_url: string | null;
          atualizado_em: string;
          atualizado_por: string | null;
        };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      notificacoes: {
        Row: {
          id: number;
          destinatario_id: string;
          tipo: string;
          anuncio_id: string | null;
          texto: string;
          lida: boolean;
          criado_em: string;
          ator_id: string | null;
        };
        Insert: SemTabela;
        Update: { lida?: boolean };
        Relationships: [];
      };
    };
    Views: SemTabela;
    Functions: {
      buscar_anuncios: {
        Args: {
          p_lat?: number;
          p_lng?: number;
          p_raio_km?: number;
          p_tipo?: string | null;
          p_categoria?: string | null;
          p_regime?: string | null;
          p_texto?: string | null;
          p_ordem?: string;
          p_limite?: number;
          p_cidade?: string | null;
          p_bairro?: string | null;
          p_bairros_regiao?: string[] | null;
          p_regiao?: string | null;
          p_por_distancia?: boolean;
        };
        Returns: {
          id: string;
          tipo: string;
          titulo: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
          distancia_km: number;
          criado_em: string;
          autor_id: string;
          autor_nome: string;
          autor_tipo: string;
          autor_verificado: boolean;
          minha_curtida: string | null;
          /** 0 = no bairro de quem busca, 1 = na região (ou atende a região), 2 = na cidade, 3 = o resto */
          prioridade: number;
          oficio: string | null;
          /** primeira foto de trabalho (serviço) */
          foto: string | null;
          /** média das avaliações publicadas do profissional (só serviço) */
          autor_nota: number | null;
          autor_avaliacoes: number;
        }[];
      };
      obter_anuncio: {
        Args: { p_id: string };
        Returns: {
          id: string;
          autor_id: string;
          tipo: string;
          titulo: string;
          descricao: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          horario: string | null;
          vagas: number;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
          status: string;
          criado_em: string;
          atualizado_em: string;
          expira_em: string;
          autor_nome: string;
          autor_tipo: string;
          autor_foto: string | null;
          autor_verificado: boolean;
          autor_desde: string;
          minha_curtida: string | null;
          minha_mensagem: string | null;
          oficio: string | null;
          fotos: string[];
          atende: string[];
          pede_curriculo: boolean;
          contratante: string | null;
          contratante_confidencial: boolean;
          /** CNPJ de quem publicou, quando é agência */
          autor_cnpj: string | null;
          cep: string | null;
          endereco: string | null;
          local_exato: boolean;
        }[];
      };
      meus_anuncios: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          tipo: string;
          titulo: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          cidade: string;
          bairro: string;
          status: string;
          criado_em: string;
          expira_em: string;
          curtidas_total: number;
          curtidas_novas: number;
          matches: number;
        }[];
      };
      interessados: {
        Args: { p_anuncio: string };
        Returns: {
          perfil_id: string;
          nome: string;
          tipo: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          sobre: string | null;
          servicos: string[];
          verificado: boolean;
          membro_desde: string;
          mensagem: string | null;
          status: string;
          curtido_em: string;
          whatsapp: string | null;
          email: string | null;
        }[];
      };
      curriculos_dos_interessados: {
        Args: { p_anuncio: string };
        Returns: {
          perfil_id: string;
          escolaridade: string | null;
          curso: string | null;
          experiencias: Json;
          cursos: string[];
          cnh: string | null;
          disponibilidade: string[];
          arquivo: string | null;
          atualizado_em: string;
        }[];
      };
      desfazer_match: {
        Args: { p_anuncio: string; p_perfil: string; p_motivo: string; p_justificativa: string; p_futuro: boolean };
        Returns: undefined;
      };
      curtir_de_novo: {
        Args: { p_anuncio: string; p_mensagem?: string | null };
        Returns: undefined;
      };
      admin_matches_desfeitos: {
        Args: { p_perfil: string };
        Returns: {
          id: number;
          anuncio_id: string | null;
          titulo: string;
          tipo_anuncio: string;
          fez: boolean;
          outro_id: string | null;
          outro_nome: string | null;
          motivo: string;
          justificativa: string;
          futuro: boolean;
          match_em: string | null;
          criado_em: string;
        }[];
      };
      pode_ver_curriculo: {
        Args: { p_perfil: string };
        Returns: boolean;
      };
      minhas_curtidas: {
        Args: Record<PropertyKey, never>;
        Returns: {
          anuncio_id: string;
          titulo: string;
          tipo: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          cidade: string;
          bairro: string;
          anuncio_status: string;
          expira_em: string;
          autor_id: string;
          autor_nome: string;
          autor_tipo: string;
          autor_foto: string | null;
          status: string;
          mensagem: string | null;
          curtido_em: string;
          respondida_em: string | null;
          autor_whatsapp: string | null;
          autor_email: string | null;
        }[];
      };
      meus_matches: {
        Args: Record<PropertyKey, never>;
        Returns: {
          anuncio_id: string;
          anuncio_titulo: string;
          anuncio_tipo: string;
          papel: string;
          outro_id: string;
          outro_nome: string;
          outro_tipo: string;
          outro_foto: string | null;
          outro_cidade: string;
          outro_bairro: string | null;
          outro_whatsapp: string | null;
          outro_email: string | null;
          match_em: string;
        }[];
      };
      responder_curtida: {
        Args: { p_anuncio: string; p_perfil: string; p_decisao: string };
        Returns: undefined;
      };
      renovar_anuncio: {
        Args: { p_id: string };
        Returns: string;
      };
      meus_servicos: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          oficio: string | null;
          categoria: string;
          titulo: string;
          descricao: string;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          fotos: string[];
          atende: string[];
          horario: string | null;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
          status: string;
          expira_em: string;
        }[];
      };
      avaliar: {
        Args: { p_anuncio: string; p_nota: number; p_comentario?: string | null };
        /** "publicada" ou "pendente" (esperando a IA) */
        Returns: string;
      };
      responder_avaliacao: {
        Args: { p_avaliacao: number; p_resposta: string };
        Returns: string;
      };
      denunciar_avaliacao: {
        Args: { p_avaliacao: number; p_motivo: string };
        Returns: undefined;
      };
      avaliacoes_publicas: {
        Args: { p_profissional: string; p_limite?: number };
        Returns: {
          id: number;
          nota: number;
          comentario: string | null;
          titulo_servico: string;
          anuncio_id: string | null;
          criado_em: string;
          autor_nome: string;
          autor_foto: string | null;
          resposta: string | null;
          respondida_em: string | null;
        }[];
      };
      minhas_avaliacoes_recebidas: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: number;
          nota: number;
          comentario: string | null;
          titulo_servico: string;
          anuncio_id: string | null;
          criado_em: string;
          autor_nome: string;
          autor_foto: string | null;
          resposta: string | null;
          resposta_status: string | null;
          denunciada: boolean;
        }[];
      };
      minha_avaliacao: {
        Args: { p_anuncio: string };
        Returns: { id: number; nota: number; comentario: string | null; status: string; criado_em: string }[];
      };
      nota_do_profissional: {
        Args: { p_profissional: string };
        Returns: { media: number | null; total: number }[];
      };
      fila_avaliacoes: {
        Args: Record<PropertyKey, never>;
        Returns: {
          avaliacao_id: number;
          parte: string;
          situacao: string;
          texto: string | null;
          nota: number;
          titulo_servico: string;
          anuncio_id: string | null;
          escritor_id: string;
          escritor_nome: string;
          escritor_advertencias: number;
          profissional_id: string;
          profissional_nome: string;
          ia_categorias: string[];
          ia_explicacao: string | null;
          motivo_denuncia: string | null;
          criado_em: string;
        }[];
      };
      moderar_avaliacao: {
        Args: { p_avaliacao: number; p_parte: string; p_decisao: string };
        Returns: undefined;
      };
      admin_advertencias: {
        Args: { p_usuario: string };
        Returns: { id: number; origem: string; motivo: string; avaliacao_id: number | null; criado_em: string }[];
      };
      servidor_pegar_avaliacoes_ia: {
        Args: { p_chave: string; p_limite?: number };
        Returns: {
          avaliacao_id: number;
          parte: string;
          versao: string;
          texto: string | null;
          nota: number;
          titulo_servico: string;
          modelo: string;
        }[];
      };
      servidor_resultado_avaliacao: {
        Args: {
          p_chave: string;
          p_avaliacao: number;
          p_parte: string;
          p_versao: string;
          p_decisao: string;
          p_categorias?: string[];
          p_explicacao?: string | null;
          p_modelo?: string | null;
        };
        Returns: string;
      };
      salvar_meus_servicos: {
        Args: {
          p_servicos: {
            id?: string;
            oficio: string | null;
            categoria: string;
            titulo: string;
            descricao: string;
            pagamento_valor: number | null;
            pagamento_unidade: string | null;
            fotos: string[];
          }[];
          p_cidade: string;
          p_bairro: string;
          p_lat: number;
          p_lng: number;
          p_atende: string[];
          p_horario: string | null;
        };
        Returns: number;
      };
      salvar_perfil: {
        Args: {
          p_nome: string;
          p_tipo: string;
          p_cidade: string;
          p_bairro: string | null;
          p_sobre: string | null;
          p_servicos: string[];
          p_foto: string | null;
          p_whatsapp: string | null;
          p_email: string | null;
          p_receber_emails?: boolean;
          /** só agências; aceita com ou sem pontuação */
          p_cnpj?: string | null;
        };
        Returns: undefined;
      };
      vagas_para_descobrir: {
        Args: { p_limite?: number };
        Returns: {
          id: string;
          titulo: string;
          /** até 600 letras */
          descricao: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          horario: string | null;
          vagas: number;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
          criado_em: string;
          autor_id: string;
          autor_nome: string;
          autor_tipo: string;
          autor_verificado: boolean;
          contratante: string | null;
          contratante_confidencial: boolean;
          pede_curriculo: boolean;
          curtidas_7d: number;
          salvas_7d: number;
          minha_curtida: string | null;
          salva: boolean;
          dispensada: boolean;
        }[];
      };
      usar_ia_indicacoes: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      minha_casa: {
        Args: Record<PropertyKey, never>;
        Returns: { cep: string; cidade: string; bairro: string; lat: number; lng: number }[];
      };
      meu_ultimo_endereco: {
        Args: Record<PropertyKey, never>;
        Returns: {
          cep: string | null;
          endereco: string | null;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
        }[];
      };
      cnpj_valido: {
        Args: { p_cnpj: string };
        Returns: boolean;
      };
      excluir_minha_conta: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      fila_moderacao: {
        Args: Record<PropertyKey, never>;
        Returns: {
          anuncio_id: string;
          titulo: string;
          tipo: string;
          status: string;
          cidade: string;
          bairro: string;
          criado_em: string;
          autor_id: string;
          autor_nome: string;
          denuncias_abertas: number;
          motivos: string[];
          detalhes: string[];
          ia_retido: boolean;
          ia_falhou: boolean;
          ia_categorias: string[];
          ia_explicacao: string | null;
        }[];
      };
      moderar_anuncio: {
        Args: { p_anuncio: string; p_decisao: string; p_nota?: string | null };
        Returns: undefined;
      };
      eh_moderador: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      config_publica: {
        Args: Record<PropertyKey, never>;
        Returns: { ia_melhorar_texto: boolean; ia_modelo: string }[];
      };
      logo_emails: {
        Args: Record<PropertyKey, never>;
        Returns: { mostrar: boolean; url: string | null }[];
      };
      minha_conta_suspensa: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      usar_ia_texto: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };

      // ---------------------------------------------------- painel (admin e moderação)
      admin_resumo: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      admin_listar_usuarios: {
        Args: { p_busca?: string | null; p_filtro?: string; p_limite?: number; p_deslocamento?: number };
        Returns: {
          id: string;
          email: string | null;
          telefone: string | null;
          provedor: string;
          criado_em: string;
          ultimo_acesso: string | null;
          nome: string | null;
          tipo: string | null;
          cidade: string | null;
          bairro: string | null;
          foto: string | null;
          verificado: boolean;
          whatsapp: string | null;
          moderador: boolean;
          suspenso_ate: string | null;
          suspensao_tipo: string | null;
          anuncios_total: number;
          anuncios_no_ar: number;
          denuncias_recebidas: number;
          total: number;
        }[];
      };
      admin_usuario: {
        Args: { p_id: string };
        Returns: Json;
      };
      admin_listar_anuncios: {
        Args: {
          p_busca?: string | null;
          p_status?: string;
          p_tipo?: string | null;
          p_autor?: string | null;
          p_limite?: number;
          p_deslocamento?: number;
        };
        Returns: {
          id: string;
          tipo: string;
          titulo: string;
          categoria: string;
          regime: string | null;
          cidade: string;
          bairro: string;
          status: string;
          criado_em: string;
          atualizado_em: string;
          expira_em: string;
          autor_id: string;
          autor_nome: string;
          autor_suspenso: boolean;
          curtidas: number;
          matches: number;
          denuncias_abertas: number;
          ia_decisao: string | null;
          total: number;
        }[];
      };
      admin_anuncio: {
        Args: { p_id: string };
        Returns: Json;
      };
      admin_excluir_anuncio: {
        Args: { p_id: string; p_motivo?: string | null };
        Returns: undefined;
      };
      admin_suspender: {
        Args: { p_usuario: string; p_dias: number | null; p_motivo: string };
        Returns: string;
      };
      admin_reativar: {
        Args: { p_usuario: string };
        Returns: undefined;
      };
      admin_verificar: {
        Args: { p_usuario: string; p_verificado: boolean };
        Returns: undefined;
      };
      admin_excluir_conta: {
        Args: { p_usuario: string; p_motivo: string };
        Returns: undefined;
      };
      admin_listar_moderadores: {
        Args: Record<PropertyKey, never>;
        Returns: { perfil_id: string; email: string | null; nome: string; foto: string | null; criado_em: string }[];
      };
      admin_adicionar_moderador: {
        Args: { p_email: string };
        Returns: string;
      };
      admin_remover_moderador: {
        Args: { p_perfil: string };
        Returns: undefined;
      };
      admin_config: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Tables"]["config_site"]["Row"][];
      };
      admin_salvar_logo_emails: {
        Args: { p_mostrar: boolean; p_url: string | null };
        Returns: undefined;
      };
      admin_salvar_config_emails: {
        Args: {
          p_emails_ativos: boolean;
          p_remetente_nome: string;
          p_responder_para: string | null;
          p_email_curtida: boolean;
          p_email_match: boolean;
          p_email_moderacao: boolean;
          p_email_conta: boolean;
          p_avisos_para: string[];
          p_aviso_denuncia: boolean;
          p_aviso_cadastro: boolean;
          p_aviso_retirado: boolean;
        };
        Returns: undefined;
      };
      admin_salvar_config_ia: {
        Args: { p_moderacao: boolean; p_melhorar_texto: boolean; p_resumo: boolean; p_modelo: string };
        Returns: undefined;
      };
      admin_modelos_email: {
        Args: Record<PropertyKey, never>;
        Returns: {
          chave: string;
          grupo: string;
          nome: string;
          descricao: string;
          variaveis: string[];
          assunto: string;
          corpo: string;
          botao: string | null;
          alterado: boolean;
          atualizado_em: string | null;
        }[];
      };
      admin_salvar_modelo_email: {
        Args: { p_chave: string; p_assunto: string; p_corpo: string; p_botao: string | null };
        Returns: undefined;
      };
      admin_restaurar_modelo_email: {
        Args: { p_chave: string };
        Returns: undefined;
      };
      admin_fila_emails: {
        Args: { p_limite?: number };
        Returns: {
          id: number;
          modelo: string;
          para: string;
          status: string;
          tentativas: number;
          erro: string | null;
          criado_em: string;
          enviado_em: string | null;
        }[];
      };
      admin_reenviar_emails: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      admin_email_teste: {
        Args: { p_para: string };
        Returns: number;
      };
      admin_status_email: {
        Args: { p_id: number };
        Returns: { status: string; erro: string | null; enviado_em: string | null }[];
      };
      admin_decisoes_ia: {
        Args: { p_limite?: number };
        Returns: {
          id: number;
          anuncio_id: string;
          titulo: string;
          status: string;
          decisao: string;
          categorias: string[];
          explicacao: string | null;
          modelo: string | null;
          criado_em: string;
        }[];
      };
      admin_dados_para_resumo: {
        Args: { p_dias?: number };
        Returns: Json;
      };
      admin_salvar_resumo: {
        Args: { p_texto: string; p_dias: number; p_modelo: string | null };
        Returns: number;
      };
      admin_ultimo_resumo: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: number;
          texto: string;
          dias: number;
          modelo: string | null;
          criado_em: string;
          criado_por: string;
        }[];
      };
      admin_registro: {
        Args: { p_limite?: number; p_alvo?: string | null };
        Returns: {
          id: number;
          quem: string;
          acao: string;
          alvo_tipo: string;
          alvo_id: string | null;
          rotulo: string | null;
          detalhes: Json;
          criado_em: string;
        }[];
      };
      admin_listar_chaves_servidor: {
        Args: Record<PropertyKey, never>;
        Returns: { id: number; nome: string; criada_em: string; usada_em: string | null }[];
      };
      admin_criar_chave_servidor: {
        Args: { p_nome: string; p_hash: string };
        Returns: number;
      };
      admin_apagar_chave_servidor: {
        Args: { p_id: number };
        Returns: undefined;
      };

      // ---------------------------------------------------- servidor do site (chave do servidor)
      servidor_pegar_emails: {
        Args: { p_chave: string; p_limite?: number; p_so_teste?: boolean };
        Returns: {
          id: number;
          modelo: string;
          grupo: string;
          para: string;
          dados: Json;
          assunto: string;
          corpo: string;
          botao: string | null;
          remetente_nome: string;
          responder_para: string | null;
        }[];
      };
      servidor_marcar_email: {
        Args: { p_chave: string; p_id: number; p_ok: boolean; p_erro?: string | null };
        Returns: undefined;
      };
      servidor_pegar_revisoes_ia: {
        Args: { p_chave: string; p_limite?: number };
        Returns: {
          anuncio_id: string;
          versao: string;
          tipo: string;
          titulo: string;
          descricao: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          horario: string | null;
          vagas: number;
          cidade: string;
          bairro: string;
          autor_tipo: string;
          modelo: string;
          oficio: string | null;
          fotos: string[];
          contratante: string | null;
          contratante_confidencial: boolean;
        }[];
      };
      servidor_resultado_ia: {
        Args: {
          p_chave: string;
          p_anuncio: string;
          p_versao: string;
          p_decisao: string;
          p_categorias?: string[];
          p_explicacao?: string | null;
          p_modelo?: string | null;
        };
        Returns: string;
      };
    };
    Enums: SemTabela;
    CompositeTypes: SemTabela;
  };
};
