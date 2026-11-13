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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          admin_label: string | null
          created_at: string
          id: number
          note: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          admin_label?: string | null
          created_at?: string
          id?: never
          note?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          admin_label?: string | null
          created_at?: string
          id?: never
          note?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_claim: {
        Row: {
          code_hash: string
          id: number
        }
        Insert: {
          code_hash: string
          id?: number
        }
        Update: {
          code_hash?: string
          id?: number
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          account_name: string | null
          account_number: string | null
          announcement: string | null
          announcement_level: string
          bank_name: string | null
          fee_percent: number
          id: number
          payment_instructions: string
          qris_url: string | null
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          announcement?: string | null
          announcement_level?: string
          bank_name?: string | null
          fee_percent?: number
          id?: number
          payment_instructions?: string
          qris_url?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          announcement?: string | null
          announcement_level?: string
          bank_name?: string | null
          fee_percent?: number
          id?: number
          payment_instructions?: string
          qris_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
      dm_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          pair_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          pair_key: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          pair_key?: string
        }
        Relationships: []
      }
      dm_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_participants: {
        Row: {
          conversation_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_ledger: {
        Row: {
          created_at: string
          developer_id: string
          fee: number
          gross: number
          held_until: string
          kind: string
          net: number
          note: string | null
          order_id: string
          released_at: string | null
          released_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          developer_id: string
          fee?: number
          gross: number
          held_until: string
          kind: string
          net: number
          note?: string | null
          order_id: string
          released_at?: string | null
          released_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          developer_id?: string
          fee?: number
          gross?: number
          held_until?: string
          kind?: string
          net?: number
          note?: string | null
          order_id?: string
          released_at?: string | null
          released_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_ledger_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      feed_autopost_repos: {
        Row: {
          created_at: string
          last_posted_at: string | null
          repo_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_posted_at?: string | null
          repo_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_posted_at?: string | null
          repo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_autopost_repos_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: true
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_autopost_repos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_autoposts: {
        Row: {
          commit_id: string | null
          created_at: string
          post_id: string
          repo_id: string
        }
        Insert: {
          commit_id?: string | null
          created_at?: string
          post_id: string
          repo_id: string
        }
        Update: {
          commit_id?: string | null
          created_at?: string
          post_id?: string
          repo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_autoposts_commit_id_fkey"
            columns: ["commit_id"]
            isOneToOne: false
            referencedRelation: "commits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_autoposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_autoposts_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_bookmarks: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_hashtags: {
        Row: {
          created_at: string
          post_id: string
          tag: string
        }
        Insert: {
          created_at?: string
          post_id: string
          tag: string
        }
        Update: {
          created_at?: string
          post_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_hashtags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_mentions: {
        Row: {
          post_id: string
          user_id: string
        }
        Insert: {
          post_id: string
          user_id: string
        }
        Update: {
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_mentions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          post_id: string | null
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          post_id?: string | null
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          post_id?: string | null
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_poll_votes: {
        Row: {
          created_at: string
          option_idx: number
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          option_idx: number
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          option_idx?: number
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_polls"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "feed_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_polls: {
        Row: {
          created_at: string
          ends_at: string
          options: string[]
          post_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          options: string[]
          post_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          options?: string[]
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          kind: string
          like_count: number
          parent_id: string | null
          ref_id: string | null
          reply_count: number
          repost_count: number
        }
        Insert: {
          author_id: string
          body?: string
          created_at?: string
          id?: string
          kind?: string
          like_count?: number
          parent_id?: string | null
          ref_id?: string | null
          reply_count?: number
          repost_count?: number
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          kind?: string
          like_count?: number
          parent_id?: string | null
          ref_id?: string | null
          reply_count?: number
          repost_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "feed_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_ref_id_fkey"
            columns: ["ref_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_reports: {
        Row: {
          action: string | null
          author_id: string | null
          created_at: string
          id: string
          note: string
          post_id: string | null
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          snapshot: string
          status: string
        }
        Insert: {
          action?: string | null
          author_id?: string | null
          created_at?: string
          id?: string
          note?: string
          post_id?: string | null
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          snapshot?: string
          status?: string
        }
        Update: {
          action?: string | null
          author_id?: string | null
          created_at?: string
          id?: string
          note?: string
          post_id?: string | null
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          snapshot?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_reports_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_stories: {
        Row: {
          author_id: string
          bg: string
          body: string
          created_at: string
          expires_at: string
          id: string
          image_url: string | null
        }
        Insert: {
          author_id: string
          bg?: string
          body?: string
          created_at?: string
          expires_at?: string
          id?: string
          image_url?: string | null
        }
        Update: {
          author_id?: string
          bg?: string
          body?: string
          created_at?: string
          expires_at?: string
          id?: string
          image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_stories_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_story_views: {
        Row: {
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "feed_stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_story_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_user_blocks: {
        Row: {
          created_at: string
          kind: string
          target_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          kind: string
          target_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          kind?: string
          target_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_user_blocks_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_user_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      git_objects: {
        Row: {
          created_at: string
          data: string
          repo_id: string
          sha: string
          type: string
        }
        Insert: {
          created_at?: string
          data: string
          repo_id: string
          sha: string
          type: string
        }
        Update: {
          created_at?: string
          data?: string
          repo_id?: string
          sha?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "git_objects_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      git_refs: {
        Row: {
          name: string
          repo_id: string
          sha: string
          synced_commit_id: string | null
          updated_at: string
        }
        Insert: {
          name: string
          repo_id: string
          sha: string
          synced_commit_id?: string | null
          updated_at?: string
        }
        Update: {
          name?: string
          repo_id?: string
          sha?: string
          synced_commit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "git_refs_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      git_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      hosted_files: {
        Row: {
          content_type: string
          created_at: string
          id: string
          kind: string
          name: string
          owner_id: string
          size: number
          slug: string
          storage_path: string
          updated_at: string
          views: number
        }
        Insert: {
          content_type?: string
          created_at?: string
          id?: string
          kind: string
          name: string
          owner_id: string
          size?: number
          slug: string
          storage_path: string
          updated_at?: string
          views?: number
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          owner_id?: string
          size?: number
          slug?: string
          storage_path?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "hosted_files_owner_id_fkey"
            columns: ["owner_id"]
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
      job_applications: {
        Row: {
          bid_amount: number
          cover_letter: string
          created_at: string
          developer_id: string
          est_days: number
          id: string
          job_id: string
          status: string
          updated_at: string
        }
        Insert: {
          bid_amount?: number
          cover_letter: string
          created_at?: string
          developer_id: string
          est_days?: number
          id?: string
          job_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          bid_amount?: number
          cover_letter?: string
          created_at?: string
          developer_id?: string
          est_days?: number
          id?: string
          job_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_messages: {
        Row: {
          application_id: string
          body: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          application_id: string
          body: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          application_id?: string
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          applications_count: number
          budget_max: number
          budget_min: number
          category: string
          client_id: string
          created_at: string
          deadline: string | null
          description: string
          hired_application_id: string | null
          id: string
          skills: string[]
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          applications_count?: number
          budget_max?: number
          budget_min?: number
          category?: string
          client_id: string
          created_at?: string
          deadline?: string | null
          description?: string
          hired_application_id?: string | null
          id?: string
          skills?: string[]
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          applications_count?: number
          budget_max?: number
          budget_min?: number
          category?: string
          client_id?: string
          created_at?: string
          deadline?: string | null
          description?: string
          hired_application_id?: string | null
          id?: string
          skills?: string[]
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_system: boolean
          order_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_system?: boolean
          order_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_system?: boolean
          order_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_note: string | null
          amount: number
          brief: string
          buyer_id: string
          completed_at: string | null
          created_at: string
          delivery_note: string | null
          fee_amount: number
          id: string
          job_application_id: string | null
          kind: string
          number: number
          paid_at: string | null
          payment_note: string | null
          payment_proof_path: string | null
          product_id: string | null
          seller_id: string
          service_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          amount?: number
          brief?: string
          buyer_id: string
          completed_at?: string | null
          created_at?: string
          delivery_note?: string | null
          fee_amount?: number
          id?: string
          job_application_id?: string | null
          kind: string
          number?: never
          paid_at?: string | null
          payment_note?: string | null
          payment_proof_path?: string | null
          product_id?: string | null
          seller_id: string
          service_id?: string | null
          status: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          brief?: string
          buyer_id?: string
          completed_at?: string | null
          created_at?: string
          delivery_note?: string | null
          fee_amount?: number
          id?: string
          job_application_id?: string | null
          kind?: string
          number?: never
          paid_at?: string | null
          payment_note?: string | null
          payment_proof_path?: string | null
          product_id?: string | null
          seller_id?: string
          service_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_job_application_id_fkey"
            columns: ["job_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          id: number
          midtrans_order_id: string | null
          raw: Json | null
          result: string | null
          transaction_status: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          midtrans_order_id?: string | null
          raw?: Json | null
          result?: string | null
          transaction_status?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          midtrans_order_id?: string | null
          raw?: Json | null
          result?: string | null
          transaction_status?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          bank: string | null
          created_at: string
          expires_at: string | null
          gross_amount: number
          id: string
          method: string
          midtrans_order_id: string
          mode: string
          needs_refund: boolean
          order_id: string
          paid_at: string | null
          payment_type: string | null
          qr_url: string | null
          raw: Json | null
          status: string
          updated_at: string
          va_number: string | null
        }
        Insert: {
          bank?: string | null
          created_at?: string
          expires_at?: string | null
          gross_amount: number
          id?: string
          method: string
          midtrans_order_id: string
          mode?: string
          needs_refund?: boolean
          order_id: string
          paid_at?: string | null
          payment_type?: string | null
          qr_url?: string | null
          raw?: Json | null
          status?: string
          updated_at?: string
          va_number?: string | null
        }
        Update: {
          bank?: string | null
          created_at?: string
          expires_at?: string | null
          gross_amount?: number
          id?: string
          method?: string
          midtrans_order_id?: string
          mode?: string
          needs_refund?: boolean
          order_id?: string
          paid_at?: string | null
          payment_type?: string | null
          qr_url?: string | null
          raw?: Json | null
          status?: string
          updated_at?: string
          va_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          account_name: string
          account_number: string
          admin_note: string | null
          amount: number
          bank_name: string
          created_at: string
          developer_id: string
          id: string
          processed_at: string | null
          status: string
        }
        Insert: {
          account_name: string
          account_number: string
          admin_note?: string | null
          amount: number
          bank_name: string
          created_at?: string
          developer_id: string
          id?: string
          processed_at?: string | null
          status?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          admin_note?: string | null
          amount?: number
          bank_name?: string
          created_at?: string
          developer_id?: string
          id?: string
          processed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_secrets: {
        Row: {
          firebase_client_email: string | null
          firebase_config: Json | null
          firebase_enabled: boolean
          firebase_project_id: string | null
          firebase_service_account_ciphertext: string | null
          github_client_id: string | null
          github_client_secret_ciphertext: string | null
          id: number
          midtrans_enabled: boolean
          midtrans_methods: string[]
          midtrans_mode: string
          midtrans_production_client_key: string | null
          midtrans_production_server_key_ciphertext: string | null
          midtrans_sandbox_client_key: string | null
          midtrans_sandbox_server_key_ciphertext: string | null
          updated_at: string
        }
        Insert: {
          firebase_client_email?: string | null
          firebase_config?: Json | null
          firebase_enabled?: boolean
          firebase_project_id?: string | null
          firebase_service_account_ciphertext?: string | null
          github_client_id?: string | null
          github_client_secret_ciphertext?: string | null
          id?: number
          midtrans_enabled?: boolean
          midtrans_methods?: string[]
          midtrans_mode?: string
          midtrans_production_client_key?: string | null
          midtrans_production_server_key_ciphertext?: string | null
          midtrans_sandbox_client_key?: string | null
          midtrans_sandbox_server_key_ciphertext?: string | null
          updated_at?: string
        }
        Update: {
          firebase_client_email?: string | null
          firebase_config?: Json | null
          firebase_enabled?: boolean
          firebase_project_id?: string | null
          firebase_service_account_ciphertext?: string | null
          github_client_id?: string | null
          github_client_secret_ciphertext?: string | null
          id?: number
          midtrans_enabled?: boolean
          midtrans_methods?: string[]
          midtrans_mode?: string
          midtrans_production_client_key?: string | null
          midtrans_production_server_key_ciphertext?: string | null
          midtrans_sandbox_client_key?: string | null
          midtrans_sandbox_server_key_ciphertext?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      portfolio_items: {
        Row: {
          created_at: string
          description: string
          id: string
          image_url: string | null
          link_url: string | null
          owner_id: string
          position: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          link_url?: string | null
          owner_id: string
          position?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          link_url?: string | null
          owner_id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      products: {
        Row: {
          category: string
          cover_url: string | null
          created_at: string
          demo_url: string | null
          description: string
          download_count: number
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          is_published: boolean
          owner_id: string
          price: number
          summary: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          cover_url?: string | null
          created_at?: string
          demo_url?: string | null
          description?: string
          download_count?: number
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_published?: boolean
          owner_id: string
          price?: number
          summary?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          cover_url?: string | null
          created_at?: string
          demo_url?: string | null
          description?: string
          download_count?: number
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_published?: boolean
          owner_id?: string
          price?: number
          summary?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          is_verified: boolean
          links: Json
          location: string | null
          skills: string[]
          username: string
          verified_at: string | null
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
          is_verified?: boolean
          links?: Json
          location?: string | null
          skills?: string[]
          username: string
          verified_at?: string | null
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
          is_verified?: boolean
          links?: Json
          location?: string | null
          skills?: string[]
          username?: string
          verified_at?: string | null
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
      server_proof: {
        Row: {
          id: number
          proof_hash: string
          updated_at: string
        }
        Insert: {
          id?: number
          proof_hash: string
          updated_at?: string
        }
        Update: {
          id?: number
          proof_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          category: string
          cover_url: string | null
          created_at: string
          delivery_days: number
          description: string
          id: string
          is_active: boolean
          owner_id: string
          price_from: number
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          cover_url?: string | null
          created_at?: string
          delivery_days?: number
          description?: string
          id?: string
          is_active?: boolean
          owner_id: string
          price_from?: number
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          cover_url?: string | null
          created_at?: string
          delivery_days?: number
          description?: string
          id?: string
          is_active?: boolean
          owner_id?: string
          price_from?: number
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_owner_id_fkey"
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
      stores: {
        Row: {
          html: string
          owner_id: string
          title: string
          updated_at: string
          use_custom: boolean
        }
        Insert: {
          html?: string
          owner_id: string
          title?: string
          updated_at?: string
          use_custom?: boolean
        }
        Update: {
          html?: string
          owner_id?: string
          title?: string
          updated_at?: string
          use_custom?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "stores_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_bans: {
        Row: {
          banned_by: string | null
          created_at: string
          reason: string
          user_id: string
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          reason?: string
          user_id: string
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      user_role_prefs: {
        Row: {
          active_role: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_role?: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_role?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      verification_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          message: string
          proof_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          message?: string
          proof_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          message?: string
          proof_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _audit: {
        Args: {
          _action: string
          _note: string
          _target_id: string
          _target_type: string
        }
        Returns: undefined
      }
      _is_admin: { Args: never; Returns: boolean }
      _require_server_proof: { Args: never; Returns: undefined }
      admin_clear_refund_flag: {
        Args: { _note?: string; _payment_id: string }
        Returns: undefined
      }
      admin_log_event: {
        Args: {
          _action: string
          _note: string
          _target_id: string
          _target_type: string
        }
        Returns: undefined
      }
      admin_register_server_proof: {
        Args: { _hash: string }
        Returns: undefined
      }
      admin_release_escrow: {
        Args: { _note?: string; _order_id: string }
        Returns: undefined
      }
      admin_review_verification: {
        Args: { _approve: boolean; _note?: string; _request: string }
        Returns: undefined
      }
      admin_set_admin: {
        Args: { _admin: boolean; _user: string }
        Returns: undefined
      }
      admin_set_ban: {
        Args: { _banned: boolean; _reason?: string; _user: string }
        Returns: undefined
      }
      admin_set_escrow: {
        Args: { _action: string; _note?: string; _order_id: string }
        Returns: undefined
      }
      admin_set_verified: {
        Args: { _user: string; _verified: boolean }
        Returns: undefined
      }
      buy_product: { Args: { _product_id: string }; Returns: string }
      can_access_order: { Args: { _order_id: string }; Returns: boolean }
      can_download_product: { Args: { _product_id: string }; Returns: boolean }
      can_download_product_path: { Args: { _path: string }; Returns: boolean }
      can_read_repo: { Args: { rid: string }; Returns: boolean }
      can_write_repo: { Args: { rid: string }; Returns: boolean }
      cancel_order: { Args: { _order_id: string }; Returns: undefined }
      cancel_verification_request: {
        Args: { _request: string }
        Returns: undefined
      }
      claim_admin_role: { Args: { _code: string }; Returns: undefined }
      complete_order: { Args: { _order_id: string }; Returns: undefined }
      count_hosted_view: { Args: { _slug: string }; Returns: undefined }
      create_order_from_application: {
        Args: { _application_id: string }
        Returns: string
      }
      deliver_order: {
        Args: { _note: string; _order_id: string }
        Returns: undefined
      }
      developer_balance: {
        Args: { _user_id: string }
        Returns: {
          available: number
          earned: number
          on_hold: number
          paid_out: number
          pending: number
        }[]
      }
      developer_wallet: {
        Args: { _user_id: string }
        Returns: {
          available: number
          awaiting_admin: number
          frozen: number
          on_hold: number
          paid_out: number
          requested: number
        }[]
      }
      dm_get_or_create: { Args: { _other: string }; Returns: string }
      dm_inbox: {
        Args: never
        Returns: {
          avatar_url: string
          conversation_id: string
          display_name: string
          last_at: string
          last_body: string
          last_sender: string
          other_id: string
          unread: number
          username: string
        }[]
      }
      dm_unread_count: { Args: never; Returns: number }
      ensure_my_profile: { Args: never; Returns: undefined }
      feature_allowed: { Args: { _key: string }; Returns: boolean }
      feature_enabled: { Args: { _key: string }; Returns: boolean }
      feed_create_poll: {
        Args: { _body: string; _hours: number; _options: string[] }
        Returns: string
      }
      feed_poll_options_ok: { Args: { o: string[] }; Returns: boolean }
      feed_poll_results: {
        Args: { _post_ids: string[] }
        Returns: {
          option_idx: number
          post_id: string
          votes: number
        }[]
      }
      feed_ranked: {
        Args: {
          _hours?: number
          _limit?: number
          _offset?: number
          _personal?: boolean
        }
        Returns: {
          post_id: string
          score: number
        }[]
      }
      feed_search_tags: {
        Args: { _limit?: number; _q: string }
        Returns: {
          posts: number
          tag: string
        }[]
      }
      feed_trending_tags: {
        Args: { _hours?: number; _limit?: number }
        Returns: {
          authors: number
          posts: number
          tag: string
        }[]
      }
      handle_new_user_row: { Args: { u: unknown }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_application_participant: {
        Args: { _application_id: string }
        Returns: boolean
      }
      is_banned: { Args: { _user: string }; Returns: boolean }
      is_client: { Args: { _user_id: string }; Returns: boolean }
      is_developer: { Args: { _user_id: string }; Returns: boolean }
      is_dm_member: { Args: { _conv: string; _uid: string }; Returns: boolean }
      issue_repo: { Args: { _issue_id: string }; Returns: string }
      job_is_open: { Args: { _job_id: string }; Returns: boolean }
      job_owner: { Args: { _job_id: string }; Returns: string }
      midtrans_apply_notification: {
        Args: {
          _fraud_status: string
          _gross_amount: number
          _midtrans_order_id: string
          _payment_type: string
          _raw: Json
          _transaction_status: string
        }
        Returns: string
      }
      midtrans_record_charge: {
        Args: {
          _amount: number
          _bank: string
          _buyer_id: string
          _expires: string
          _method: string
          _midtrans_order_id: string
          _mode: string
          _order_id: string
          _qr: string
          _raw: Json
          _va: string
        }
        Returns: Json
      }
      order_log: {
        Args: { _body: string; _order_id: string }
        Returns: undefined
      }
      platform_fee: { Args: { _amount: number }; Returns: number }
      pr_repo: { Args: { _pr_id: string }; Returns: string }
      process_payout: {
        Args: { _approve: boolean; _note: string; _payout_id: string }
        Returns: undefined
      }
      record_download: { Args: { _product_id: string }; Returns: undefined }
      request_payout: {
        Args: {
          _account_name: string
          _account_number: string
          _amount: number
          _bank_name: string
        }
        Returns: string
      }
      request_revision: { Args: { _order_id: string }; Returns: undefined }
      request_service: {
        Args: { _brief: string; _budget: number; _service_id: string }
        Returns: string
      }
      request_verification: {
        Args: { _message: string; _proof_url?: string }
        Returns: string
      }
      request_wallet_payout: {
        Args: {
          _account_name: string
          _account_number: string
          _amount: number
          _bank_name: string
        }
        Returns: string
      }
      respond_job_application: {
        Args: { _accept: boolean; _application_id: string }
        Returns: undefined
      }
      respond_service_order: {
        Args: { _accept: boolean; _amount: number; _order_id: string }
        Returns: undefined
      }
      review_payment: {
        Args: { _approve: boolean; _note: string; _order_id: string }
        Returns: undefined
      }
      server_proof_ok: { Args: never; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_payment: {
        Args: { _note: string; _order_id: string; _proof_path: string }
        Returns: undefined
      }
      withdraw_job_application: {
        Args: { _application_id: string }
        Returns: undefined
      }
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
