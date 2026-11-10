export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          provider_avatar_url: string | null
          provider_login: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          provider_avatar_url?: string | null
          provider_login?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          provider_avatar_url?: string | null
          provider_login?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      commits: {
        Row: {
          author_id: string
          changes: Json
          created_at: string
          id: string
          message: string
          repo_id: string
        }
        Insert: {
          author_id: string
          changes?: Json
          created_at?: string
          id?: string
          message: string
          repo_id: string
        }
        Update: {
          author_id?: string
          changes?: Json
          created_at?: string
          id?: string
          message?: string
          repo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commits_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commits_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          issue_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          issue_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          issue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_comments_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          author_id: string
          body: string
          closed_at: string | null
          created_at: string
          id: string
          number: number
          repo_id: string
          state: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          number?: number
          repo_id: string
          state?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          number?: number
          repo_id?: string
          state?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_secrets: {
        Row: {
          github_client_id: string | null
          github_client_secret_ciphertext: string | null
          id: number
          updated_at: string
        }
        Insert: {
          github_client_id?: string | null
          github_client_secret_ciphertext?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          github_client_id?: string | null
          github_client_secret_ciphertext?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          author_id: string
          body?: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          pr_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          pr_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          pr_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pr_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_comments_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "pull_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string | null
          available_for_hire: boolean
          avatar_url: string | null
          bio: string | null
          company: string | null
          created_at: string
          display_name: string | null
          headline: string | null
          id: string
          links: Json
          location: string | null
          skills: string[]
          username: string
          website: string | null
        }
        Insert: {
          account_type?: string | null
          available_for_hire?: boolean
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          display_name?: string | null
          headline?: string | null
          id: string
          links?: Json
          location?: string | null
          skills?: string[]
          username: string
          website?: string | null
        }
        Update: {
          account_type?: string | null
          available_for_hire?: boolean
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          display_name?: string | null
          headline?: string | null
          id?: string
          links?: Json
          location?: string | null
          skills?: string[]
          username?: string
          website?: string | null
        }
        Relationships: []
      }
      pull_requests: {
        Row: {
          author_id: string
          body: string
          created_at: string
          head_repo_id: string
          id: string
          merged_at: string | null
          number: number
          repo_id: string
          state: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body?: string
          created_at?: string
          head_repo_id: string
          id?: string
          merged_at?: string | null
          number?: number
          repo_id: string
          state?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          head_repo_id?: string
          id?: string
          merged_at?: string | null
          number?: number
          repo_id?: string
          state?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pull_requests_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pull_requests_head_repo_id_fkey"
            columns: ["head_repo_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pull_requests_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_files: {
        Row: {
          content: string
          id: string
          path: string
          repo_id: string
          updated_at: string
        }
        Insert: {
          content?: string
          id?: string
          path: string
          repo_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          id?: string
          path?: string
          repo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_files_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      repositories: {
        Row: {
          created_at: string
          default_branch: string
          description: string | null
          forked_from: string | null
          github_full_name: string | null
          homepage: string | null
          id: string
          is_private: boolean
          language: string | null
          name: string
          next_number: number
          owner_id: string
          topics: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_branch?: string
          description?: string | null
          forked_from?: string | null
          github_full_name?: string | null
          homepage?: string | null
          id?: string
          is_private?: boolean
          language?: string | null
          name: string
          next_number?: number
          owner_id: string
          topics?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_branch?: string
          description?: string | null
          forked_from?: string | null
          github_full_name?: string | null
          homepage?: string | null
          id?: string
          is_private?: boolean
          language?: string | null
          name?: string
          next_number?: number
          owner_id?: string
          topics?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repositories_forked_from_fkey"
            columns: ["forked_from"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repositories_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stars: {
        Row: {
          created_at: string
          repo_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          repo_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          repo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stars_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read_repo: { Args: { rid: string }; Returns: boolean }
      can_write_repo: { Args: { rid: string }; Returns: boolean }
      ensure_my_profile: { Args: never; Returns: undefined }
      handle_new_user_row: { Args: { u: unknown }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_client: { Args: { _user_id: string }; Returns: boolean }
      is_developer: { Args: { _user_id: string }; Returns: boolean }
      issue_repo: { Args: { _issue_id: string }; Returns: string }
      pr_repo: { Args: { _pr_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
