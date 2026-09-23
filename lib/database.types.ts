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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _monitor_heartbeat: {
        Row: {
          job_name: string
          last_run: string
        }
        Insert: {
          job_name: string
          last_run: string
        }
        Update: {
          job_name?: string
          last_run?: string
        }
        Relationships: []
      }
      _monitor_net_fail_snapshot: {
        Row: {
          captured_at: string
          fail_count: number
        }
        Insert: {
          captured_at?: string
          fail_count: number
        }
        Update: {
          captured_at?: string
          fail_count?: number
        }
        Relationships: []
      }
      _monitor_stmt_snapshot: {
        Row: {
          captured_at: string | null
          total_timeout_calls: number | null
        }
        Insert: {
          captured_at?: string | null
          total_timeout_calls?: number | null
        }
        Update: {
          captured_at?: string | null
          total_timeout_calls?: number | null
        }
        Relationships: []
      }
      _monitor_watchdog_state: {
        Row: {
          alerted_at: string | null
          id: boolean
        }
        Insert: {
          alerted_at?: string | null
          id?: boolean
        }
        Update: {
          alerted_at?: string | null
          id?: boolean
        }
        Relationships: []
      }
      accounting_books: {
        Row: {
          amount: number
          created_at: string
          id: string
          organization_id: string
          reference_msg_id: string
          trip_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          organization_id: string
          reference_msg_id: string
          trip_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          organization_id?: string
          reference_msg_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_books_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_reference_msg_id_fkey"
            columns: ["reference_msg_id"]
            isOneToOne: true
            referencedRelation: "trip_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_reference_msg_id_fkey"
            columns: ["reference_msg_id"]
            isOneToOne: true
            referencedRelation: "trip_messages_archive_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      activity_stream: {
        Row: {
          activity_type: string
          actor_id: string
          actor_name: string | null
          actor_type: string
          context_payload: Json
          created_at: string
          id: string
          is_public: boolean
          org_id: string | null
          target_id: string
          target_name: string | null
          target_ref: string | null
          target_type: string
        }
        Insert: {
          activity_type: string
          actor_id: string
          actor_name?: string | null
          actor_type: string
          context_payload?: Json
          created_at?: string
          id?: string
          is_public?: boolean
          org_id?: string | null
          target_id: string
          target_name?: string | null
          target_ref?: string | null
          target_type: string
        }
        Update: {
          activity_type?: string
          actor_id?: string
          actor_name?: string | null
          actor_type?: string
          context_payload?: Json
          created_at?: string
          id?: string
          is_public?: boolean
          org_id?: string | null
          target_id?: string
          target_name?: string | null
          target_ref?: string | null
          target_type?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          auto_assign_vehicle: boolean
          auto_enforce_credit: boolean
          auto_flag_risk: boolean
          auto_post_ocr: boolean
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          auto_assign_vehicle?: boolean
          auto_enforce_credit?: boolean
          auto_flag_risk?: boolean
          auto_post_ocr?: boolean
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          auto_assign_vehicle?: boolean
          auto_enforce_credit?: boolean
          auto_flag_risk?: boolean
          auto_post_ocr?: boolean
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      b2b_operations_dismissals: {
        Row: {
          alert_key: string
          dismissed_at: string
          organization_id: string
        }
        Insert: {
          alert_key: string
          dismissed_at?: string
          organization_id: string
        }
        Update: {
          alert_key?: string
          dismissed_at?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_operations_dismissals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_operations_dismissals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bids: {
        Row: {
          amount: number
          bidder_organization_id: string
          bidder_user_id: string
          created_at: string
          id: string
          note: string | null
          post_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          bidder_organization_id: string
          bidder_user_id: string
          created_at?: string
          id?: string
          note?: string | null
          post_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bidder_organization_id?: string
          bidder_user_id?: string
          created_at?: string
          id?: string
          note?: string | null
          post_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bids_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_ref_backfill_log: {
        Row: {
          migrated_at: string
          new_ref: string
          old_ref: string
          trip_id: string | null
        }
        Insert: {
          migrated_at?: string
          new_ref: string
          old_ref: string
          trip_id?: string | null
        }
        Update: {
          migrated_at?: string
          new_ref?: string
          old_ref?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_ref_backfill_log_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_ref_backfill_log_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_ref_backfill_log_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_ref_backfill_log_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_ref_backfill_log_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_ref_backfill_log_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      branding_settings: {
        Row: {
          company_name: string | null
          id: string
          logo_url: string | null
          org_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          id?: string
          logo_url?: string | null
          org_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          id?: string
          logo_url?: string | null
          org_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branding_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branding_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_forecast: {
        Row: {
          confidence: number
          created_at: string
          date: string
          expected_inflow: number
          id: string
          organization_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          date: string
          expected_inflow?: number
          id?: string
          organization_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          date?: string
          expected_inflow?: number
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_forecast_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_forecast_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_attachments: {
        Row: {
          created_at: string
          id: string
          message_id: string
          metadata: Json
          mime_type: string | null
          size_bytes: number | null
          storage_bucket: string
          storage_path: string
          upload_status: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          metadata?: Json
          mime_type?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path: string
          upload_status?: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          metadata?: Json
          mime_type?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path?: string
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          conversation_id: string | null
          created_at: string
          id: number
          message_id: string | null
          organization_id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: never
          message_id?: string | null
          organization_id: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: never
          message_id?: string | null
          organization_id?: string
          payload?: Json
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          channel_key?: string | null
          client_id?: string | null
          conversation_type: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          legacy_network_conversation_id?: string | null
          legacy_trip_conversation_id?: string | null
          message_count?: number
          metadata?: Json
          organization_id: string
          supplier_id?: string | null
          title?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          channel_key?: string | null
          client_id?: string | null
          conversation_type?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          legacy_network_conversation_id?: string | null
          legacy_trip_conversation_id?: string | null
          message_count?: number
          metadata?: Json
          organization_id?: string
          supplier_id?: string | null
          title?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "chat_conversations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "chat_conversations_legacy_network_conversation_id_fkey"
            columns: ["legacy_network_conversation_id"]
            isOneToOne: true
            referencedRelation: "network_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_legacy_trip_conversation_id_fkey"
            columns: ["legacy_trip_conversation_id"]
            isOneToOne: true
            referencedRelation: "trip_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      chat_mentions: {
        Row: {
          created_at: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          client_message_id: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          legacy_source: string | null
          message_type: string
          metadata: Json
          organization_id: string
          reply_to_id: string | null
          sender_name: string
          sender_role: string | null
          sender_type: string
          sender_user_id: string | null
        }
        Insert: {
          client_message_id?: string | null
          content?: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          legacy_source?: string | null
          message_type?: string
          metadata?: Json
          organization_id: string
          reply_to_id?: string | null
          sender_name?: string
          sender_role?: string | null
          sender_type?: string
          sender_user_id?: string | null
        }
        Update: {
          client_message_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          legacy_source?: string | null
          message_type?: string
          metadata?: Json
          organization_id?: string
          reply_to_id?: string | null
          sender_name?: string
          sender_role?: string | null
          sender_type?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages_archive: {
        Row: {
          archived_at: string
          client_message_id: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          legacy_source: string | null
          message_type: string
          metadata: Json
          organization_id: string
          reply_to_id: string | null
          sender_name: string
          sender_role: string | null
          sender_type: string
          sender_user_id: string | null
        }
        Insert: {
          archived_at?: string
          client_message_id?: string | null
          content?: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          legacy_source?: string | null
          message_type?: string
          metadata?: Json
          organization_id: string
          reply_to_id?: string | null
          sender_name?: string
          sender_role?: string | null
          sender_type?: string
          sender_user_id?: string | null
        }
        Update: {
          archived_at?: string
          client_message_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          legacy_source?: string | null
          message_type?: string
          metadata?: Json
          organization_id?: string
          reply_to_id?: string | null
          sender_name?: string
          sender_role?: string | null
          sender_type?: string
          sender_user_id?: string | null
        }
        Relationships: []
      }
      chat_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          muted_until: string | null
          participant_role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          muted_until?: string | null
          participant_role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          muted_until?: string | null
          participant_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_pins: {
        Row: {
          conversation_id: string
          message_id: string
          pinned_at: string
          pinned_by: string | null
        }
        Insert: {
          conversation_id: string
          message_id: string
          pinned_at?: string
          pinned_by?: string | null
        }
        Update: {
          conversation_id?: string
          message_id?: string
          pinned_at?: string
          pinned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_pins_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_push_outbox: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: number
          message_id: string
          organization_id: string
          payload: Json
          sent_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          conversation_id: string
          created_at?: string
          id?: never
          message_id: string
          organization_id: string
          payload?: Json
          sent_at?: string | null
          title?: string
          user_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: never
          message_id?: string
          organization_id?: string
          payload?: Json
          sent_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_push_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_push_outbox_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_read_receipts: {
        Row: {
          delivered_at: string | null
          message_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          delivered_at?: string | null
          message_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          delivered_at?: string | null
          message_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_read_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          client_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          client_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          client_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_audit_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          designation: string | null
          email: string | null
          id: string
          is_billing: boolean
          is_decision_maker: boolean
          is_dispatch: boolean
          is_finance: boolean
          is_operations: boolean
          is_primary: boolean
          is_procurement: boolean
          mobile: string | null
          name: string
          notes: string | null
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_billing?: boolean
          is_decision_maker?: boolean
          is_dispatch?: boolean
          is_finance?: boolean
          is_operations?: boolean
          is_primary?: boolean
          is_procurement?: boolean
          mobile?: string | null
          name: string
          notes?: string | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_billing?: boolean
          is_decision_maker?: boolean
          is_dispatch?: boolean
          is_finance?: boolean
          is_operations?: boolean
          is_primary?: boolean
          is_procurement?: boolean
          mobile?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_agreements: {
        Row: {
          claims_terms: Json | null
          client_id: string
          commercial_model: string | null
          contract_number: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          detention_terms: Json | null
          effective_date: string | null
          escalation_matrix: Json | null
          expiry_date: string | null
          general_terms: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_terms: Json | null
          penalty_clauses: Json | null
          renewal_date: string | null
          signed_storage_path: string | null
          status: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          claims_terms?: Json | null
          client_id: string
          commercial_model?: string | null
          contract_number: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          detention_terms?: Json | null
          effective_date?: string | null
          escalation_matrix?: Json | null
          expiry_date?: string | null
          general_terms?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_terms?: Json | null
          penalty_clauses?: Json | null
          renewal_date?: string | null
          signed_storage_path?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          claims_terms?: Json | null
          client_id?: string
          commercial_model?: string | null
          contract_number?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          detention_terms?: Json | null
          effective_date?: string | null
          escalation_matrix?: Json | null
          expiry_date?: string | null
          general_terms?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_terms?: Json | null
          penalty_clauses?: Json | null
          renewal_date?: string | null
          signed_storage_path?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_versions: {
        Row: {
          agreement_id: string
          created_at: string
          effective_date: string | null
          file_name: string | null
          id: string
          notes: string | null
          organization_id: string
          storage_path: string
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          agreement_id: string
          created_at?: string
          effective_date?: string | null
          file_name?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          storage_path: string
          uploaded_by?: string | null
          version_number?: number
        }
        Update: {
          agreement_id?: string
          created_at?: string
          effective_date?: string | null
          file_name?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          storage_path?: string
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_versions_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "client_contract_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contracts: {
        Row: {
          billing_to_hq: boolean | null
          client_id: string
          created_at: string
          deleted_at: string | null
          drop_location: string
          id: string
          notes: string | null
          organization_id: string
          pickup_area: string
          rate: number | null
          rate_type: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          warehouse_id: string | null
        }
        Insert: {
          billing_to_hq?: boolean | null
          client_id: string
          created_at?: string
          deleted_at?: string | null
          drop_location: string
          id?: string
          notes?: string | null
          organization_id: string
          pickup_area: string
          rate?: number | null
          rate_type?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          warehouse_id?: string | null
        }
        Update: {
          billing_to_hq?: boolean | null
          client_id?: string
          created_at?: string
          deleted_at?: string | null
          drop_location?: string
          id?: string
          notes?: string | null
          organization_id?: string
          pickup_area?: string
          rate?: number | null
          rate_type?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          doc_type: string | null
          expiry_date: string | null
          file_name: string | null
          folder: string | null
          id: string
          mime_type: string | null
          notes: string | null
          organization_id: string
          storage_path: string | null
          title: string
          updated_at: string
          updated_by: string | null
          version_number: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_type?: string | null
          expiry_date?: string | null
          file_name?: string | null
          folder?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          organization_id: string
          storage_path?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          version_number?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_type?: string | null
          expiry_date?: string | null
          file_name?: string | null
          folder?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          organization_id?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_finance_profiles: {
        Row: {
          aging_0_30: number | null
          aging_31_60: number | null
          aging_61_90: number | null
          aging_90_plus: number | null
          billing_cycle: string | null
          client_id: string
          created_at: string
          created_by: string | null
          credit_days: number | null
          credit_limit: number | null
          dso_target_days: number | null
          id: string
          invoice_frequency: string | null
          notes: string | null
          opening_balance: number | null
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aging_0_30?: number | null
          aging_31_60?: number | null
          aging_61_90?: number | null
          aging_90_plus?: number | null
          billing_cycle?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          dso_target_days?: number | null
          id?: string
          invoice_frequency?: string | null
          notes?: string | null
          opening_balance?: number | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aging_0_30?: number | null
          aging_31_60?: number | null
          aging_61_90?: number | null
          aging_90_plus?: number | null
          billing_cycle?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          dso_target_days?: number | null
          id?: string
          invoice_frequency?: string | null
          notes?: string | null
          opening_balance?: number | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_finance_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_finance_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_finance_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_kyc_documents: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          doc_label: string | null
          doc_type: string
          expiry_date: string | null
          file_name: string | null
          id: string
          is_mandatory: boolean
          mime_type: string | null
          notes: string | null
          organization_id: string
          status: string | null
          storage_path: string | null
          updated_at: string
          updated_by: string | null
          verified_at: string | null
          verified_by: string | null
          version_number: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_label?: string | null
          doc_type: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          notes?: string | null
          organization_id: string
          status?: string | null
          storage_path?: string | null
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version_number?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_label?: string | null
          doc_type?: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          notes?: string | null
          organization_id?: string
          status?: string | null
          storage_path?: string | null
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_kyc_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_kyc_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_kyc_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_lane_rates: {
        Row: {
          agreement_id: string | null
          base_rate: number | null
          client_id: string
          created_at: string
          created_by: string | null
          default_load_tons: number | null
          default_load_type: string | null
          deleted_at: string | null
          destination_address: string | null
          destination_gstin: string | null
          destination_label: string
          destination_warehouse_id: string | null
          detention_included: boolean | null
          distance_km: number | null
          fuel_clause: string | null
          id: string
          is_spot_rate: boolean
          min_billing: number | null
          notes: string | null
          organization_id: string
          origin_label: string
          origin_warehouse_id: string | null
          per_km_rate: number | null
          per_mt_rate: number | null
          pricing_model: string | null
          rate: number | null
          rate_type: string | null
          toll_included: boolean | null
          updated_at: string
          updated_by: string | null
          valid_from: string | null
          valid_to: string | null
          vehicle_type: string | null
          warehouse_zone: string | null
        }
        Insert: {
          agreement_id?: string | null
          base_rate?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          default_load_tons?: number | null
          default_load_type?: string | null
          deleted_at?: string | null
          destination_address?: string | null
          destination_gstin?: string | null
          destination_label: string
          destination_warehouse_id?: string | null
          detention_included?: boolean | null
          distance_km?: number | null
          fuel_clause?: string | null
          id?: string
          is_spot_rate?: boolean
          min_billing?: number | null
          notes?: string | null
          organization_id: string
          origin_label: string
          origin_warehouse_id?: string | null
          per_km_rate?: number | null
          per_mt_rate?: number | null
          pricing_model?: string | null
          rate?: number | null
          rate_type?: string | null
          toll_included?: boolean | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vehicle_type?: string | null
          warehouse_zone?: string | null
        }
        Update: {
          agreement_id?: string | null
          base_rate?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          default_load_tons?: number | null
          default_load_type?: string | null
          deleted_at?: string | null
          destination_address?: string | null
          destination_gstin?: string | null
          destination_label?: string
          destination_warehouse_id?: string | null
          detention_included?: boolean | null
          distance_km?: number | null
          fuel_clause?: string | null
          id?: string
          is_spot_rate?: boolean
          min_billing?: number | null
          notes?: string | null
          organization_id?: string
          origin_label?: string
          origin_warehouse_id?: string | null
          per_km_rate?: number | null
          per_mt_rate?: number | null
          pricing_model?: string | null
          rate?: number | null
          rate_type?: string | null
          toll_included?: boolean | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vehicle_type?: string | null
          warehouse_zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_lane_rates_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "client_contract_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_lane_rates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_lane_rates_destination_warehouse_id_fkey"
            columns: ["destination_warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_lane_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_lane_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_lane_rates_origin_warehouse_id_fkey"
            columns: ["origin_warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      client_risk_scores: {
        Row: {
          client_id: string
          id: string
          last_updated: string
          organization_id: string
          predicted_delay: number
          risk_score: number
        }
        Insert: {
          client_id: string
          id?: string
          last_updated?: string
          organization_id: string
          predicted_delay?: number
          risk_score?: number
        }
        Update: {
          client_id?: string
          id?: string
          last_updated?: string
          organization_id?: string
          predicted_delay?: number
          risk_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_risk_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_risk_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_warehouses: {
        Row: {
          address: string | null
          billing_address: string | null
          capacity_tons: number | null
          city: string | null
          client_id: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dock_count: number | null
          handling_equipment: string | null
          id: string
          latitude: number | null
          loading_type: string | null
          local_gstin: string | null
          longitude: number | null
          manager_name: string | null
          manager_phone: string | null
          name: string
          operating_hours: string | null
          ops_contact: string | null
          organization_id: string
          pincode: string | null
          security_contact: string | null
          state: string | null
          unloading_type: string | null
          updated_at: string
          updated_by: string | null
          warehouse_code: string | null
          warehouse_zone: string | null
        }
        Insert: {
          address?: string | null
          billing_address?: string | null
          capacity_tons?: number | null
          city?: string | null
          client_id: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dock_count?: number | null
          handling_equipment?: string | null
          id?: string
          latitude?: number | null
          loading_type?: string | null
          local_gstin?: string | null
          longitude?: number | null
          manager_name?: string | null
          manager_phone?: string | null
          name: string
          operating_hours?: string | null
          ops_contact?: string | null
          organization_id: string
          pincode?: string | null
          security_contact?: string | null
          state?: string | null
          unloading_type?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_code?: string | null
          warehouse_zone?: string | null
        }
        Update: {
          address?: string | null
          billing_address?: string | null
          capacity_tons?: number | null
          city?: string | null
          client_id?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dock_count?: number | null
          handling_equipment?: string | null
          id?: string
          latitude?: number | null
          loading_type?: string | null
          local_gstin?: string | null
          longitude?: number | null
          manager_name?: string | null
          manager_phone?: string | null
          name?: string
          operating_hours?: string | null
          ops_contact?: string | null
          organization_id?: string
          pincode?: string | null
          security_contact?: string | null
          state?: string | null
          unloading_type?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_code?: string | null
          warehouse_zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_warehouses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          annual_revenue: number | null
          avatar_seed: string | null
          avatar_url: string | null
          billing_address: string | null
          billing_contact_email: string | null
          billing_contact_name: string | null
          billing_contact_phone: string | null
          cin: string | null
          client_code: string | null
          client_status: string | null
          commodity_types: string[] | null
          contact_percent: string | null
          contact_person: string | null
          corporate_address: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          display_id: string | null
          email: string | null
          expected_monthly_loads: number | null
          gstin: string | null
          hq_address: string | null
          id: string
          iec_number: string | null
          industry: string | null
          invoice_frequency_label: string | null
          invoice_pod_policy: string | null
          is_integrated: boolean | null
          kam_email: string | null
          kam_name: string | null
          kam_phone: string | null
          legal_name: string | null
          linked_organization_id: string | null
          msme_number: string | null
          name: string
          notes: string | null
          operating_regions: string[] | null
          organization_id: string
          owner_full_name: string | null
          pan_number: string | null
          payment_terms_label: string | null
          phone: string
          potential_volume: number | null
          projected_contract_revenue: number | null
          registered_address: string | null
          state: string | null
          status: string
          tan_number: string | null
          trade_name: string | null
          updated_at: string | null
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          annual_revenue?: number | null
          avatar_seed?: string | null
          avatar_url?: string | null
          billing_address?: string | null
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          cin?: string | null
          client_code?: string | null
          client_status?: string | null
          commodity_types?: string[] | null
          contact_percent?: string | null
          contact_person?: string | null
          corporate_address?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          display_id?: string | null
          email?: string | null
          expected_monthly_loads?: number | null
          gstin?: string | null
          hq_address?: string | null
          id?: string
          iec_number?: string | null
          industry?: string | null
          invoice_frequency_label?: string | null
          invoice_pod_policy?: string | null
          is_integrated?: boolean | null
          kam_email?: string | null
          kam_name?: string | null
          kam_phone?: string | null
          legal_name?: string | null
          linked_organization_id?: string | null
          msme_number?: string | null
          name: string
          notes?: string | null
          operating_regions?: string[] | null
          organization_id: string
          owner_full_name?: string | null
          pan_number?: string | null
          payment_terms_label?: string | null
          phone: string
          potential_volume?: number | null
          projected_contract_revenue?: number | null
          registered_address?: string | null
          state?: string | null
          status?: string
          tan_number?: string | null
          trade_name?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          annual_revenue?: number | null
          avatar_seed?: string | null
          avatar_url?: string | null
          billing_address?: string | null
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          cin?: string | null
          client_code?: string | null
          client_status?: string | null
          commodity_types?: string[] | null
          contact_percent?: string | null
          contact_person?: string | null
          corporate_address?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          display_id?: string | null
          email?: string | null
          expected_monthly_loads?: number | null
          gstin?: string | null
          hq_address?: string | null
          id?: string
          iec_number?: string | null
          industry?: string | null
          invoice_frequency_label?: string | null
          invoice_pod_policy?: string | null
          is_integrated?: boolean | null
          kam_email?: string | null
          kam_name?: string | null
          kam_phone?: string | null
          legal_name?: string | null
          linked_organization_id?: string | null
          msme_number?: string | null
          name?: string
          notes?: string | null
          operating_regions?: string[] | null
          organization_id?: string
          owner_full_name?: string | null
          pan_number?: string | null
          payment_terms_label?: string | null
          phone?: string
          potential_volume?: number | null
          projected_contract_revenue?: number | null
          registered_address?: string | null
          state?: string | null
          status?: string
          tan_number?: string | null
          trade_name?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_linked_organization_id_fkey"
            columns: ["linked_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_linked_organization_id_fkey"
            columns: ["linked_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_inventory: {
        Row: {
          available_qty: number
          created_at: string
          damaged_qty: number
          id: string
          last_adjusted_at: string
          organization_id: string
          product_id: string
          reorder_level: number
          reserved_qty: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          available_qty?: number
          created_at?: string
          damaged_qty?: number
          id?: string
          last_adjusted_at?: string
          organization_id: string
          product_id: string
          reorder_level?: number
          reserved_qty?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          available_qty?: number
          created_at?: string
          damaged_qty?: number
          id?: string
          last_adjusted_at?: string
          organization_id?: string
          product_id?: string
          reorder_level?: number
          reserved_qty?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commerce_inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_inventory_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_requests: {
        Row: {
          created_at: string | null
          from_organization_id: string
          id: string
          note: string | null
          request_carrier_supplier: boolean
          request_shipper_client: boolean
          responded_at: string | null
          responded_by: string | null
          status: string
          to_organization_id: string
        }
        Insert: {
          created_at?: string | null
          from_organization_id: string
          id?: string
          note?: string | null
          request_carrier_supplier?: boolean
          request_shipper_client?: boolean
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          to_organization_id: string
        }
        Update: {
          created_at?: string | null
          from_organization_id?: string
          id?: string
          note?: string | null
          request_carrier_supplier?: boolean
          request_shipper_client?: boolean
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          to_organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_requests_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_to_organization_id_fkey"
            columns: ["to_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_to_organization_id_fkey"
            columns: ["to_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparty_resolutions: {
        Row: {
          counterparty_name: string
          counterparty_type: string
          dismissed: boolean
          id: string
          matched_org_id: string | null
          org_id: string
          resolved_at: string
          resolved_by_user_id: string
        }
        Insert: {
          counterparty_name: string
          counterparty_type: string
          dismissed?: boolean
          id?: string
          matched_org_id?: string | null
          org_id: string
          resolved_at?: string
          resolved_by_user_id: string
        }
        Update: {
          counterparty_name?: string
          counterparty_type?: string
          dismissed?: boolean
          id?: string
          matched_org_id?: string | null
          org_id?: string
          resolved_at?: string
          resolved_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counterparty_resolutions_matched_org_id_fkey"
            columns: ["matched_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counterparty_resolutions_matched_org_id_fkey"
            columns: ["matched_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counterparty_resolutions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counterparty_resolutions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counterparty_resolutions_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dco_payees: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dco_payees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "dco_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      dco_profiles: {
        Row: {
          created_at: string
          decision_reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decision_reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decision_reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dco_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_quotes: {
        Row: {
          amount: number
          bidder_organization_id: string
          counter_amount: number | null
          created_at: string | null
          driver_id: string | null
          id: string
          indent_id: string
          notes: string | null
          status: string
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          amount: number
          bidder_organization_id: string
          counter_amount?: number | null
          created_at?: string | null
          driver_id?: string | null
          id?: string
          indent_id: string
          notes?: string | null
          status?: string
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          bidder_organization_id?: string
          counter_amount?: number | null
          created_at?: string | null
          driver_id?: string | null
          id?: string
          indent_id?: string
          notes?: string | null
          status?: string
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_quotes_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quotes_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quotes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "direct_quotes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quotes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "direct_quotes_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quotes_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quotes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute: {
        Row: {
          created_at: string | null
          evidence_url: string | null
          id: string
          internal_snapshot: number
          partner_org_id: string
          partner_snapshot: number
          proposed_amount: number | null
          raised_by_org_id: string
          raised_paid: number | null
          raised_sales: number | null
          reason_code: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          transaction_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          evidence_url?: string | null
          id?: string
          internal_snapshot?: number
          partner_org_id: string
          partner_snapshot?: number
          proposed_amount?: number | null
          raised_by_org_id: string
          raised_paid?: number | null
          raised_sales?: number | null
          reason_code?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          transaction_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          evidence_url?: string | null
          id?: string
          internal_snapshot?: number
          partner_org_id?: string
          partner_snapshot?: number
          proposed_amount?: number | null
          raised_by_org_id?: string
          raised_paid?: number | null
          raised_sales?: number | null
          reason_code?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          transaction_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_partner_org_id_fkey"
            columns: ["partner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_partner_org_id_fkey"
            columns: ["partner_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_raised_by_org_id_fkey"
            columns: ["raised_by_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_raised_by_org_id_fkey"
            columns: ["raised_by_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          document_id: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          new_status: string | null
          notes: string | null
          old_status: string | null
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          document_id?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          document_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_audit_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "entity_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_direct_bids: {
        Row: {
          amount: number
          counter_amount: number | null
          created_at: string
          driver_user_id: string
          id: string
          note: string | null
          post_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          counter_amount?: number | null
          created_at?: string
          driver_user_id: string
          id?: string
          note?: string | null
          post_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          counter_amount?: number | null
          created_at?: string
          driver_user_id?: string
          id?: string
          note?: string | null
          post_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_direct_bids_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_fleet_owner_profiles: {
        Row: {
          created_at: string
          enabled_at: string
          preferred_view: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled_at?: string
          preferred_view?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled_at?: string
          preferred_view?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_fleet_owner_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_invites: {
        Row: {
          commission_per_km: number | null
          commission_percent: number | null
          consumed_at: string | null
          created_at: string | null
          deleted_at: string | null
          driver_id: string | null
          expires_at: string | null
          from_org_name: string | null
          from_organization_id: string
          id: string
          invited_by: string | null
          invitee_name: string | null
          payable_amount: number | null
          phone_normalised: string | null
          responded_at: string | null
          responded_by: string | null
          status: string
          to_user_id: string | null
        }
        Insert: {
          commission_per_km?: number | null
          commission_percent?: number | null
          consumed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          expires_at?: string | null
          from_org_name?: string | null
          from_organization_id: string
          id?: string
          invited_by?: string | null
          invitee_name?: string | null
          payable_amount?: number | null
          phone_normalised?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          to_user_id?: string | null
        }
        Update: {
          commission_per_km?: number | null
          commission_percent?: number | null
          consumed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          expires_at?: string | null
          from_org_name?: string | null
          from_organization_id?: string
          id?: string
          invited_by?: string | null
          invitee_name?: string | null
          payable_amount?: number | null
          phone_normalised?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_invites_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_invites_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_invites_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_invites_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_invites_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_kyc_doc_requirements: {
        Row: {
          doc_type: string
          is_mandatory: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          doc_type: string
          is_mandatory?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          doc_type?: string
          is_mandatory?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      driver_kyc_documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          doc_label: string | null
          doc_type: string
          driver_user_id: string
          file_name: string | null
          file_size_bytes: number | null
          id: string
          is_mandatory: boolean
          mime_type: string | null
          rejection_notes: string | null
          status: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          doc_label?: string | null
          doc_type: string
          driver_user_id: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          rejection_notes?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          doc_label?: string | null
          doc_type?: string
          driver_user_id?: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          rejection_notes?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      driver_kyc_submission_events: {
        Row: {
          actor_id: string | null
          attempt: number
          created_at: string
          driver_user_id: string
          event: string
          id: string
          notes: string | null
        }
        Insert: {
          actor_id?: string | null
          attempt: number
          created_at?: string
          driver_user_id: string
          event: string
          id?: string
          notes?: string | null
        }
        Update: {
          actor_id?: string | null
          attempt?: number
          created_at?: string
          driver_user_id?: string
          event?: string
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      driver_kyc_submissions: {
        Row: {
          attempt_count: number
          created_at: string
          driver_user_id: string
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          driver_user_id: string
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          driver_user_id?: string
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      driver_ledger: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string | null
          created_by: string | null
          currency: string
          description: string | null
          driver_id: string
          id: string
          organization_id: string
          reference_id: string | null
          reference_type: string | null
          trip_id: string | null
          type: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          driver_id: string
          id?: string
          organization_id: string
          reference_id?: string | null
          reference_type?: string | null
          trip_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          driver_id?: string
          id?: string
          organization_id?: string
          reference_id?: string | null
          reference_type?: string | null
          trip_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_ledger_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_ledger_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          address_label: string | null
          driver_id: string
          id: string
          latitude: number
          longitude: number
          odometer_km: number | null
          organization_id: string
          recorded_at: string
          source: string
          trip_id: string | null
        }
        Insert: {
          accuracy?: number | null
          address_label?: string | null
          driver_id: string
          id?: string
          latitude: number
          longitude: number
          odometer_km?: number | null
          organization_id: string
          recorded_at?: string
          source?: string
          trip_id?: string | null
        }
        Update: {
          accuracy?: number | null
          address_label?: string | null
          driver_id?: string
          id?: string
          latitude?: number
          longitude?: number
          odometer_km?: number | null
          organization_id?: string
          recorded_at?: string
          source?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      driver_presence: {
        Row: {
          accuracy: number | null
          driver_id: string
          heading: number | null
          latitude: number
          longitude: number
          organization_id: string
          recorded_at: string
          session_id: string | null
          speed_kmh: number | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          driver_id: string
          heading?: number | null
          latitude: number
          longitude: number
          organization_id: string
          recorded_at?: string
          session_id?: string | null
          speed_kmh?: number | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          driver_id?: string
          heading?: number | null
          latitude?: number
          longitude?: number
          organization_id?: string
          recorded_at?: string
          session_id?: string | null
          speed_kmh?: number | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_presence_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_presence_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_presence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      driver_profiles: {
        Row: {
          created_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          insurance_expiry: string | null
          insurance_photo_url: string | null
          languages: string[] | null
          license_expiry: string | null
          license_number: string | null
          license_photo_url: string | null
          license_type: string | null
          preferred_areas: string[] | null
          preferred_vehicle_types: string[] | null
          updated_at: string | null
          user_id: string
          vehicle_registration: string | null
          vehicle_registration_expiry: string | null
          vehicle_registration_photo_url: string | null
          years_of_experience: number | null
        }
        Insert: {
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_photo_url?: string | null
          languages?: string[] | null
          license_expiry?: string | null
          license_number?: string | null
          license_photo_url?: string | null
          license_type?: string | null
          preferred_areas?: string[] | null
          preferred_vehicle_types?: string[] | null
          updated_at?: string | null
          user_id: string
          vehicle_registration?: string | null
          vehicle_registration_expiry?: string | null
          vehicle_registration_photo_url?: string | null
          years_of_experience?: number | null
        }
        Update: {
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_photo_url?: string | null
          languages?: string[] | null
          license_expiry?: string | null
          license_number?: string | null
          license_photo_url?: string | null
          license_type?: string | null
          preferred_areas?: string[] | null
          preferred_vehicle_types?: string[] | null
          updated_at?: string | null
          user_id?: string
          vehicle_registration?: string | null
          vehicle_registration_expiry?: string | null
          vehicle_registration_photo_url?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
      }
      driver_salary_requests: {
        Row: {
          amount: number
          cash_entry_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          driver_id: string
          id: string
          note: string | null
          organization_id: string
          request_type: string
          salary_month: string | null
          status: string
          trip_ids: string[] | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          cash_entry_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          driver_id: string
          id?: string
          note?: string | null
          organization_id: string
          request_type: string
          salary_month?: string | null
          status?: string
          trip_ids?: string[] | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          cash_entry_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          driver_id?: string
          id?: string
          note?: string | null
          organization_id?: string
          request_type?: string
          salary_month?: string | null
          status?: string
          trip_ids?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_salary_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_salary_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_salary_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_salary_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_salary_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_signup_matches: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          detected_at: string
          driver_id: string
          id: string
          matched_user_id: string
          metadata: Json
          organization_id: string
          phone_canonical: string
          source: string
          state: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          detected_at?: string
          driver_id: string
          id?: string
          matched_user_id: string
          metadata?: Json
          organization_id: string
          phone_canonical: string
          source?: string
          state?: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          detected_at?: string
          driver_id?: string
          id?: string
          matched_user_id?: string
          metadata?: Json
          organization_id?: string
          phone_canonical?: string
          source?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_signup_matches_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_signup_matches_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_signup_matches_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_signup_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_signup_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_tenures: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          joined_at: string
          left_at: string | null
          organization_id: string
          trip_count: number | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          joined_at: string
          left_at?: string | null
          organization_id: string
          trip_count?: number | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          organization_id?: string
          trip_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_tenures_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_tenures_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_tenures_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_tenures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_tenures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_trip_counters: {
        Row: {
          driver_id: string
          trip_seq: number
        }
        Insert: {
          driver_id: string
          trip_seq?: number
        }
        Update: {
          driver_id?: string
          trip_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_trip_counters_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_trip_counters_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trip_counters_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
        ]
      }
      drivers: {
        Row: {
          assigned_vehicle_id: string | null
          avatar_seed: string | null
          avatar_url: string | null
          commission_per_km: number | null
          commission_percent: number | null
          created_at: string | null
          deleted_at: string | null
          driver_code: string | null
          email: string | null
          emergency_contact: string | null
          emergency_name: string | null
          hired_at: string
          id: string
          left_at: string | null
          license_number: string | null
          name: string
          organization_id: string
          payable_amount: number | null
          phone: string | null
          phone_normalised: string | null
          relationship_origin: string | null
          relationship_status: string | null
          status: string
          tracking_only: boolean
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_vehicle_id?: string | null
          avatar_seed?: string | null
          avatar_url?: string | null
          commission_per_km?: number | null
          commission_percent?: number | null
          created_at?: string | null
          deleted_at?: string | null
          driver_code?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_name?: string | null
          hired_at?: string
          id?: string
          left_at?: string | null
          license_number?: string | null
          name: string
          organization_id: string
          payable_amount?: number | null
          phone?: string | null
          phone_normalised?: string | null
          relationship_origin?: string | null
          relationship_status?: string | null
          status?: string
          tracking_only?: boolean
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_vehicle_id?: string | null
          avatar_seed?: string | null
          avatar_url?: string | null
          commission_per_km?: number | null
          commission_percent?: number | null
          created_at?: string | null
          deleted_at?: string | null
          driver_code?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_name?: string | null
          hired_at?: string
          id?: string
          left_at?: string | null
          license_number?: string | null
          name?: string
          organization_id?: string
          payable_amount?: number | null
          phone?: string | null
          phone_normalised?: string | null
          relationship_origin?: string | null
          relationship_status?: string | null
          status?: string
          tracking_only?: boolean
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_drivers_assigned_vehicle"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          bank_name: string | null
          cancelled_cheque_url: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entity_id: string
          entity_type: string
          id: string
          ifsc_code: string | null
          is_primary: boolean
          organization_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          cancelled_cheque_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          ifsc_code?: string | null
          is_primary?: boolean
          organization_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          cancelled_cheque_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          ifsc_code?: string | null
          is_primary?: boolean
          organization_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_bank_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_bank_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_bank_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_bank_accounts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_documents: {
        Row: {
          created_at: string
          created_by: string | null
          doc_label: string | null
          doc_number: string | null
          doc_type: string
          entity_id: string
          entity_type: string
          expiry_date: string | null
          id: string
          issued_by: string | null
          issued_date: string | null
          notes: string | null
          organization_id: string
          replaced_by_id: string | null
          status: string
          storage_path: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_label?: string | null
          doc_number?: string | null
          doc_type: string
          entity_id: string
          entity_type: string
          expiry_date?: string | null
          id?: string
          issued_by?: string | null
          issued_date?: string | null
          notes?: string | null
          organization_id: string
          replaced_by_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_label?: string | null
          doc_number?: string | null
          doc_type?: string
          entity_id?: string
          entity_type?: string
          expiry_date?: string | null
          id?: string
          issued_by?: string | null
          issued_date?: string | null
          notes?: string | null
          organization_id?: string
          replaced_by_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_documents_replaced_by_id_fkey"
            columns: ["replaced_by_id"]
            isOneToOne: false
            referencedRelation: "entity_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_identity_anchors: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          global_ref: string | null
          legacy_ref: string | null
          network_ref: string | null
          org_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          global_ref?: string | null
          legacy_ref?: string | null
          network_ref?: string | null
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          global_ref?: string | null
          legacy_ref?: string | null
          network_ref?: string | null
          org_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_dead_letter: {
        Row: {
          attempt_count: number
          created_at: string
          destination: string
          event_id: string
          failure_reason: string
          id: string
          original_id: string
          payload: Json
          resolution_note: string | null
          resolved_at: string | null
        }
        Insert: {
          attempt_count: number
          created_at?: string
          destination: string
          event_id: string
          failure_reason: string
          id?: string
          original_id: string
          payload: Json
          resolution_note?: string | null
          resolved_at?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          destination?: string
          event_id?: string
          failure_reason?: string
          id?: string
          original_id?: string
          payload?: Json
          resolution_note?: string | null
          resolved_at?: string | null
        }
        Relationships: []
      }
      event_outbox: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          destination: string
          event_id: string
          id: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          status: string
          topic: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          destination: string
          event_id: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          status?: string
          topic?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          destination?: string
          event_id?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          status?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_outbox_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_store"
            referencedColumns: ["id"]
          },
        ]
      }
      event_schema_registry: {
        Row: {
          aggregate_type: string
          created_at: string
          description: string | null
          event_type: string
          payload_schema: Json | null
          schema_version: string
        }
        Insert: {
          aggregate_type: string
          created_at?: string
          description?: string | null
          event_type: string
          payload_schema?: Json | null
          schema_version?: string
        }
        Update: {
          aggregate_type?: string
          created_at?: string
          description?: string | null
          event_type?: string
          payload_schema?: Json | null
          schema_version?: string
        }
        Relationships: []
      }
      event_store: {
        Row: {
          agent_id: string | null
          aggregate_id: string
          aggregate_type: string
          caused_by: string | null
          correlation_id: string | null
          emitted_at: string
          event_type: string
          id: string
          metadata: Json
          org_id: string | null
          payload: Json
          schema_version: string
          user_id: string | null
          version: number
        }
        Insert: {
          agent_id?: string | null
          aggregate_id: string
          aggregate_type: string
          caused_by?: string | null
          correlation_id?: string | null
          emitted_at?: string
          event_type: string
          id?: string
          metadata?: Json
          org_id?: string | null
          payload?: Json
          schema_version?: string
          user_id?: string | null
          version?: number
        }
        Update: {
          agent_id?: string | null
          aggregate_id?: string
          aggregate_type?: string
          caused_by?: string | null
          correlation_id?: string | null
          emitted_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          org_id?: string | null
          payload?: Json
          schema_version?: string
          user_id?: string | null
          version?: number
        }
        Relationships: []
      }
      execution_plan_stops: {
        Row: {
          address_line: string | null
          city: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          display_name: string | null
          execution_plan_id: string
          id: string
          label: string | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          organization_id: string
          pincode: string | null
          pod_required: boolean
          sequence: number
          source_id: string | null
          source_type: string
          state: string | null
          stop_type: string
          warehouse_id: string | null
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          display_name?: string | null
          execution_plan_id: string
          id?: string
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          organization_id: string
          pincode?: string | null
          pod_required?: boolean
          sequence?: number
          source_id?: string | null
          source_type?: string
          state?: string | null
          stop_type: string
          warehouse_id?: string | null
        }
        Update: {
          address_line?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          display_name?: string | null
          execution_plan_id?: string
          id?: string
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          organization_id?: string
          pincode?: string | null
          pod_required?: boolean
          sequence?: number
          source_id?: string | null
          source_type?: string
          state?: string | null
          stop_type?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_plan_stops_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_plan_stops_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_plan_stops_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_plan_stops_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_plans: {
        Row: {
          constraints: Json
          correlation_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          lifecycle_stage: string | null
          merge_score: number | null
          organization_id: string
          origin: string
          plan_number: string
          planned_vehicle_type: string | null
          published_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          constraints?: Json
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          lifecycle_stage?: string | null
          merge_score?: number | null
          organization_id: string
          origin?: string
          plan_number: string
          planned_vehicle_type?: string | null
          published_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          constraints?: Json
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          lifecycle_stage?: string | null
          merge_score?: number | null
          organization_id?: string
          origin?: string
          plan_number?: string
          planned_vehicle_type?: string | null
          published_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_events: {
        Row: {
          driver_id: string
          event_type: string
          id: string
          latitude: number
          longitude: number
          organization_id: string
          place_label: string | null
          recorded_at: string
          trip_id: string
        }
        Insert: {
          driver_id: string
          event_type: string
          id?: string
          latitude: number
          longitude: number
          organization_id: string
          place_label?: string | null
          recorded_at?: string
          trip_id: string
        }
        Update: {
          driver_id?: string
          event_type?: string
          id?: string
          latitude?: number
          longitude?: number
          organization_id?: string
          place_label?: string | null
          recorded_at?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofence_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "geofence_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "geofence_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      global_references: {
        Row: {
          entity_id: string
          entity_type: string
          id: string
          issued_at: string
          issued_by_org: string | null
          reference: string
          year: number
        }
        Insert: {
          entity_id: string
          entity_type: string
          id?: string
          issued_at?: string
          issued_by_org?: string | null
          reference: string
          year: number
        }
        Update: {
          entity_id?: string
          entity_type?: string
          id?: string
          issued_at?: string
          issued_by_org?: string | null
          reference?: string
          year?: number
        }
        Relationships: []
      }
      id_generation_log: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string
          generated_id: string
          id: string
          latency_ms: number | null
          org_id: string | null
          path: string
          reference: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type: string
          generated_id: string
          id?: string
          latency_ms?: number | null
          org_id?: string | null
          path?: string
          reference?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          generated_id?: string
          id?: string
          latency_ms?: number | null
          org_id?: string | null
          path?: string
          reference?: string | null
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          completed_at: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          error_message: string | null
          expires_at: string
          key: string
          org_id: string
          request_hash: string
          response_payload: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          error_message?: string | null
          expires_at?: string
          key: string
          org_id: string
          request_hash: string
          response_payload?: Json | null
          status?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          error_message?: string | null
          expires_at?: string
          key?: string
          org_id?: string
          request_hash?: string
          response_payload?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      indents: {
        Row: {
          assigned_supplier_id: string | null
          assigned_supplier_rate: number | null
          circulation_target: string | null
          client_id: string | null
          client_name: string
          client_price: number
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          display_indent_id: string | null
          drop_location: string
          execution_plan_id: string | null
          id: string
          indent_code: string | null
          indent_number: string
          indent_operational_code: string | null
          lane_id: string | null
          last_saved_at: string | null
          load_type: string | null
          organization_id: string
          owner_user_id: string | null
          pickup_area: string
          pickup_date: string | null
          sale_rate_basis: string | null
          sale_unit_rate: number | null
          sales_order_id: string | null
          sequence_number: number | null
          shared_at: string | null
          status: string
          supplier_rate_basis: string | null
          supplier_target: number
          updated_at: string | null
          vehicle_type: string | null
          warehouse_id: string | null
          weight: number | null
        }
        Insert: {
          assigned_supplier_id?: string | null
          assigned_supplier_rate?: number | null
          circulation_target?: string | null
          client_id?: string | null
          client_name: string
          client_price?: number
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          display_indent_id?: string | null
          drop_location: string
          execution_plan_id?: string | null
          id?: string
          indent_code?: string | null
          indent_number: string
          indent_operational_code?: string | null
          lane_id?: string | null
          last_saved_at?: string | null
          load_type?: string | null
          organization_id: string
          owner_user_id?: string | null
          pickup_area: string
          pickup_date?: string | null
          sale_rate_basis?: string | null
          sale_unit_rate?: number | null
          sales_order_id?: string | null
          sequence_number?: number | null
          shared_at?: string | null
          status?: string
          supplier_rate_basis?: string | null
          supplier_target?: number
          updated_at?: string | null
          vehicle_type?: string | null
          warehouse_id?: string | null
          weight?: number | null
        }
        Update: {
          assigned_supplier_id?: string | null
          assigned_supplier_rate?: number | null
          circulation_target?: string | null
          client_id?: string | null
          client_name?: string
          client_price?: number
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          display_indent_id?: string | null
          drop_location?: string
          execution_plan_id?: string | null
          id?: string
          indent_code?: string | null
          indent_number?: string
          indent_operational_code?: string | null
          lane_id?: string | null
          last_saved_at?: string | null
          load_type?: string | null
          organization_id?: string
          owner_user_id?: string | null
          pickup_area?: string
          pickup_date?: string | null
          sale_rate_basis?: string | null
          sale_unit_rate?: number | null
          sales_order_id?: string | null
          sequence_number?: number | null
          shared_at?: string | null
          status?: string
          supplier_rate_basis?: string | null
          supplier_target?: number
          updated_at?: string | null
          vehicle_type?: string | null
          warehouse_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "indents_assigned_supplier_id_fkey"
            columns: ["assigned_supplier_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_assigned_supplier_id_fkey"
            columns: ["assigned_supplier_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "client_lane_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          created_at: string
          financial_year: string
          last_seq: number
          org_id: string
        }
        Insert: {
          created_at?: string
          financial_year: string
          last_seq?: number
          org_id: string
        }
        Update: {
          created_at?: string
          financial_year?: string
          last_seq?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billing_period_end: string | null
          billing_period_start: string | null
          cgst_amount: number
          client_id: string | null
          client_name: string | null
          client_snapshot: Json | null
          created_at: string
          created_by: string | null
          due_date: string | null
          financial_year: string
          gst_rate: number
          id: string
          igst_amount: number
          invoice_date: string
          invoice_number: string
          invoice_source: string
          issue_idempotency_key: string | null
          issuer_snapshot: Json | null
          line_items: Json | null
          manual_plan_snapshot: Json | null
          notes: string | null
          org_id: string
          payment_terms: string | null
          pdf_storage_path: string | null
          plan_id: string | null
          pod_annexure_snapshot: Json | null
          sales_order_id: string | null
          sgst_amount: number
          status: string
          subtotal: number
          tax_snapshot: Json | null
          total_amount: number
          trip_ids: string[]
          updated_at: string
        }
        Insert: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          cgst_amount?: number
          client_id?: string | null
          client_name?: string | null
          client_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          financial_year: string
          gst_rate?: number
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number: string
          invoice_source?: string
          issue_idempotency_key?: string | null
          issuer_snapshot?: Json | null
          line_items?: Json | null
          manual_plan_snapshot?: Json | null
          notes?: string | null
          org_id: string
          payment_terms?: string | null
          pdf_storage_path?: string | null
          plan_id?: string | null
          pod_annexure_snapshot?: Json | null
          sales_order_id?: string | null
          sgst_amount?: number
          status?: string
          subtotal?: number
          tax_snapshot?: Json | null
          total_amount?: number
          trip_ids?: string[]
          updated_at?: string
        }
        Update: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          cgst_amount?: number
          client_id?: string | null
          client_name?: string | null
          client_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          financial_year?: string
          gst_rate?: number
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number?: string
          invoice_source?: string
          issue_idempotency_key?: string | null
          issuer_snapshot?: Json | null
          line_items?: Json | null
          manual_plan_snapshot?: Json | null
          notes?: string | null
          org_id?: string
          payment_terms?: string | null
          pdf_storage_path?: string | null
          plan_id?: string | null
          pod_annexure_snapshot?: Json | null
          sales_order_id?: string | null
          sgst_amount?: number
          status?: string
          subtotal?: number
          tax_snapshot?: Json | null
          total_amount?: number
          trip_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      loads: {
        Row: {
          created_at: string | null
          created_by_user_id: string
          id: string
          indent_id: string | null
          load_number: string | null
          owner_user_id: string
          trip_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by_user_id: string
          id?: string
          indent_id?: string | null
          load_number?: string | null
          owner_user_id: string
          trip_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by_user_id?: string
          id?: string
          indent_id?: string | null
          load_number?: string | null
          owner_user_id?: string
          trip_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loads_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      market_bids: {
        Row: {
          accepted_at: string | null
          amount: number
          bidder_organization_id: string | null
          bidder_type: string
          bidder_user_id: string
          created_at: string
          fee_payment_status: string
          id: string
          indent_id: string
          note: string | null
          owner_vehicle_id: string | null
          platform_fee_amount: number | null
          platform_fee_calc_snapshot: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          amount: number
          bidder_organization_id?: string | null
          bidder_type: string
          bidder_user_id: string
          created_at?: string
          fee_payment_status?: string
          id?: string
          indent_id: string
          note?: string | null
          owner_vehicle_id?: string | null
          platform_fee_amount?: number | null
          platform_fee_calc_snapshot?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          amount?: number
          bidder_organization_id?: string | null
          bidder_type?: string
          bidder_user_id?: string
          created_at?: string
          fee_payment_status?: string
          id?: string
          indent_id?: string
          note?: string | null
          owner_vehicle_id?: string | null
          platform_fee_amount?: number | null
          platform_fee_calc_snapshot?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_bids_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_bids_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_bids_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_bids_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_bids_owner_vehicle_id_fkey"
            columns: ["owner_vehicle_id"]
            isOneToOne: false
            referencedRelation: "owner_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_fee_components: {
        Row: {
          component_type: string
          config_id: string
          created_at: string
          flat_amount: number | null
          id: string
          percentage_rate: number | null
          sort_order: number
        }
        Insert: {
          component_type: string
          config_id: string
          created_at?: string
          flat_amount?: number | null
          id?: string
          percentage_rate?: number | null
          sort_order?: number
        }
        Update: {
          component_type?: string
          config_id?: string
          created_at?: string
          flat_amount?: number | null
          id?: string
          percentage_rate?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_fee_components_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "marketplace_fee_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_fee_configs: {
        Row: {
          comparison_mode: string
          created_at: string
          id: string
          is_active: boolean
          max_fee: number | null
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          comparison_mode?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_fee?: number | null
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          comparison_mode?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_fee?: number | null
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      marketplace_fee_payments: {
        Row: {
          amount: number
          bidder_organization_id: string | null
          bidder_type: string
          bidder_user_id: string
          created_at: string
          currency: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          market_bid_id: string
          paid_at: string | null
          provider: string | null
          provider_event_id: string | null
          provider_order_id: string | null
          provider_payment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          bidder_organization_id?: string | null
          bidder_type: string
          bidder_user_id: string
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          market_bid_id: string
          paid_at?: string | null
          provider?: string | null
          provider_event_id?: string | null
          provider_order_id?: string | null
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bidder_organization_id?: string | null
          bidder_type?: string
          bidder_user_id?: string
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          market_bid_id?: string
          paid_at?: string | null
          provider?: string | null
          provider_event_id?: string | null
          provider_order_id?: string | null
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_fee_payments_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_fee_payments_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_fee_payments_market_bid_id_fkey"
            columns: ["market_bid_id"]
            isOneToOne: false
            referencedRelation: "market_bids"
            referencedColumns: ["id"]
          },
        ]
      }
      network_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          org_a_id: string
          org_a_name: string
          org_b_id: string
          org_b_name: string
          unread_count_a: number
          unread_count_b: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          org_a_id: string
          org_a_name: string
          org_b_id: string
          org_b_name: string
          unread_count_a?: number
          unread_count_b?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          org_a_id?: string
          org_a_name?: string
          org_b_id?: string
          org_b_name?: string
          unread_count_a?: number
          unread_count_b?: number
          updated_at?: string
        }
        Relationships: []
      }
      network_identities: {
        Row: {
          created_at: string
          id: string
          identity_type: string
          metadata: Json
          network_ref: string
          participant_orgs: string[]
          primary_entity: string
          primary_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          identity_type: string
          metadata?: Json
          network_ref: string
          participant_orgs?: string[]
          primary_entity: string
          primary_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          identity_type?: string
          metadata?: Json
          network_ref?: string
          participant_orgs?: string[]
          primary_entity?: string
          primary_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      network_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read_by_other: boolean
          metadata: Json
          read_at: string | null
          sender_avatar_seed: string | null
          sender_name: string
          sender_org_id: string
          sender_user_id: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read_by_other?: boolean
          metadata?: Json
          read_at?: string | null
          sender_avatar_seed?: string | null
          sender_name: string
          sender_org_id: string
          sender_user_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read_by_other?: boolean
          metadata?: Json
          read_at?: string | null
          sender_avatar_seed?: string | null
          sender_name?: string
          sender_org_id?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "network_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      network_notifications: {
        Row: {
          actor_org_id: string | null
          amount_meta: number | null
          bid_id: string | null
          created_at: string
          dedupe_key: string | null
          event_type: string
          handled_at: string | null
          handled_by_user_id: string | null
          id: string
          indent_id: string | null
          organization_id: string
          payload_json: Json
          quote_id: string | null
          read_at: string | null
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          actor_org_id?: string | null
          amount_meta?: number | null
          bid_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          event_type: string
          handled_at?: string | null
          handled_by_user_id?: string | null
          id?: string
          indent_id?: string | null
          organization_id: string
          payload_json?: Json
          quote_id?: string | null
          read_at?: string | null
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          actor_org_id?: string | null
          amount_meta?: number | null
          bid_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          event_type?: string
          handled_at?: string | null
          handled_by_user_id?: string | null
          id?: string
          indent_id?: string | null
          organization_id?: string
          payload_json?: Json
          quote_id?: string | null
          read_at?: string | null
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_notifications_actor_org_id_fkey"
            columns: ["actor_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_notifications_actor_org_id_fkey"
            columns: ["actor_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_notifications_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_notifications_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_notifications_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_notifications_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "direct_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_jobs: {
        Row: {
          confidence_score: number | null
          created_at: string
          created_by: string | null
          document_fingerprint: string
          duplicate_of_job_id: string | null
          engine_name: string
          engine_version: string
          error_message: string | null
          force_rescan: boolean
          id: string
          is_duplicate: boolean
          ocr_model: string | null
          organization_id: string
          pod_attachment_id: string | null
          processing_completed_at: string | null
          processing_duration_ms: number | null
          processing_started_at: string | null
          prompt_version: string
          raw_model_json: Json | null
          result_json: Json | null
          source_kind: string
          source_subtype: string | null
          status: Database["public"]["Enums"]["ocr_job_status"]
          storage_path: string | null
          trip_document_id: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          document_fingerprint: string
          duplicate_of_job_id?: string | null
          engine_name?: string
          engine_version: string
          error_message?: string | null
          force_rescan?: boolean
          id?: string
          is_duplicate?: boolean
          ocr_model?: string | null
          organization_id: string
          pod_attachment_id?: string | null
          processing_completed_at?: string | null
          processing_duration_ms?: number | null
          processing_started_at?: string | null
          prompt_version?: string
          raw_model_json?: Json | null
          result_json?: Json | null
          source_kind: string
          source_subtype?: string | null
          status?: Database["public"]["Enums"]["ocr_job_status"]
          storage_path?: string | null
          trip_document_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          document_fingerprint?: string
          duplicate_of_job_id?: string | null
          engine_name?: string
          engine_version?: string
          error_message?: string | null
          force_rescan?: boolean
          id?: string
          is_duplicate?: boolean
          ocr_model?: string | null
          organization_id?: string
          pod_attachment_id?: string | null
          processing_completed_at?: string | null
          processing_duration_ms?: number | null
          processing_started_at?: string | null
          prompt_version?: string
          raw_model_json?: Json | null
          result_json?: Json | null
          source_kind?: string
          source_subtype?: string | null
          status?: Database["public"]["Enums"]["ocr_job_status"]
          storage_path?: string | null
          trip_document_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocr_jobs_duplicate_of_job_id_fkey"
            columns: ["duplicate_of_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_document_id_fkey"
            columns: ["trip_document_id"]
            isOneToOne: false
            referencedRelation: "trip_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      operational_sequences: {
        Row: {
          created_at: string
          current_value: number
          entity_type: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          entity_type: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_value?: number
          entity_type?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_agent_rate_log: {
        Row: {
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          request_count?: number
          user_id: string
          window_start: string
        }
        Update: {
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      org_feature_flags: {
        Row: {
          enabled: boolean
          flag_id: string
          id: string
          org_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          flag_id: string
          id?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          flag_id?: string
          id?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_feature_flags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_feature_flags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_counters: {
        Row: {
          indent_seq: number
          order_seq: number
          organization_id: string
          plan_seq: number
          trip_seq: number
        }
        Insert: {
          indent_seq?: number
          order_seq?: number
          organization_id: string
          plan_seq?: number
          trip_seq?: number
        }
        Update: {
          indent_seq?: number
          order_seq?: number
          organization_id?: string
          plan_seq?: number
          trip_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_domain_join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          email_domain: string
          id: string
          organization_id: string
          requester_name: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email: string
          email_domain: string
          id?: string
          organization_id: string
          requester_name?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          email_domain?: string
          id?: string
          organization_id?: string
          requester_name?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_domain_join_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_domain_join_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_kyc_documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          doc_label: string | null
          doc_type: string
          file_name: string | null
          file_size_bytes: number | null
          id: string
          is_mandatory: boolean
          mime_type: string | null
          organization_id: string
          rejection_notes: string | null
          status: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          doc_label?: string | null
          doc_type: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          organization_id: string
          rejection_notes?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          doc_label?: string | null
          doc_type?: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          organization_id?: string
          rejection_notes?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_kyc_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_kyc_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_links: {
        Row: {
          created_at: string | null
          id: string
          link_type: string
          linked_org_id: string
          owner_org_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          link_type: string
          linked_org_id: string
          owner_org_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          link_type?: string
          linked_org_id?: string
          owner_org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_links_linked_org_id_fkey"
            columns: ["linked_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_links_linked_org_id_fkey"
            columns: ["linked_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_links_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_links_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_locations: {
        Row: {
          address_line: string | null
          city: string | null
          created_at: string
          department: string | null
          id: string
          is_verified: boolean
          location_type: string
          name: string
          organization_id: string
          sort_order: number
          state: string | null
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          created_at?: string
          department?: string | null
          id?: string
          is_verified?: boolean
          location_type?: string
          name: string
          organization_id: string
          sort_order?: number
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          city?: string | null
          created_at?: string
          department?: string | null
          id?: string
          is_verified?: boolean
          location_type?: string
          name?: string
          organization_id?: string
          sort_order?: number
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_member_warehouses: {
        Row: {
          created_at: string
          id: string
          organization_member_id: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_member_id: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_member_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_member_warehouses_organization_member_id_fkey"
            columns: ["organization_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_member_warehouses_organization_member_id_fkey"
            columns: ["organization_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_member_warehouses_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          id: string
          joined_at: string
          organization_id: string
          permissions: Json
          role: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          joined_at?: string
          organization_id: string
          permissions?: Json
          role?: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          joined_at?: string
          organization_id?: string
          permissions?: Json
          role?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_relations: {
        Row: {
          created_at: string | null
          from_organization_id: string
          id: string
          relation_type: string
          status: string
          to_organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          from_organization_id: string
          id?: string
          relation_type?: string
          status?: string
          to_organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          from_organization_id?: string
          id?: string
          relation_type?: string
          status?: string
          to_organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_relations_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_relations_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_relations_to_organization_id_fkey"
            columns: ["to_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_relations_to_organization_id_fkey"
            columns: ["to_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_team_invites: {
        Row: {
          accepted_user_id: string | null
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invitee_email: string | null
          invitee_name: string
          invitee_phone: string
          invitee_phone_canon: string
          organization_id: string
          permissions: Json
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_user_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by: string
          invitee_email?: string | null
          invitee_name: string
          invitee_phone: string
          invitee_phone_canon: string
          organization_id: string
          permissions?: Json
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_user_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invitee_email?: string | null
          invitee_name?: string
          invitee_phone?: string
          invitee_phone_canon?: string
          organization_id?: string
          permissions?: Json
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_team_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_team_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_line: string | null
          address_pincode: string | null
          address_proof_path: string | null
          address_proof_type: string | null
          avatar_seed: string | null
          biometric_detail: Json | null
          biometric_status: Database["public"]["Enums"]["pillar_status_type"]
          business_pan: string | null
          business_type: string | null
          cin: string | null
          city: string | null
          created_at: string | null
          deleted_at: string | null
          employee_count: string | null
          founded_year: number | null
          frozen_at: string | null
          gst_not_applicable: boolean
          gstin: string | null
          id: string
          iec_number: string | null
          kyc_rejected_reason: string | null
          locality: string | null
          logo_url: string | null
          msme_number: string | null
          name: string
          operating_model: string
          operating_model_changed_at: string | null
          operational_code: string | null
          owner_id: string | null
          penny_drop_detail: Json | null
          penny_drop_status: Database["public"]["Enums"]["pillar_status_type"]
          pincode: string | null
          platform_status: string
          profile_about: string | null
          profile_area: string | null
          profile_ceo_name: string | null
          profile_facebook: string | null
          profile_products: string[]
          profile_sector: string | null
          profile_website: string | null
          profile_youtube: string | null
          referral_code: string | null
          registration_type:
            | Database["public"]["Enums"]["registration_type_enum"]
            | null
          rejection_reasons: Json | null
          settings: Json
          slug: string | null
          state: string | null
          submitted_at: string | null
          tan_number: string | null
          tier_1_unlocked_at: string | null
          tier_2_unlocked_at: string | null
          transaction_cap_paise: number
          updated_at: string | null
          verification_status: Database["public"]["Enums"]["kyc_verification_status"]
          verification_tier: Database["public"]["Enums"]["verification_tier_enum"]
          verified_at: string | null
          verified_by: string | null
          zone: string | null
        }
        Insert: {
          address_line?: string | null
          address_pincode?: string | null
          address_proof_path?: string | null
          address_proof_type?: string | null
          avatar_seed?: string | null
          biometric_detail?: Json | null
          biometric_status?: Database["public"]["Enums"]["pillar_status_type"]
          business_pan?: string | null
          business_type?: string | null
          cin?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          employee_count?: string | null
          founded_year?: number | null
          frozen_at?: string | null
          gst_not_applicable?: boolean
          gstin?: string | null
          id?: string
          iec_number?: string | null
          kyc_rejected_reason?: string | null
          locality?: string | null
          logo_url?: string | null
          msme_number?: string | null
          name: string
          operating_model?: string
          operating_model_changed_at?: string | null
          operational_code?: string | null
          owner_id?: string | null
          penny_drop_detail?: Json | null
          penny_drop_status?: Database["public"]["Enums"]["pillar_status_type"]
          pincode?: string | null
          platform_status?: string
          profile_about?: string | null
          profile_area?: string | null
          profile_ceo_name?: string | null
          profile_facebook?: string | null
          profile_products?: string[]
          profile_sector?: string | null
          profile_website?: string | null
          profile_youtube?: string | null
          referral_code?: string | null
          registration_type?:
            | Database["public"]["Enums"]["registration_type_enum"]
            | null
          rejection_reasons?: Json | null
          settings?: Json
          slug?: string | null
          state?: string | null
          submitted_at?: string | null
          tan_number?: string | null
          tier_1_unlocked_at?: string | null
          tier_2_unlocked_at?: string | null
          transaction_cap_paise?: number
          updated_at?: string | null
          verification_status?: Database["public"]["Enums"]["kyc_verification_status"]
          verification_tier?: Database["public"]["Enums"]["verification_tier_enum"]
          verified_at?: string | null
          verified_by?: string | null
          zone?: string | null
        }
        Update: {
          address_line?: string | null
          address_pincode?: string | null
          address_proof_path?: string | null
          address_proof_type?: string | null
          avatar_seed?: string | null
          biometric_detail?: Json | null
          biometric_status?: Database["public"]["Enums"]["pillar_status_type"]
          business_pan?: string | null
          business_type?: string | null
          cin?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          employee_count?: string | null
          founded_year?: number | null
          frozen_at?: string | null
          gst_not_applicable?: boolean
          gstin?: string | null
          id?: string
          iec_number?: string | null
          kyc_rejected_reason?: string | null
          locality?: string | null
          logo_url?: string | null
          msme_number?: string | null
          name?: string
          operating_model?: string
          operating_model_changed_at?: string | null
          operational_code?: string | null
          owner_id?: string | null
          penny_drop_detail?: Json | null
          penny_drop_status?: Database["public"]["Enums"]["pillar_status_type"]
          pincode?: string | null
          platform_status?: string
          profile_about?: string | null
          profile_area?: string | null
          profile_ceo_name?: string | null
          profile_facebook?: string | null
          profile_products?: string[]
          profile_sector?: string | null
          profile_website?: string | null
          profile_youtube?: string | null
          referral_code?: string | null
          registration_type?:
            | Database["public"]["Enums"]["registration_type_enum"]
            | null
          rejection_reasons?: Json | null
          settings?: Json
          slug?: string | null
          state?: string | null
          submitted_at?: string | null
          tan_number?: string | null
          tier_1_unlocked_at?: string | null
          tier_2_unlocked_at?: string | null
          transaction_cap_paise?: number
          updated_at?: string | null
          verification_status?: Database["public"]["Enums"]["kyc_verification_status"]
          verification_tier?: Database["public"]["Enums"]["verification_tier_enum"]
          verified_at?: string | null
          verified_by?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      owner_vehicle_documents: {
        Row: {
          created_at: string
          document_number: string | null
          document_type: string
          expires_at: string | null
          file_name: string | null
          file_size_bytes: number | null
          id: string
          issued_at: string | null
          metadata: Json
          mime_type: string | null
          owner_user_id: string
          owner_vehicle_id: string
          replaced_by: string | null
          status: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_number?: string | null
          document_type: string
          expires_at?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          issued_at?: string | null
          metadata?: Json
          mime_type?: string | null
          owner_user_id: string
          owner_vehicle_id: string
          replaced_by?: string | null
          status?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_number?: string | null
          document_type?: string
          expires_at?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          issued_at?: string | null
          metadata?: Json
          mime_type?: string | null
          owner_user_id?: string
          owner_vehicle_id?: string
          replaced_by?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_vehicle_documents_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_vehicle_documents_owner_vehicle_id_fkey"
            columns: ["owner_vehicle_id"]
            isOneToOne: false
            referencedRelation: "owner_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_vehicle_documents_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "owner_vehicle_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_vehicles: {
        Row: {
          avatar_seed: string | null
          avatar_url: string | null
          capacity: string | null
          created_at: string
          deleted_at: string | null
          documents: Json
          fuel_type: string | null
          id: string
          owner_user_id: string
          status: string
          updated_at: string
          vehicle_axle: string | null
          vehicle_body_type: string | null
          vehicle_brand: string | null
          vehicle_model: string | null
          vehicle_number: string
          vehicle_size: string | null
          vehicle_type: string | null
        }
        Insert: {
          avatar_seed?: string | null
          avatar_url?: string | null
          capacity?: string | null
          created_at?: string
          deleted_at?: string | null
          documents?: Json
          fuel_type?: string | null
          id?: string
          owner_user_id: string
          status?: string
          updated_at?: string
          vehicle_axle?: string | null
          vehicle_body_type?: string | null
          vehicle_brand?: string | null
          vehicle_model?: string | null
          vehicle_number: string
          vehicle_size?: string | null
          vehicle_type?: string | null
        }
        Update: {
          avatar_seed?: string | null
          avatar_url?: string | null
          capacity?: string | null
          created_at?: string
          deleted_at?: string | null
          documents?: Json
          fuel_type?: string | null
          id?: string
          owner_user_id?: string
          status?: string
          updated_at?: string
          vehicle_axle?: string | null
          vehicle_body_type?: string | null
          vehicle_brand?: string | null
          vehicle_model?: string | null
          vehicle_number?: string
          vehicle_size?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_vehicles_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          org_id: string | null
          payload: Json
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          org_id?: string | null
          payload?: Json
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          org_id?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_identity_audit_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          invite_id: string | null
          membership_id: string | null
          metadata: Json
          occurred_at: string
          organization_id: string | null
          person_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          invite_id?: string | null
          membership_id?: string | null
          metadata?: Json
          occurred_at?: string
          organization_id?: string | null
          person_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          invite_id?: string | null
          membership_id?: string | null
          metadata?: Json
          occurred_at?: string
          organization_id?: string | null
          person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_identity_audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_identity_audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_metrics: {
        Row: {
          id: string
          labels: Json
          metric_name: string
          metric_value: number
          recorded_at: string
        }
        Insert: {
          id?: string
          labels?: Json
          metric_name: string
          metric_value: number
          recorded_at?: string
        }
        Update: {
          id?: string
          labels?: Json
          metric_name?: string
          metric_value?: number
          recorded_at?: string
        }
        Relationships: []
      }
      platform_permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      platform_role_members: {
        Row: {
          granted_at: string
          granted_by: string | null
          platform_user_id: string
          role_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          platform_user_id: string
          role_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          platform_user_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_role_members_platform_user_id_fkey"
            columns: ["platform_user_id"]
            isOneToOne: false
            referencedRelation: "platform_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_role_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "platform_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "platform_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "platform_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      platform_users: {
        Row: {
          created_at: string
          department: string | null
          employee_id: string | null
          id: string
          last_active_at: string | null
          last_active_ip: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          employee_id?: string | null
          id?: string
          last_active_at?: string | null
          last_active_ip?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          employee_id?: string | null
          id?: string
          last_active_at?: string | null
          last_active_ip?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          author_user_id: string
          content: string | null
          created_at: string
          destination: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          load_date: string | null
          material: string | null
          organization_id: string | null
          origin: string | null
          owner_vehicle_id: string | null
          rate_offer: number | null
          source_indent_id: string | null
          type: string
          updated_at: string
          vehicle_type: string | null
          view_count: number
          weight_tonnes: number | null
        }
        Insert: {
          author_user_id: string
          content?: string | null
          created_at?: string
          destination?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          load_date?: string | null
          material?: string | null
          organization_id?: string | null
          origin?: string | null
          owner_vehicle_id?: string | null
          rate_offer?: number | null
          source_indent_id?: string | null
          type: string
          updated_at?: string
          vehicle_type?: string | null
          view_count?: number
          weight_tonnes?: number | null
        }
        Update: {
          author_user_id?: string
          content?: string | null
          created_at?: string
          destination?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          load_date?: string | null
          material?: string | null
          organization_id?: string | null
          origin?: string | null
          owner_vehicle_id?: string | null
          rate_offer?: number | null
          source_indent_id?: string | null
          type?: string
          updated_at?: string
          vehicle_type?: string | null
          view_count?: number
          weight_tonnes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_owner_vehicle_id_fkey"
            columns: ["owner_vehicle_id"]
            isOneToOne: false
            referencedRelation: "owner_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_source_indent_id_fkey"
            columns: ["source_indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_source_indent_id_fkey"
            columns: ["source_indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
        ]
      }
      product_usage: {
        Row: {
          id: string
          metric_key: string
          org_id: string
          period_end: string
          period_start: string
          product_id: string
          quantity: number
          recorded_at: string
        }
        Insert: {
          id?: string
          metric_key: string
          org_id: string
          period_end: string
          period_start: string
          product_id: string
          quantity?: number
          recorded_at?: string
        }
        Update: {
          id?: string
          metric_key?: string
          org_id?: string
          period_end?: string
          period_start?: string
          product_id?: string
          quantity?: number
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      product_waitlist: {
        Row: {
          company_name: string | null
          created_at: string
          email: string
          fleet_size: string | null
          full_name: string | null
          id: string
          invited_at: string | null
          org_id: string | null
          product_id: string
          referral_source: string | null
          status: string
          use_case: string | null
          user_id: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email: string
          fleet_size?: string | null
          full_name?: string | null
          id?: string
          invited_at?: string | null
          org_id?: string | null
          product_id: string
          referral_source?: string | null
          status?: string
          use_case?: string | null
          user_id?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string
          fleet_size?: string | null
          full_name?: string | null
          id?: string
          invited_at?: string | null
          org_id?: string | null
          product_id?: string
          referral_source?: string | null
          status?: string
          use_case?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_waitlist_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_waitlist_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          fragile: boolean
          hazmat: boolean
          height_cm: number | null
          hsn_code: string | null
          id: string
          image_path: string | null
          length_cm: number | null
          name: string
          organization_id: string
          sku: string
          status: string
          tax_rate: number
          temperature_type: string
          unit_price: number
          uom: string
          updated_at: string
          volume_m3: number
          weight_kg: number
          width_cm: number | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          fragile?: boolean
          hazmat?: boolean
          height_cm?: number | null
          hsn_code?: string | null
          id?: string
          image_path?: string | null
          length_cm?: number | null
          name: string
          organization_id: string
          sku: string
          status?: string
          tax_rate?: number
          temperature_type?: string
          unit_price?: number
          uom?: string
          updated_at?: string
          volume_m3?: number
          weight_kg?: number
          width_cm?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          fragile?: boolean
          hazmat?: boolean
          height_cm?: number | null
          hsn_code?: string | null
          id?: string
          image_path?: string | null
          length_cm?: number | null
          name?: string
          organization_id?: string
          sku?: string
          status?: string
          tax_rate?: number
          temperature_type?: string
          unit_price?: number
          uom?: string
          updated_at?: string
          volume_m3?: number
          weight_kg?: number
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commerce_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          aggregated: boolean
          asset: boolean
          avatar_seed: string | null
          avatar_url: string | null
          bio: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          id: string
          insurance_expiry: string | null
          insurance_photo_url: string | null
          languages: string[] | null
          license_expiry: string | null
          license_number: string | null
          license_photo_url: string | null
          license_type: string | null
          onboarding_completed: boolean | null
          phone: string | null
          preferred_areas: string[] | null
          preferred_vehicle_types: string[] | null
          role: string
          updated_at: string | null
          vehicle_registration: string | null
          vehicle_registration_expiry: string | null
          vehicle_registration_photo_url: string | null
          years_of_experience: number | null
        }
        Insert: {
          address?: string | null
          aggregated?: boolean
          asset?: boolean
          avatar_seed?: string | null
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id: string
          insurance_expiry?: string | null
          insurance_photo_url?: string | null
          languages?: string[] | null
          license_expiry?: string | null
          license_number?: string | null
          license_photo_url?: string | null
          license_type?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          preferred_areas?: string[] | null
          preferred_vehicle_types?: string[] | null
          role?: string
          updated_at?: string | null
          vehicle_registration?: string | null
          vehicle_registration_expiry?: string | null
          vehicle_registration_photo_url?: string | null
          years_of_experience?: number | null
        }
        Update: {
          address?: string | null
          aggregated?: boolean
          asset?: boolean
          avatar_seed?: string | null
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_photo_url?: string | null
          languages?: string[] | null
          license_expiry?: string | null
          license_number?: string | null
          license_photo_url?: string | null
          license_type?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          preferred_areas?: string[] | null
          preferred_vehicle_types?: string[] | null
          role?: string
          updated_at?: string | null
          vehicle_registration?: string | null
          vehicle_registration_expiry?: string | null
          vehicle_registration_photo_url?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
      }
      public_email_domains: {
        Row: {
          domain: string
        }
        Insert: {
          domain: string
        }
        Update: {
          domain?: string
        }
        Relationships: []
      }
      pulse_audit_actions: {
        Row: {
          action: string
          audit_table: string | null
          created_at: string
          data_detail: string | null
          del_tables: string[]
          flow_group: string | null
          id: string
          ins_tables: string[]
          is_subflow: boolean | null
          priority: string
          route: string | null
          seq: number
          service: string | null
          sub_seq: number | null
          trigger_name: string | null
          upd_tables: string[]
          verify_sql: string | null
        }
        Insert: {
          action: string
          audit_table?: string | null
          created_at?: string
          data_detail?: string | null
          del_tables?: string[]
          flow_group?: string | null
          id: string
          ins_tables?: string[]
          is_subflow?: boolean | null
          priority?: string
          route?: string | null
          seq: number
          service?: string | null
          sub_seq?: number | null
          trigger_name?: string | null
          upd_tables?: string[]
          verify_sql?: string | null
        }
        Update: {
          action?: string
          audit_table?: string | null
          created_at?: string
          data_detail?: string | null
          del_tables?: string[]
          flow_group?: string | null
          id?: string
          ins_tables?: string[]
          is_subflow?: boolean | null
          priority?: string
          route?: string | null
          seq?: number
          service?: string | null
          sub_seq?: number | null
          trigger_name?: string | null
          upd_tables?: string[]
          verify_sql?: string | null
        }
        Relationships: []
      }
      pulse_audit_verifications: {
        Row: {
          action_id: string
          id: string
          notes: string | null
          snapshot_after: Json | null
          snapshot_before: Json | null
          status: string
          tester_name: string | null
          updated_at: string
          verified_at: string
        }
        Insert: {
          action_id: string
          id?: string
          notes?: string | null
          snapshot_after?: Json | null
          snapshot_before?: Json | null
          status?: string
          tester_name?: string | null
          updated_at?: string
          verified_at?: string
        }
        Update: {
          action_id?: string
          id?: string
          notes?: string | null
          snapshot_after?: Json | null
          snapshot_before?: Json | null
          status?: string
          tester_name?: string | null
          updated_at?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pulse_audit_verifications_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: true
            referencedRelation: "pulse_audit_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      pulse_credit_referrals: {
        Row: {
          created_at: string
          credited_at: string | null
          id: string
          referred_org_id: string
          referrer_org_id: string
          status: string
        }
        Insert: {
          created_at?: string
          credited_at?: string | null
          id?: string
          referred_org_id: string
          referrer_org_id: string
          status?: string
        }
        Update: {
          created_at?: string
          credited_at?: string | null
          id?: string
          referred_org_id?: string
          referrer_org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pulse_credit_referrals_referred_org_id_fkey"
            columns: ["referred_org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pulse_credit_referrals_referred_org_id_fkey"
            columns: ["referred_org_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pulse_credit_referrals_referrer_org_id_fkey"
            columns: ["referrer_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pulse_credit_referrals_referrer_org_id_fkey"
            columns: ["referrer_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pulse_credit_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          org_id: string
          reference_id: string | null
          reference_type: string | null
          type: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pulse_credit_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pulse_credit_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pulse_credit_wallets: {
        Row: {
          balance: number
          lifetime_earned: number
          lifetime_spent: number
          org_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          lifetime_earned?: number
          lifetime_spent?: number
          org_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          lifetime_earned?: number
          lifetime_spent?: number
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pulse_credit_wallets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pulse_credit_wallets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          organization_id: string
          rated_id: string
          rated_type: string
          rater_id: string
          rater_type: string
          score: number
          trip_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          organization_id: string
          rated_id: string
          rated_type: string
          rater_id: string
          rater_type: string
          score: number
          trip_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          rated_id?: string
          rated_type?: string
          rater_id?: string
          rater_type?: string
          score?: number
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      reach_campaign_daily_metrics: {
        Row: {
          bids: number
          campaign_id: string
          credits_used: number
          day: string
          impressions: number
          views: number
        }
        Insert: {
          bids?: number
          campaign_id: string
          credits_used?: number
          day: string
          impressions?: number
          views?: number
        }
        Update: {
          bids?: number
          campaign_id?: string
          credits_used?: number
          day?: string
          impressions?: number
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "reach_campaign_daily_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "reach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      reach_campaign_purchases: {
        Row: {
          amount_inr_charged: number
          campaign_id: string
          created_at: string
          credits_charged: number
          id: string
          payment_method: string
          plan_id: string
          status: string
        }
        Insert: {
          amount_inr_charged?: number
          campaign_id: string
          created_at?: string
          credits_charged?: number
          id?: string
          payment_method: string
          plan_id: string
          status?: string
        }
        Update: {
          amount_inr_charged?: number
          campaign_id?: string
          created_at?: string
          credits_charged?: number
          id?: string
          payment_method?: string
          plan_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reach_campaign_purchases_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "reach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_campaign_purchases_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "reach_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      reach_campaign_targets: {
        Row: {
          bid_at: string | null
          campaign_id: string
          converted_at: string | null
          id: string
          is_verified: boolean
          org_id: string
          released_at: string
          viewed_at: string | null
          wave: number
        }
        Insert: {
          bid_at?: string | null
          campaign_id: string
          converted_at?: string | null
          id?: string
          is_verified?: boolean
          org_id: string
          released_at?: string
          viewed_at?: string | null
          wave: number
        }
        Update: {
          bid_at?: string | null
          campaign_id?: string
          converted_at?: string | null
          id?: string
          is_verified?: boolean
          org_id?: string
          released_at?: string
          viewed_at?: string | null
          wave?: number
        }
        Relationships: [
          {
            foreignKeyName: "reach_campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "reach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_campaign_targets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_campaign_targets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reach_campaigns: {
        Row: {
          archived_at: string | null
          cancel_reason: string | null
          completed_at: string | null
          completion_reason: string | null
          created_at: string
          created_by: string
          distribution_channels: string[]
          driver_reward_enabled: boolean
          expires_at: string | null
          id: string
          metadata: Json
          org_id: string
          plan_id: string
          post_id: string | null
          published_at: string | null
          reward_amount: number
          reward_budget: number
          reward_paid: number
          reward_refunded: number
          reward_reserved: number
          reward_type: string
          scheduled_at: string | null
          snapshot_content: string | null
          snapshot_destination: string | null
          snapshot_material: string | null
          snapshot_origin: string | null
          snapshot_post_type: string | null
          snapshot_posted_at: string | null
          snapshot_rate_offer: number | null
          snapshot_source_indent_id: string | null
          snapshot_title: string | null
          snapshot_vehicle_type: string | null
          source_deleted_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          completion_reason?: string | null
          created_at?: string
          created_by: string
          distribution_channels?: string[]
          driver_reward_enabled?: boolean
          expires_at?: string | null
          id?: string
          metadata?: Json
          org_id: string
          plan_id: string
          post_id?: string | null
          published_at?: string | null
          reward_amount?: number
          reward_budget?: number
          reward_paid?: number
          reward_refunded?: number
          reward_reserved?: number
          reward_type?: string
          scheduled_at?: string | null
          snapshot_content?: string | null
          snapshot_destination?: string | null
          snapshot_material?: string | null
          snapshot_origin?: string | null
          snapshot_post_type?: string | null
          snapshot_posted_at?: string | null
          snapshot_rate_offer?: number | null
          snapshot_source_indent_id?: string | null
          snapshot_title?: string | null
          snapshot_vehicle_type?: string | null
          source_deleted_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          completion_reason?: string | null
          created_at?: string
          created_by?: string
          distribution_channels?: string[]
          driver_reward_enabled?: boolean
          expires_at?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          plan_id?: string
          post_id?: string | null
          published_at?: string | null
          reward_amount?: number
          reward_budget?: number
          reward_paid?: number
          reward_refunded?: number
          reward_reserved?: number
          reward_type?: string
          scheduled_at?: string | null
          snapshot_content?: string | null
          snapshot_destination?: string | null
          snapshot_material?: string | null
          snapshot_origin?: string | null
          snapshot_post_type?: string | null
          snapshot_posted_at?: string | null
          snapshot_rate_offer?: number | null
          snapshot_source_indent_id?: string | null
          snapshot_title?: string | null
          snapshot_vehicle_type?: string | null
          source_deleted_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reach_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_campaigns_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "reach_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_campaigns_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      reach_events: {
        Row: {
          actor_org_id: string | null
          actor_user_id: string | null
          campaign_id: string
          created_at: string
          event_type: string
          id: string
        }
        Insert: {
          actor_org_id?: string | null
          actor_user_id?: string | null
          campaign_id: string
          created_at?: string
          event_type: string
          id?: string
        }
        Update: {
          actor_org_id?: string | null
          actor_user_id?: string | null
          campaign_id?: string
          created_at?: string
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reach_events_actor_org_id_fkey"
            columns: ["actor_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_events_actor_org_id_fkey"
            columns: ["actor_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "reach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      reach_plans: {
        Row: {
          audience_scope: string
          code: string
          created_at: string
          credit_price: number
          duration_hours: number
          estimated_reach_max: number
          estimated_reach_min: number
          id: string
          is_active: boolean
          name: string
          price_inr: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          audience_scope?: string
          code: string
          created_at?: string
          credit_price: number
          duration_hours?: number
          estimated_reach_max: number
          estimated_reach_min: number
          id?: string
          is_active?: boolean
          name: string
          price_inr: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          audience_scope?: string
          code?: string
          created_at?: string
          credit_price?: number
          duration_hours?: number
          estimated_reach_max?: number
          estimated_reach_min?: number
          id?: string
          is_active?: boolean
          name?: string
          price_inr?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      reach_referrals: {
        Row: {
          bid_id: string | null
          campaign_id: string
          created_at: string
          decided_at: string | null
          driver_user_id: string
          fleet_org_id: string
          id: string
          note: string | null
          reason: string | null
          reward_amount: number
          rewarded_at: string | null
          status: string
          suggested_rate: number | null
          trip_id: string | null
        }
        Insert: {
          bid_id?: string | null
          campaign_id: string
          created_at?: string
          decided_at?: string | null
          driver_user_id: string
          fleet_org_id: string
          id?: string
          note?: string | null
          reason?: string | null
          reward_amount?: number
          rewarded_at?: string | null
          status?: string
          suggested_rate?: number | null
          trip_id?: string | null
        }
        Update: {
          bid_id?: string | null
          campaign_id?: string
          created_at?: string
          decided_at?: string | null
          driver_user_id?: string
          fleet_org_id?: string
          id?: string
          note?: string | null
          reason?: string | null
          reward_amount?: number
          rewarded_at?: string | null
          status?: string
          suggested_rate?: number | null
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reach_referrals_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_referrals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "reach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_referrals_fleet_org_id_fkey"
            columns: ["fleet_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_referrals_fleet_org_id_fkey"
            columns: ["fleet_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_referrals_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_referrals_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_referrals_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_referrals_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_referrals_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_referrals_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      reward_rules: {
        Row: {
          created_at: string
          credit_amount: number
          id: string
          is_active: boolean
          key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_amount: number
          id?: string
          is_active?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_amount?: number
          id?: string
          is_active?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      rpc_rate_limits: {
        Row: {
          created_at: string
          id: string
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          scope: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      sales_order_lines: {
        Row: {
          allocated_quantity: number
          created_at: string
          id: string
          line_total: number
          organization_id: string
          product_id: string
          quantity: number
          sales_order_id: string
          tax_rate: number
          unit_price: number
          volume_m3: number
          weight_kg: number
        }
        Insert: {
          allocated_quantity?: number
          created_at?: string
          id?: string
          line_total?: number
          organization_id: string
          product_id: string
          quantity: number
          sales_order_id: string
          tax_rate?: number
          unit_price?: number
          volume_m3?: number
          weight_kg?: number
        }
        Update: {
          allocated_quantity?: number
          created_at?: string
          id?: string
          line_total?: number
          organization_id?: string
          product_id?: string
          quantity?: number
          sales_order_id?: string
          tax_rate?: number
          unit_price?: number
          volume_m3?: number
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          deleted_at: string | null
          delivery_window_end: string | null
          delivery_window_start: string | null
          drop_warehouse_id: string | null
          execution_plan_id: string | null
          expected_dispatch_date: string | null
          id: string
          notes: string | null
          order_number: string
          organization_id: string
          pickup_warehouse_id: string
          priority: string
          source: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          total_volume_m3: number
          total_weight_kg: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          deleted_at?: string | null
          delivery_window_end?: string | null
          delivery_window_start?: string | null
          drop_warehouse_id?: string | null
          execution_plan_id?: string | null
          expected_dispatch_date?: string | null
          id?: string
          notes?: string | null
          order_number: string
          organization_id: string
          pickup_warehouse_id: string
          priority?: string
          source?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          total_volume_m3?: number
          total_weight_kg?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          deleted_at?: string | null
          delivery_window_end?: string | null
          delivery_window_start?: string | null
          drop_warehouse_id?: string | null
          execution_plan_id?: string | null
          expected_dispatch_date?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          organization_id?: string
          pickup_warehouse_id?: string
          priority?: string
          source?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          total_volume_m3?: number
          total_weight_kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_drop_warehouse_id_fkey"
            columns: ["drop_warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_pickup_warehouse_id_fkey"
            columns: ["pickup_warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      search_index: {
        Row: {
          display_name: string | null
          entity_id: string
          entity_type: string
          id: string
          location_text: string | null
          network_ref: string | null
          org_id: string | null
          phone: string | null
          reference: string | null
          relevance_boost: number
          search_vector: unknown
          secondary_ref: string | null
          tags: string[] | null
          updated_at: string
          vehicle_number: string | null
        }
        Insert: {
          display_name?: string | null
          entity_id: string
          entity_type: string
          id?: string
          location_text?: string | null
          network_ref?: string | null
          org_id?: string | null
          phone?: string | null
          reference?: string | null
          relevance_boost?: number
          search_vector?: unknown
          secondary_ref?: string | null
          tags?: string[] | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Update: {
          display_name?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          location_text?: string | null
          network_ref?: string | null
          org_id?: string | null
          phone?: string | null
          reference?: string | null
          relevance_boost?: number
          search_vector?: unknown
          secondary_ref?: string | null
          tags?: string[] | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: []
      }
      shared_ledger_connection: {
        Row: {
          created_at: string
          id: string
          org_a_id: string
          org_b_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_a_id: string
          org_b_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_a_id?: string
          org_b_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_ledger_connection_org_a_id_fkey"
            columns: ["org_a_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_connection_org_a_id_fkey"
            columns: ["org_a_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_connection_org_b_id_fkey"
            columns: ["org_b_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_connection_org_b_id_fkey"
            columns: ["org_b_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_ledger_notifications: {
        Row: {
          amount_meta: number | null
          created_at: string
          dedupe_key: string | null
          event_type: string
          handled_at: string | null
          handled_by_user_id: string | null
          id: string
          organization_id: string
          partner_key: string | null
          partner_org_id: string | null
          payload_json: Json
          read_at: string | null
          source_dispute_id: string | null
          status: string
          subtitle: string | null
          title: string
          transaction_id: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          amount_meta?: number | null
          created_at?: string
          dedupe_key?: string | null
          event_type: string
          handled_at?: string | null
          handled_by_user_id?: string | null
          id?: string
          organization_id: string
          partner_key?: string | null
          partner_org_id?: string | null
          payload_json?: Json
          read_at?: string | null
          source_dispute_id?: string | null
          status?: string
          subtitle?: string | null
          title: string
          transaction_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_meta?: number | null
          created_at?: string
          dedupe_key?: string | null
          event_type?: string
          handled_at?: string | null
          handled_by_user_id?: string | null
          id?: string
          organization_id?: string
          partner_key?: string | null
          partner_org_id?: string | null
          payload_json?: Json
          read_at?: string | null
          source_dispute_id?: string | null
          status?: string
          subtitle?: string | null
          title?: string
          transaction_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_ledger_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_notifications_partner_org_id_fkey"
            columns: ["partner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_notifications_partner_org_id_fkey"
            columns: ["partner_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_notifications_source_dispute_id_fkey"
            columns: ["source_dispute_id"]
            isOneToOne: false
            referencedRelation: "dispute"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_allocations: {
        Row: {
          created_at: string
          drop_stop_id: string
          execution_plan_id: string
          id: string
          organization_id: string
          pickup_stop_id: string
          quantity: number
          sales_order_line_id: string
          volume_m3: number
          weight_kg: number
        }
        Insert: {
          created_at?: string
          drop_stop_id: string
          execution_plan_id: string
          id?: string
          organization_id: string
          pickup_stop_id: string
          quantity: number
          sales_order_line_id: string
          volume_m3?: number
          weight_kg?: number
        }
        Update: {
          created_at?: string
          drop_stop_id?: string
          execution_plan_id?: string
          id?: string
          organization_id?: string
          pickup_stop_id?: string
          quantity?: number
          sales_order_line_id?: string
          volume_m3?: number
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "shipment_allocations_drop_stop_id_fkey"
            columns: ["drop_stop_id"]
            isOneToOne: false
            referencedRelation: "execution_plan_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_allocations_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_allocations_pickup_stop_id_fkey"
            columns: ["pickup_stop_id"]
            isOneToOne: false
            referencedRelation: "execution_plan_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_allocations_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      stop_execution_state: {
        Row: {
          arrived_at: string | null
          completed_at: string | null
          created_at: string
          driver_id: string | null
          failure_reason: string | null
          id: string
          sequence: number
          skip_reason: string | null
          status: string
          stop_id: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
          driver_id?: string | null
          failure_reason?: string | null
          id?: string
          sequence: number
          skip_reason?: string | null
          status?: string
          stop_id: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
          driver_id?: string | null
          failure_reason?: string | null
          id?: string
          sequence?: number
          skip_reason?: string | null
          status?: string
          stop_id?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stop_execution_state_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "stop_execution_state_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_execution_state_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "stop_execution_state_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "execution_plan_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_execution_state_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_execution_state_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_execution_state_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_execution_state_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_execution_state_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_execution_state_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      story_views: {
        Row: {
          id: string
          post_id: string
          viewed_at: string
          viewer_org_id: string
          viewer_org_name: string | null
          viewer_user_id: string
        }
        Insert: {
          id?: string
          post_id: string
          viewed_at?: string
          viewer_org_id: string
          viewer_org_name?: string | null
          viewer_user_id: string
        }
        Update: {
          id?: string
          post_id?: string
          viewed_at?: string
          viewer_org_id?: string
          viewer_org_name?: string | null
          viewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_org_id_fkey"
            columns: ["viewer_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_org_id_fkey"
            columns: ["viewer_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontract_counters: {
        Row: {
          seq: number
          sourcing_org_id: string
        }
        Insert: {
          seq?: number
          sourcing_org_id: string
        }
        Update: {
          seq?: number
          sourcing_org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontract_counters_sourcing_org_id_fkey"
            columns: ["sourcing_org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_counters_sourcing_org_id_fkey"
            columns: ["sourcing_org_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_bills: {
        Row: {
          advance_paid: number
          approved_at: string | null
          approved_by: string | null
          balance_payable: number | null
          bill_date: string
          bill_number: string
          created_at: string
          created_by: string | null
          gross_amount: number
          id: string
          net_payable: number
          notes: string | null
          org_id: string
          status: string
          supplier_id: string | null
          supplier_name: string | null
          tds_amount: number
          tds_percent: number
          trip_ids: string[]
          updated_at: string
        }
        Insert: {
          advance_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          balance_payable?: number | null
          bill_date?: string
          bill_number: string
          created_at?: string
          created_by?: string | null
          gross_amount?: number
          id?: string
          net_payable?: number
          notes?: string | null
          org_id: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tds_amount?: number
          tds_percent?: number
          trip_ids?: string[]
          updated_at?: string
        }
        Update: {
          advance_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          balance_payable?: number | null
          bill_date?: string
          bill_number?: string
          created_at?: string
          created_by?: string | null
          gross_amount?: number
          id?: string
          net_payable?: number
          notes?: string | null
          org_id?: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tds_amount?: number
          tds_percent?: number
          trip_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_compliance_documents: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          doc_type: string
          expiry_date: string | null
          file_name: string | null
          id: string
          label: string
          notes: string | null
          organization_id: string
          status: string
          storage_path: string | null
          supplier_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_type: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          label: string
          notes?: string | null
          organization_id: string
          status?: string
          storage_path?: string | null
          supplier_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_type?: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          label?: string
          notes?: string | null
          organization_id?: string
          status?: string
          storage_path?: string | null
          supplier_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_compliance_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_compliance_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_compliance_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          designation: string | null
          email: string | null
          id: string
          is_dispatch: boolean
          is_finance: boolean
          is_operations: boolean
          is_primary: boolean
          mobile: string | null
          name: string
          notes: string | null
          organization_id: string
          supplier_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_dispatch?: boolean
          is_finance?: boolean
          is_operations?: boolean
          is_primary?: boolean
          mobile?: string | null
          name: string
          notes?: string | null
          organization_id: string
          supplier_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_dispatch?: boolean
          is_finance?: boolean
          is_operations?: boolean
          is_primary?: boolean
          mobile?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          supplier_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contract_agreements: {
        Row: {
          contract_number: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          effective_date: string | null
          expiry_date: string | null
          general_terms: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_terms: Json | null
          rate_type: string | null
          signed_storage_path: string | null
          sla_terms: Json | null
          status: string
          supplier_id: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contract_number: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          general_terms?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_terms?: Json | null
          rate_type?: string | null
          signed_storage_path?: string | null
          sla_terms?: Json | null
          status?: string
          supplier_id: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contract_number?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          general_terms?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_terms?: Json | null
          rate_type?: string | null
          signed_storage_path?: string | null
          sla_terms?: Json | null
          status?: string
          supplier_id?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contract_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contract_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contract_agreements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_fleet: {
        Row: {
          capacity_tons: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          driver_id: string | null
          fitness_expiry: string | null
          has_gps: boolean
          id: string
          insurance_expiry: string | null
          notes: string | null
          organization_id: string
          ownership: string
          permit_expiry: string | null
          supplier_id: string
          updated_at: string
          vehicle_number: string
          vehicle_type: string | null
        }
        Insert: {
          capacity_tons?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          fitness_expiry?: string | null
          has_gps?: boolean
          id?: string
          insurance_expiry?: string | null
          notes?: string | null
          organization_id: string
          ownership?: string
          permit_expiry?: string | null
          supplier_id: string
          updated_at?: string
          vehicle_number: string
          vehicle_type?: string | null
        }
        Update: {
          capacity_tons?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          fitness_expiry?: string | null
          has_gps?: boolean
          id?: string
          insurance_expiry?: string | null
          notes?: string | null
          organization_id?: string
          ownership?: string
          permit_expiry?: string | null
          supplier_id?: string
          updated_at?: string
          vehicle_number?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_fleet_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "supplier_fleet_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_fleet_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "supplier_fleet_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_fleet_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_fleet_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_kyc_documents: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          doc_label: string | null
          doc_type: string
          expiry_date: string | null
          file_name: string | null
          id: string
          is_mandatory: boolean
          mime_type: string | null
          notes: string | null
          organization_id: string
          status: string
          storage_path: string | null
          supplier_id: string
          updated_at: string
          updated_by: string | null
          verified_at: string | null
          verified_by: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_label?: string | null
          doc_type: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          notes?: string | null
          organization_id: string
          status?: string
          storage_path?: string | null
          supplier_id: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version_number?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_label?: string | null
          doc_type?: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          notes?: string | null
          organization_id?: string
          status?: string
          storage_path?: string | null
          supplier_id?: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_kyc_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_kyc_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_kyc_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_trip_counters: {
        Row: {
          seq: number
          supplier_org_id: string
        }
        Insert: {
          seq?: number
          supplier_org_id: string
        }
        Update: {
          seq?: number
          supplier_org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_trip_counters_supplier_org_id_fkey"
            columns: ["supplier_org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_trip_counters_supplier_org_id_fkey"
            columns: ["supplier_org_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_warehouses: {
        Row: {
          address: string | null
          city: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          loading_bays: number | null
          name: string
          notes: string | null
          organization_id: string
          pincode: string | null
          state: string | null
          storage_capacity_tons: number | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          loading_bays?: number | null
          name: string
          notes?: string | null
          organization_id: string
          pincode?: string | null
          state?: string | null
          storage_capacity_tons?: number | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          loading_bays?: number | null
          name?: string
          notes?: string | null
          organization_id?: string
          pincode?: string | null
          state?: string | null
          storage_capacity_tons?: number | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_warehouses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          avatar_seed: string | null
          avatar_url: string | null
          cin: string | null
          company_name: string | null
          contact: string | null
          contact_person: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          gst_number: string | null
          gstin: string | null
          id: string
          iec_number: string | null
          is_active: boolean
          is_verified: boolean
          linked_organization_id: string | null
          msme_number: string | null
          name: string | null
          onboarding_agreement_notes: string | null
          onboarding_agreement_signed_at: string | null
          onboarding_agreement_status: string | null
          onboarding_agreement_storage_path: string | null
          operating_areas: string[] | null
          organization_id: string
          owner_full_name: string | null
          pan_number: string | null
          phone: string | null
          supplier_type: string | null
          tan_number: string | null
          updated_at: string | null
          vehicle_types: string[] | null
        }
        Insert: {
          address?: string | null
          avatar_seed?: string | null
          avatar_url?: string | null
          cin?: string | null
          company_name?: string | null
          contact?: string | null
          contact_person?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          gst_number?: string | null
          gstin?: string | null
          id?: string
          iec_number?: string | null
          is_active?: boolean
          is_verified?: boolean
          linked_organization_id?: string | null
          msme_number?: string | null
          name?: string | null
          onboarding_agreement_notes?: string | null
          onboarding_agreement_signed_at?: string | null
          onboarding_agreement_status?: string | null
          onboarding_agreement_storage_path?: string | null
          operating_areas?: string[] | null
          organization_id: string
          owner_full_name?: string | null
          pan_number?: string | null
          phone?: string | null
          supplier_type?: string | null
          tan_number?: string | null
          updated_at?: string | null
          vehicle_types?: string[] | null
        }
        Update: {
          address?: string | null
          avatar_seed?: string | null
          avatar_url?: string | null
          cin?: string | null
          company_name?: string | null
          contact?: string | null
          contact_person?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          gst_number?: string | null
          gstin?: string | null
          id?: string
          iec_number?: string | null
          is_active?: boolean
          is_verified?: boolean
          linked_organization_id?: string | null
          msme_number?: string | null
          name?: string | null
          onboarding_agreement_notes?: string | null
          onboarding_agreement_signed_at?: string | null
          onboarding_agreement_status?: string | null
          onboarding_agreement_storage_path?: string | null
          operating_areas?: string[] | null
          organization_id?: string
          owner_full_name?: string | null
          pan_number?: string | null
          phone?: string | null
          supplier_type?: string | null
          tan_number?: string | null
          updated_at?: string | null
          vehicle_types?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_linked_organization_id_fkey"
            columns: ["linked_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_linked_organization_id_fkey"
            columns: ["linked_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_activity: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          detail: string | null
          id: string
          ticket_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          ticket_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_activity_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_attachments: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          ticket_id: string
          uploaded_by_user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          ticket_id: string
          uploaded_by_user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          ticket_id?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "support_ticket_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_comments: {
        Row: {
          author_type: string
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          ticket_id: string
          visibility: string
        }
        Insert: {
          author_type?: string
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          ticket_id: string
          visibility?: string
        }
        Update: {
          author_type?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          agent_last_read_at: string | null
          assigned_to: string | null
          category: string
          closed_at: string | null
          created_at: string
          created_by_user_id: string
          description: string
          display_id: string
          id: string
          indent_id: string | null
          last_public_activity_at: string
          last_public_author_type: string
          market_bid_id: string | null
          organization_id: string | null
          organization_name: string | null
          owner_vehicle_id: string | null
          priority: string
          reporter_display_name: string | null
          resolved_at: string | null
          source_screen: string | null
          status: string
          subject: string
          trip_id: string | null
          updated_at: string
          user_last_read_at: string | null
        }
        Insert: {
          agent_last_read_at?: string | null
          assigned_to?: string | null
          category: string
          closed_at?: string | null
          created_at?: string
          created_by_user_id: string
          description: string
          display_id: string
          id?: string
          indent_id?: string | null
          last_public_activity_at?: string
          last_public_author_type?: string
          market_bid_id?: string | null
          organization_id?: string | null
          organization_name?: string | null
          owner_vehicle_id?: string | null
          priority?: string
          reporter_display_name?: string | null
          resolved_at?: string | null
          source_screen?: string | null
          status?: string
          subject: string
          trip_id?: string | null
          updated_at?: string
          user_last_read_at?: string | null
        }
        Update: {
          agent_last_read_at?: string | null
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          description?: string
          display_id?: string
          id?: string
          indent_id?: string | null
          last_public_activity_at?: string
          last_public_author_type?: string
          market_bid_id?: string | null
          organization_id?: string | null
          organization_name?: string | null
          owner_vehicle_id?: string | null
          priority?: string
          reporter_display_name?: string | null
          resolved_at?: string | null
          source_screen?: string | null
          status?: string
          subject?: string
          trip_id?: string | null
          updated_at?: string
          user_last_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_market_bid_id_fkey"
            columns: ["market_bid_id"]
            isOneToOne: false
            referencedRelation: "market_bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_owner_vehicle_id_fkey"
            columns: ["owner_vehicle_id"]
            isOneToOne: false
            referencedRelation: "owner_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_in: number
          amount_out: number
          booking_ref: string | null
          chat_mirror_of_transaction_id: string | null
          contact_id: string | null
          contact_type: string | null
          created_at: string | null
          created_by: string | null
          description: string
          id: string
          is_opening_balance: boolean
          ledger_category: string | null
          ledger_entity_type: string | null
          ledger_flow_type: string | null
          organization_id: string
          party_name: string
          payment_ref: string | null
          payment_reference: string | null
          transaction_date: string
          trip_id: string | null
        }
        Insert: {
          amount_in?: number
          amount_out?: number
          booking_ref?: string | null
          chat_mirror_of_transaction_id?: string | null
          contact_id?: string | null
          contact_type?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          is_opening_balance?: boolean
          ledger_category?: string | null
          ledger_entity_type?: string | null
          ledger_flow_type?: string | null
          organization_id: string
          party_name: string
          payment_ref?: string | null
          payment_reference?: string | null
          transaction_date?: string
          trip_id?: string | null
        }
        Update: {
          amount_in?: number
          amount_out?: number
          booking_ref?: string | null
          chat_mirror_of_transaction_id?: string | null
          contact_id?: string | null
          contact_type?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          is_opening_balance?: boolean
          ledger_category?: string | null
          ledger_entity_type?: string | null
          ledger_flow_type?: string | null
          organization_id?: string
          party_name?: string
          payment_ref?: string | null
          payment_reference?: string | null
          transaction_date?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_booking_ref_fkey"
            columns: ["booking_ref"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["booking_ref"]
          },
          {
            foreignKeyName: "transactions_booking_ref_fkey"
            columns: ["booking_ref"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["booking_ref"]
          },
          {
            foreignKeyName: "transactions_chat_mirror_of_transaction_id_fkey"
            columns: ["chat_mirror_of_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_assignment_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          driver_id_new: string | null
          driver_id_prev: string | null
          event_type: string
          id: string
          trip_id: string
          vehicle_id_new: string | null
          vehicle_id_prev: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          driver_id_new?: string | null
          driver_id_prev?: string | null
          event_type: string
          id?: string
          trip_id: string
          vehicle_id_new?: string | null
          vehicle_id_prev?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          driver_id_new?: string | null
          driver_id_prev?: string | null
          event_type?: string
          id?: string
          trip_id?: string
          vehicle_id_new?: string | null
          vehicle_id_prev?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_assignment_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_driver_id_new_fkey"
            columns: ["driver_id_new"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_driver_id_new_fkey"
            columns: ["driver_id_new"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_driver_id_new_fkey"
            columns: ["driver_id_new"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_driver_id_prev_fkey"
            columns: ["driver_id_prev"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_driver_id_prev_fkey"
            columns: ["driver_id_prev"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_driver_id_prev_fkey"
            columns: ["driver_id_prev"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_vehicle_id_new_fkey"
            columns: ["vehicle_id_new"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_vehicle_id_prev_fkey"
            columns: ["vehicle_id_prev"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_conversations: {
        Row: {
          client_id: string | null
          created_at: string
          driver_id: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          organization_id: string
          party_name: string
          party_type: string
          supplier_id: string | null
          trip_id: string
          unread_dispatcher_count: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          organization_id: string
          party_name: string
          party_type: string
          supplier_id?: string | null
          trip_id: string
          unread_dispatcher_count?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          organization_id?: string
          party_name?: string
          party_type?: string
          supplier_id?: string | null
          trip_id?: string
          unread_dispatcher_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_conversations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_conversations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_documents: {
        Row: {
          document_number: string | null
          document_type: string
          file_name: string
          id: string
          mime_type: string | null
          ocr_job_id: string | null
          rejection_reason: string | null
          size_bytes: number | null
          source_entity_document_id: string | null
          status: string
          stop_id: string | null
          storage_path: string
          trip_id: string
          uploaded_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          document_number?: string | null
          document_type?: string
          file_name: string
          id?: string
          mime_type?: string | null
          ocr_job_id?: string | null
          rejection_reason?: string | null
          size_bytes?: number | null
          source_entity_document_id?: string | null
          status?: string
          stop_id?: string | null
          storage_path: string
          trip_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          document_number?: string | null
          document_type?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          ocr_job_id?: string | null
          rejection_reason?: string | null
          size_bytes?: number | null
          source_entity_document_id?: string | null
          status?: string
          stop_id?: string | null
          storage_path?: string
          trip_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_documents_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_source_entity_document_id_fkey"
            columns: ["source_entity_document_id"]
            isOneToOne: false
            referencedRelation: "entity_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "execution_plan_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_finance_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          impact: string
          mission_key: string | null
          organization_id: string
          reason: string
          trip_id: string
          type: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          impact: string
          mission_key?: string | null
          organization_id: string
          reason: string
          trip_id: string
          type: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          impact?: string
          mission_key?: string | null
          organization_id?: string
          reason?: string
          trip_id?: string
          type?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_finance_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_fuel_entries: {
        Row: {
          amount_inr: number
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          bill_storage_path: string | null
          entered_at: string
          entered_by: string | null
          fuel_type: string | null
          id: string
          idempotency_key: string | null
          last_retry_at: string | null
          ledger_state: string
          liters: number | null
          notes: string | null
          ocr_job_id: string | null
          payment_mode: string | null
          payment_owner: string
          posting_error: string | null
          posting_state: string
          reimbursed_at: string | null
          reimbursed_by: string | null
          reimbursement_notes: string | null
          reimbursement_state: string
          reimbursement_updated_at: string | null
          retry_count: number
          source: string
          station_name: string | null
          status: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          bill_storage_path?: string | null
          entered_at?: string
          entered_by?: string | null
          fuel_type?: string | null
          id?: string
          idempotency_key?: string | null
          last_retry_at?: string | null
          ledger_state?: string
          liters?: number | null
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          posting_error?: string | null
          posting_state?: string
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          station_name?: string | null
          status?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          bill_storage_path?: string | null
          entered_at?: string
          entered_by?: string | null
          fuel_type?: string | null
          id?: string
          idempotency_key?: string | null
          last_retry_at?: string | null
          ledger_state?: string
          liters?: number | null
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          posting_error?: string | null
          posting_state?: string
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          station_name?: string | null
          status?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_fuel_entries_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_fuel_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_fuel_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_fuel_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_fuel_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_fuel_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_fuel_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_location_checkpoints: {
        Row: {
          accuracy: number | null
          distance_delta_m: number | null
          driver_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          organization_id: string
          recorded_at: string
          session_id: string | null
          source: string
          speed_kmh: number | null
          trip_id: string
        }
        Insert: {
          accuracy?: number | null
          distance_delta_m?: number | null
          driver_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          organization_id: string
          recorded_at?: string
          session_id?: string | null
          source?: string
          speed_kmh?: number | null
          trip_id: string
        }
        Update: {
          accuracy?: number | null
          distance_delta_m?: number | null
          driver_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          organization_id?: string
          recorded_at?: string
          session_id?: string | null
          source?: string
          speed_kmh?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_location_checkpoints_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trip_tracking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_location_checkpoints_default: {
        Row: {
          accuracy: number | null
          distance_delta_m: number | null
          driver_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          organization_id: string
          recorded_at: string
          session_id: string | null
          source: string
          speed_kmh: number | null
          trip_id: string
        }
        Insert: {
          accuracy?: number | null
          distance_delta_m?: number | null
          driver_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          organization_id: string
          recorded_at?: string
          session_id?: string | null
          source?: string
          speed_kmh?: number | null
          trip_id: string
        }
        Update: {
          accuracy?: number | null
          distance_delta_m?: number | null
          driver_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          organization_id?: string
          recorded_at?: string
          session_id?: string | null
          source?: string
          speed_kmh?: number | null
          trip_id?: string
        }
        Relationships: []
      }
      trip_messages: {
        Row: {
          content: string
          context_indent_id: string | null
          context_trip_id: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean
          is_delivered: boolean
          is_read: boolean
          message_type: string
          metadata: Json | null
          organization_id: string
          priority_weight: number
          reactions: Json | null
          read_at: string | null
          reply_to_id: string | null
          reply_to_preview: Json | null
          sender_avatar_seed: string | null
          sender_name: string
          sender_role: string
          sender_user_id: string | null
          visibility_tags: Json | null
        }
        Insert: {
          content: string
          context_indent_id?: string | null
          context_trip_id?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean
          is_delivered?: boolean
          is_read?: boolean
          message_type?: string
          metadata?: Json | null
          organization_id: string
          priority_weight?: number
          reactions?: Json | null
          read_at?: string | null
          reply_to_id?: string | null
          reply_to_preview?: Json | null
          sender_avatar_seed?: string | null
          sender_name: string
          sender_role: string
          sender_user_id?: string | null
          visibility_tags?: Json | null
        }
        Update: {
          content?: string
          context_indent_id?: string | null
          context_trip_id?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean
          is_delivered?: boolean
          is_read?: boolean
          message_type?: string
          metadata?: Json | null
          organization_id?: string
          priority_weight?: number
          reactions?: Json | null
          read_at?: string | null
          reply_to_id?: string | null
          reply_to_preview?: Json | null
          sender_avatar_seed?: string | null
          sender_name?: string
          sender_role?: string
          sender_user_id?: string | null
          visibility_tags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_messages_context_indent_id_fkey"
            columns: ["context_indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_indent_id_fkey"
            columns: ["context_indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_trip_id_fkey"
            columns: ["context_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_trip_id_fkey"
            columns: ["context_trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_trip_id_fkey"
            columns: ["context_trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_trip_id_fkey"
            columns: ["context_trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_trip_id_fkey"
            columns: ["context_trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_trip_id_fkey"
            columns: ["context_trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "trip_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "trip_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "trip_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "trip_messages_archive_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_operational_timeline_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          organization_id: string
          payload: Json
          source_id: string | null
          source_type: string | null
          trip_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          organization_id: string
          payload?: Json
          source_id?: string | null
          source_type?: string | null
          trip_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string
          payload?: Json
          source_id?: string | null
          source_type?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_operational_timeline_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_other_expenses: {
        Row: {
          amount_inr: number
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          description: string | null
          entered_at: string
          entered_by: string | null
          expense_category: string
          id: string
          last_retry_at: string | null
          ledger_state: string
          location_name: string | null
          notes: string | null
          ocr_job_id: string | null
          payment_mode: string | null
          payment_owner: string
          posting_error: string | null
          posting_state: string
          receipt_storage_path: string | null
          reimbursed_at: string | null
          reimbursed_by: string | null
          reimbursement_notes: string | null
          reimbursement_state: string
          reimbursement_updated_at: string | null
          retry_count: number
          source: string
          status: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          description?: string | null
          entered_at?: string
          entered_by?: string | null
          expense_category: string
          id?: string
          last_retry_at?: string | null
          ledger_state?: string
          location_name?: string | null
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          posting_error?: string | null
          posting_state?: string
          receipt_storage_path?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          status?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          description?: string | null
          entered_at?: string
          entered_by?: string | null
          expense_category?: string
          id?: string
          last_retry_at?: string | null
          ledger_state?: string
          location_name?: string | null
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          posting_error?: string | null
          posting_state?: string
          receipt_storage_path?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          status?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_other_expenses_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_other_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_other_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_other_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_other_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_other_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_other_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_otps: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string
          failed_attempts: number
          id: string
          trip_id: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at: string
          failed_attempts?: number
          id?: string
          trip_id: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string
          failed_attempts?: number
          id?: string
          trip_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_otps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_otps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_otps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_otps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_otps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_otps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_predictions: {
        Row: {
          confidence_score: number
          created_at: string
          id: string
          organization_id: string
          predicted_cost: number
          predicted_profit: number
          risk_flag: string
          trip_id: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          id?: string
          organization_id: string
          predicted_cost?: number
          predicted_profit?: number
          risk_flag?: string
          trip_id: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          id?: string
          organization_id?: string
          predicted_cost?: number
          predicted_profit?: number
          risk_flag?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_predictions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_predictions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_status_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          org_id: string | null
          status_from: string | null
          status_to: string
          trip_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          org_id?: string | null
          status_from?: string | null
          status_to: string
          trip_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          org_id?: string | null
          status_from?: string | null
          status_to?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_status_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_status_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_status_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_status_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_status_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_status_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_status_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_status_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_subcontracts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          rate: number
          status: string
          sub_driver_id: string | null
          sub_supplier_name: string | null
          sub_supplier_on_platform: boolean
          sub_supplier_org_id: string | null
          sub_supplier_phone: string | null
          sub_trip_code: string | null
          supplier_id: string | null
          trip_id: string
          updated_at: string
          viewer_org_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          rate?: number
          status?: string
          sub_driver_id?: string | null
          sub_supplier_name?: string | null
          sub_supplier_on_platform?: boolean
          sub_supplier_org_id?: string | null
          sub_supplier_phone?: string | null
          sub_trip_code?: string | null
          supplier_id?: string | null
          trip_id: string
          updated_at?: string
          viewer_org_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          rate?: number
          status?: string
          sub_driver_id?: string | null
          sub_supplier_name?: string | null
          sub_supplier_on_platform?: boolean
          sub_supplier_org_id?: string | null
          sub_supplier_phone?: string | null
          sub_trip_code?: string | null
          supplier_id?: string | null
          trip_id?: string
          updated_at?: string
          viewer_org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_subcontracts_sub_driver_id_fkey"
            columns: ["sub_driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_subcontracts_sub_driver_id_fkey"
            columns: ["sub_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_subcontracts_sub_driver_id_fkey"
            columns: ["sub_driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_subcontracts_sub_supplier_org_id_fkey"
            columns: ["sub_supplier_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_subcontracts_sub_supplier_org_id_fkey"
            columns: ["sub_supplier_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_subcontracts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_subcontracts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_subcontracts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_subcontracts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_subcontracts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_subcontracts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_subcontracts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "trip_subcontracts_viewer_org_id_fkey"
            columns: ["viewer_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_subcontracts_viewer_org_id_fkey"
            columns: ["viewer_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_toll_entries: {
        Row: {
          amount_inr: number
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          entered_at: string
          entered_by: string | null
          id: string
          idempotency_key: string | null
          is_estimated: boolean
          last_retry_at: string | null
          ledger_state: string
          notes: string | null
          ocr_job_id: string | null
          payment_mode: string | null
          payment_owner: string
          plaza_name: string | null
          posting_error: string | null
          posting_state: string
          receipt_storage_path: string | null
          reimbursed_at: string | null
          reimbursed_by: string | null
          reimbursement_notes: string | null
          reimbursement_state: string
          reimbursement_updated_at: string | null
          retry_count: number
          source: string
          status: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          entered_at?: string
          entered_by?: string | null
          id?: string
          idempotency_key?: string | null
          is_estimated?: boolean
          last_retry_at?: string | null
          ledger_state?: string
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          plaza_name?: string | null
          posting_error?: string | null
          posting_state?: string
          receipt_storage_path?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          status?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          entered_at?: string
          entered_by?: string | null
          id?: string
          idempotency_key?: string | null
          is_estimated?: boolean
          last_retry_at?: string | null
          ledger_state?: string
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          plaza_name?: string | null
          posting_error?: string | null
          posting_state?: string
          receipt_storage_path?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          status?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_toll_entries_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_toll_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_toll_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_toll_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_toll_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_toll_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_toll_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_tracking_sessions: {
        Row: {
          device_id: string | null
          driver_id: string
          ended_at: string | null
          id: string
          is_active: boolean
          last_heartbeat: string
          organization_id: string
          started_at: string
          trip_id: string
        }
        Insert: {
          device_id?: string | null
          driver_id: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          last_heartbeat?: string
          organization_id: string
          started_at?: string
          trip_id: string
        }
        Update: {
          device_id?: string | null
          driver_id?: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          last_heartbeat?: string
          organization_id?: string
          started_at?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_tracking_sessions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_workflow_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          idempotency_key: string | null
          org_id: string
          payload: Json
          trip_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          org_id: string
          payload?: Json
          trip_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          org_id?: string
          payload?: Json
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_workflow_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trips: {
        Row: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          compliance_decision: string | null
          compliance_exception_reason: string | null
          compliance_outstanding_summary: Json | null
          compliance_verified_at: string | null
          compliance_verified_by: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          dco_payee_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          execution_type: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          lane_id: string | null
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          operating_mode: string
          organization_id: string
          owner_user_id: string | null
          owner_vehicle_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          platform_fee_calc_snapshot: Json | null
          pod_hard_copy_awb_number: string | null
          pod_hard_copy_courier: string | null
          pod_hard_copy_received_by: string | null
          pod_received_at: string | null
          pod_required: boolean
          sale_rate_basis: string | null
          sale_unit_rate: number | null
          sequence_number: number | null
          source: string
          source_bid_id: string | null
          source_indent_code: string | null
          source_indent_id: string | null
          source_market_bid_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          supplier_rate_basis: string | null
          supplier_trip_sequence: number | null
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }
        Insert: {
          actual_distance_traveled_km?: number | null
          advance_paid?: number
          amount_paid?: number
          assigned_by_user_id?: string | null
          booking_ref?: string | null
          client_id?: string | null
          client_name: string
          client_price?: number
          completed_at?: string | null
          compliance_decision?: string | null
          compliance_exception_reason?: string | null
          compliance_outstanding_summary?: Json | null
          compliance_verified_at?: string | null
          compliance_verified_by?: string | null
          converted_by?: string | null
          converted_from_indent_at?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          dco_payee_id?: string | null
          deleted_at?: string | null
          display_trip_id?: string | null
          distance?: number | null
          distance_discrepancy_km?: number | null
          distance_source?: string | null
          driver_commission?: number
          driver_display_name?: string | null
          driver_display_trip_id?: string | null
          driver_id?: string | null
          drop_lat?: number | null
          drop_location: string
          drop_lon?: number | null
          end_odometer_km?: number | null
          estimated_duration?: string | null
          execution_type?: string | null
          gps_distance_km?: number | null
          id?: string
          indent_id?: string | null
          indent_reference_code?: string | null
          is_guaranteed?: boolean
          lane_id?: string | null
          last_location_at?: string | null
          last_location_chat_at?: string | null
          load_tons?: number | null
          load_type?: string | null
          margin?: number | null
          notes?: string | null
          odometer_distance_km?: number | null
          odometer_notes?: string | null
          odometer_updated_at?: string | null
          odometer_updated_by?: string | null
          odometer_verification_state?: string
          operating_mode?: string
          organization_id: string
          owner_user_id?: string | null
          owner_vehicle_id?: string | null
          payment_status?: string
          pickup_area: string
          pickup_date?: string | null
          pickup_lat?: number | null
          pickup_lon?: number | null
          platform_fee?: number
          platform_fee_calc_snapshot?: Json | null
          pod_hard_copy_awb_number?: string | null
          pod_hard_copy_courier?: string | null
          pod_hard_copy_received_by?: string | null
          pod_received_at?: string | null
          pod_required?: boolean
          sale_rate_basis?: string | null
          sale_unit_rate?: number | null
          sequence_number?: number | null
          source?: string
          source_bid_id?: string | null
          source_indent_code?: string | null
          source_indent_id?: string | null
          source_market_bid_id?: string | null
          start_odometer_km?: number | null
          started_at?: string | null
          status?: string
          status_change_origin?: string | null
          supplier_id?: string | null
          supplier_rate?: number
          supplier_rate_basis?: string | null
          supplier_trip_sequence?: number | null
          trip_code?: string | null
          trip_number: string
          trip_operational_code?: string | null
          trip_payout_mode?: string | null
          updated_at?: string | null
          vehicle_display_number?: string | null
          vehicle_id?: string | null
        }
        Update: {
          actual_distance_traveled_km?: number | null
          advance_paid?: number
          amount_paid?: number
          assigned_by_user_id?: string | null
          booking_ref?: string | null
          client_id?: string | null
          client_name?: string
          client_price?: number
          completed_at?: string | null
          compliance_decision?: string | null
          compliance_exception_reason?: string | null
          compliance_outstanding_summary?: Json | null
          compliance_verified_at?: string | null
          compliance_verified_by?: string | null
          converted_by?: string | null
          converted_from_indent_at?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          dco_payee_id?: string | null
          deleted_at?: string | null
          display_trip_id?: string | null
          distance?: number | null
          distance_discrepancy_km?: number | null
          distance_source?: string | null
          driver_commission?: number
          driver_display_name?: string | null
          driver_display_trip_id?: string | null
          driver_id?: string | null
          drop_lat?: number | null
          drop_location?: string
          drop_lon?: number | null
          end_odometer_km?: number | null
          estimated_duration?: string | null
          execution_type?: string | null
          gps_distance_km?: number | null
          id?: string
          indent_id?: string | null
          indent_reference_code?: string | null
          is_guaranteed?: boolean
          lane_id?: string | null
          last_location_at?: string | null
          last_location_chat_at?: string | null
          load_tons?: number | null
          load_type?: string | null
          margin?: number | null
          notes?: string | null
          odometer_distance_km?: number | null
          odometer_notes?: string | null
          odometer_updated_at?: string | null
          odometer_updated_by?: string | null
          odometer_verification_state?: string
          operating_mode?: string
          organization_id?: string
          owner_user_id?: string | null
          owner_vehicle_id?: string | null
          payment_status?: string
          pickup_area?: string
          pickup_date?: string | null
          pickup_lat?: number | null
          pickup_lon?: number | null
          platform_fee?: number
          platform_fee_calc_snapshot?: Json | null
          pod_hard_copy_awb_number?: string | null
          pod_hard_copy_courier?: string | null
          pod_hard_copy_received_by?: string | null
          pod_received_at?: string | null
          pod_required?: boolean
          sale_rate_basis?: string | null
          sale_unit_rate?: number | null
          sequence_number?: number | null
          source?: string
          source_bid_id?: string | null
          source_indent_code?: string | null
          source_indent_id?: string | null
          source_market_bid_id?: string | null
          start_odometer_km?: number | null
          started_at?: string | null
          status?: string
          status_change_origin?: string | null
          supplier_id?: string | null
          supplier_rate?: number
          supplier_rate_basis?: string | null
          supplier_trip_sequence?: number | null
          trip_code?: string | null
          trip_number?: string
          trip_operational_code?: string | null
          trip_payout_mode?: string | null
          updated_at?: string | null
          vehicle_display_number?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_dco_payee_id_fkey"
            columns: ["dco_payee_id"]
            isOneToOne: false
            referencedRelation: "dco_payees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trips_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "client_lane_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_owner_vehicle_id_fkey"
            columns: ["owner_vehicle_id"]
            isOneToOne: false
            referencedRelation: "owner_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_source_bid_id_fkey"
            columns: ["source_bid_id"]
            isOneToOne: false
            referencedRelation: "driver_direct_bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_source_indent_id_fkey"
            columns: ["source_indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_source_indent_id_fkey"
            columns: ["source_indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_source_market_bid_id_fkey"
            columns: ["source_market_bid_id"]
            isOneToOne: false
            referencedRelation: "market_bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_counters: {
        Row: {
          indent_seq: number
          load_seq: number
          trip_seq: number
          user_id: string
        }
        Insert: {
          indent_seq?: number
          load_seq?: number
          trip_seq?: number
          user_id: string
        }
        Update: {
          indent_seq?: number
          load_seq?: number
          trip_seq?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      vehicle_health_scores: {
        Row: {
          breakdown_probability: number | null
          health_score: number
          id: string
          last_updated: string
          next_maintenance_at: string | null
          organization_id: string
          vehicle_id: string
        }
        Insert: {
          breakdown_probability?: number | null
          health_score?: number
          id?: string
          last_updated?: string
          next_maintenance_at?: string | null
          organization_id: string
          vehicle_id: string
        }
        Update: {
          breakdown_probability?: number | null
          health_score?: number
          id?: string
          last_updated?: string
          next_maintenance_at?: string | null
          organization_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_health_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_health_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_ledger_entries: {
        Row: {
          amount: number
          approved_by: string | null
          created_at: string
          credit: number | null
          debit: number | null
          entry_type: string
          id: string
          metadata: Json
          organization_id: string
          posted_at: string
          source_id: string
          source_type: string
          trip_id: string | null
          vehicle_id: string
        }
        Insert: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          credit?: number | null
          debit?: number | null
          entry_type: string
          id?: string
          metadata?: Json
          organization_id: string
          posted_at?: string
          source_id: string
          source_type: string
          trip_id?: string | null
          vehicle_id: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          credit?: number | null
          debit?: number | null
          entry_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          posted_at?: string
          source_id?: string
          source_type?: string
          trip_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance_entries: {
        Row: {
          amount_inr: number
          entered_at: string
          entered_by: string | null
          id: string
          invoice_storage_path: string | null
          maintenance_type: string
          next_due_date: string | null
          next_due_km: number | null
          notes: string | null
          organization_id: string
          status: string
          trip_id: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          amount_inr?: number
          entered_at?: string
          entered_by?: string | null
          id?: string
          invoice_storage_path?: string | null
          maintenance_type: string
          next_due_date?: string | null
          next_due_km?: number | null
          notes?: string | null
          organization_id: string
          status?: string
          trip_id?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          amount_inr?: number
          entered_at?: string
          entered_by?: string | null
          id?: string
          invoice_storage_path?: string | null
          maintenance_type?: string
          next_due_date?: string | null
          next_due_km?: number | null
          notes?: string | null
          organization_id?: string
          status?: string
          trip_id?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_odometer_events: {
        Row: {
          confidence_score: number | null
          created_at: string
          driver_id: string | null
          event_side: string
          id: string
          ocr_job_id: string | null
          odometer_km: number
          organization_id: string
          photo_storage_path: string | null
          reading_source: string
          recorded_at: string
          trip_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          driver_id?: string | null
          event_side: string
          id?: string
          ocr_job_id?: string | null
          odometer_km: number
          organization_id: string
          photo_storage_path?: string | null
          reading_source?: string
          recorded_at?: string
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          driver_id?: string | null
          event_side?: string
          id?: string
          ocr_job_id?: string | null
          odometer_km?: number
          organization_id?: string
          photo_storage_path?: string | null
          reading_source?: string
          recorded_at?: string
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_odometer_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_operation_ledger_entries: {
        Row: {
          amount: number
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          entry_type: string
          id: string
          organization_id: string
          source_id: string
          source_type: string
          trip_id: string | null
          vehicle_id: string
        }
        Insert: {
          amount?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          entry_type?: string
          id?: string
          organization_id: string
          source_id: string
          source_type: string
          trip_id?: string | null
          vehicle_id: string
        }
        Update: {
          amount?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          entry_type?: string
          id?: string
          organization_id?: string
          source_id?: string
          source_type?: string
          trip_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_operation_ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_driver_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips_supplier_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          avatar_seed: string | null
          avatar_url: string | null
          capacity: string | null
          created_at: string | null
          deleted_at: string | null
          documents: Json | null
          id: string
          organization_id: string
          status: string
          supplier_id: string | null
          type: string
          updated_at: string | null
          vehicle_axle: string | null
          vehicle_body_type: string | null
          vehicle_brand: string | null
          vehicle_code: string | null
          vehicle_model: string | null
          vehicle_number: string
          vehicle_size: string | null
          vehicle_type: string | null
        }
        Insert: {
          avatar_seed?: string | null
          avatar_url?: string | null
          capacity?: string | null
          created_at?: string | null
          deleted_at?: string | null
          documents?: Json | null
          id?: string
          organization_id: string
          status?: string
          supplier_id?: string | null
          type?: string
          updated_at?: string | null
          vehicle_axle?: string | null
          vehicle_body_type?: string | null
          vehicle_brand?: string | null
          vehicle_code?: string | null
          vehicle_model?: string | null
          vehicle_number: string
          vehicle_size?: string | null
          vehicle_type?: string | null
        }
        Update: {
          avatar_seed?: string | null
          avatar_url?: string | null
          capacity?: string | null
          created_at?: string | null
          deleted_at?: string | null
          documents?: Json | null
          id?: string
          organization_id?: string
          status?: string
          supplier_id?: string | null
          type?: string
          updated_at?: string | null
          vehicle_axle?: string | null
          vehicle_body_type?: string | null
          vehicle_brand?: string | null
          vehicle_code?: string | null
          vehicle_model?: string | null
          vehicle_number?: string
          vehicle_size?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_vehicles_supplier"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_audit_logs: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          ip_address: string | null
          new_status: Database["public"]["Enums"]["kyc_verification_status"]
          notes: string | null
          org_id: string
          previous_status:
            | Database["public"]["Enums"]["kyc_verification_status"]
            | null
          rejection_reasons: Json | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_status: Database["public"]["Enums"]["kyc_verification_status"]
          notes?: string | null
          org_id: string
          previous_status?:
            | Database["public"]["Enums"]["kyc_verification_status"]
            | null
          rejection_reasons?: Json | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_status?: Database["public"]["Enums"]["kyc_verification_status"]
          notes?: string | null
          org_id?: string
          previous_status?:
            | Database["public"]["Enums"]["kyc_verification_status"]
            | null
          rejection_reasons?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_documents: {
        Row: {
          created_at: string
          document_type: Database["public"]["Enums"]["verification_document_type"]
          id: string
          mime_type: string
          ocr_detail: Json | null
          org_id: string
          size_bytes: number
          status: Database["public"]["Enums"]["verification_document_status"]
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type: Database["public"]["Enums"]["verification_document_type"]
          id?: string
          mime_type: string
          ocr_detail?: Json | null
          org_id: string
          size_bytes: number
          status?: Database["public"]["Enums"]["verification_document_status"]
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: Database["public"]["Enums"]["verification_document_type"]
          id?: string
          mime_type?: string
          ocr_detail?: Json | null
          org_id?: string
          size_bytes?: number
          status?: Database["public"]["Enums"]["verification_document_status"]
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_logs: string[] | null
          id: string
          next_attempt_at: string
          ocr_detail: Json | null
          ocr_status: Database["public"]["Enums"]["pillar_status_type"]
          organization_id: string
          pillar_1_tax_detail: Json | null
          pillar_1_tax_status: Database["public"]["Enums"]["pillar_status_type"]
          pillar_2_mca_detail: Json | null
          pillar_2_mca_status: Database["public"]["Enums"]["pillar_status_type"]
          status: Database["public"]["Enums"]["verification_job_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_logs?: string[] | null
          id?: string
          next_attempt_at?: string
          ocr_detail?: Json | null
          ocr_status?: Database["public"]["Enums"]["pillar_status_type"]
          organization_id: string
          pillar_1_tax_detail?: Json | null
          pillar_1_tax_status?: Database["public"]["Enums"]["pillar_status_type"]
          pillar_2_mca_detail?: Json | null
          pillar_2_mca_status?: Database["public"]["Enums"]["pillar_status_type"]
          status?: Database["public"]["Enums"]["verification_job_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_logs?: string[] | null
          id?: string
          next_attempt_at?: string
          ocr_detail?: Json | null
          ocr_status?: Database["public"]["Enums"]["pillar_status_type"]
          organization_id?: string
          pillar_1_tax_detail?: Json | null
          pillar_1_tax_status?: Database["public"]["Enums"]["pillar_status_type"]
          pillar_2_mca_detail?: Json | null
          pillar_2_mca_status?: Database["public"]["Enums"]["pillar_status_type"]
          status?: Database["public"]["Enums"]["verification_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_audit_log: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          id: string
          org_id: string
          payload: Json
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          id?: string
          org_id: string
          payload?: Json
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "workspace_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_products: {
        Row: {
          activated_at: string | null
          billing_cycle: string | null
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json
          org_id: string
          product_id: string
          seats: number | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          billing_cycle?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          org_id: string
          product_id: string
          seats?: number | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          billing_cycle?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          product_id?: string
          seats?: number | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      driver_kyc_review_queue: {
        Row: {
          attempt_count: number | null
          document_count: number | null
          driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          driver_user_id: string | null
          optional_not_provided: string | null
          organization_name: string | null
          pending_count: number | null
          rejected_count: number | null
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          submitted_at: string | null
          verified_count: number | null
        }
        Relationships: []
      }
      driver_kyc_status: {
        Row: {
          attempt_count: number | null
          driver_user_id: string | null
          is_verified: boolean | null
          required_docs: number | null
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          submitted_at: string | null
          uploaded_docs: number | null
          verified_docs: number | null
        }
        Relationships: []
      }
      trip_messages_archive_candidates: {
        Row: {
          content: string | null
          conversation_id: string | null
          created_at: string | null
          id: string | null
          is_read: boolean | null
          message_type: string | null
          metadata: Json | null
          organization_id: string | null
          read_at: string | null
          sender_name: string | null
          sender_role: string | null
          sender_user_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          is_read?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          organization_id?: string | null
          read_at?: string | null
          sender_name?: string | null
          sender_role?: string | null
          sender_user_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          is_read?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          organization_id?: string | null
          read_at?: string | null
          sender_name?: string | null
          sender_role?: string | null
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "trip_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      trips_driver_view: {
        Row: {
          client_price: number | null
          completed_at: string | null
          created_at: string | null
          dco_payee_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_lon: number | null
          dropoff_address: string | null
          dropoff_location: string | null
          dropoff_scheduled_at: string | null
          end_odometer_km: number | null
          gps_distance_km: number | null
          id: string | null
          indent_id: string | null
          instructions: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_verification_state: string | null
          operating_mode: string | null
          organization_id: string | null
          organization_name: string | null
          owner_vehicle_id: string | null
          pickup_address: string | null
          pickup_lat: number | null
          pickup_location: string | null
          pickup_lon: number | null
          pickup_scheduled_at: string | null
          source: string | null
          source_indent_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string | null
          supplier_id: string | null
          supplier_rate: number | null
          trip_number: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          client_price?: number | null
          completed_at?: string | null
          created_at?: string | null
          dco_payee_id?: string | null
          distance?: number | null
          distance_discrepancy_km?: number | null
          distance_source?: string | null
          driver_commission?: number | null
          driver_display_trip_id?: string | null
          driver_id?: string | null
          drop_lat?: number | null
          drop_lon?: number | null
          dropoff_address?: string | null
          dropoff_location?: string | null
          dropoff_scheduled_at?: never
          end_odometer_km?: number | null
          gps_distance_km?: number | null
          id?: string | null
          indent_id?: string | null
          instructions?: string | null
          odometer_distance_km?: number | null
          odometer_notes?: string | null
          odometer_updated_at?: string | null
          odometer_verification_state?: string | null
          operating_mode?: string | null
          organization_id?: string | null
          organization_name?: never
          owner_vehicle_id?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_location?: string | null
          pickup_lon?: number | null
          pickup_scheduled_at?: string | null
          source?: string | null
          source_indent_id?: string | null
          start_odometer_km?: number | null
          started_at?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_rate?: number | null
          trip_number?: string | null
          trip_payout_mode?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          client_price?: number | null
          completed_at?: string | null
          created_at?: string | null
          dco_payee_id?: string | null
          distance?: number | null
          distance_discrepancy_km?: number | null
          distance_source?: string | null
          driver_commission?: number | null
          driver_display_trip_id?: string | null
          driver_id?: string | null
          drop_lat?: number | null
          drop_lon?: number | null
          dropoff_address?: string | null
          dropoff_location?: string | null
          dropoff_scheduled_at?: never
          end_odometer_km?: number | null
          gps_distance_km?: number | null
          id?: string | null
          indent_id?: string | null
          instructions?: string | null
          odometer_distance_km?: number | null
          odometer_notes?: string | null
          odometer_updated_at?: string | null
          odometer_verification_state?: string | null
          operating_mode?: string | null
          organization_id?: string | null
          organization_name?: never
          owner_vehicle_id?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_location?: string | null
          pickup_lon?: number | null
          pickup_scheduled_at?: string | null
          source?: string | null
          source_indent_id?: string | null
          start_odometer_km?: number | null
          started_at?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_rate?: number | null
          trip_number?: string | null
          trip_payout_mode?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_dco_payee_id_fkey"
            columns: ["dco_payee_id"]
            isOneToOne: false
            referencedRelation: "dco_payees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trips_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_owner_vehicle_id_fkey"
            columns: ["owner_vehicle_id"]
            isOneToOne: false
            referencedRelation: "owner_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_source_indent_id_fkey"
            columns: ["source_indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_source_indent_id_fkey"
            columns: ["source_indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      trips_supplier_view: {
        Row: {
          assigned_driver_id: string | null
          booking_ref: string | null
          created_at: string | null
          driver_display_trip_id: string | null
          dropoff_address: string | null
          dropoff_location: string | null
          dropoff_scheduled_at: string | null
          id: string | null
          instructions: string | null
          pickup_address: string | null
          pickup_location: string | null
          pickup_scheduled_at: string | null
          source_indent_code: string | null
          status: string | null
          supplier_trip_sequence: number | null
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          assigned_driver_id?: string | null
          booking_ref?: string | null
          created_at?: string | null
          driver_display_trip_id?: string | null
          dropoff_address?: string | null
          dropoff_location?: string | null
          dropoff_scheduled_at?: never
          id?: string | null
          instructions?: string | null
          pickup_address?: string | null
          pickup_location?: string | null
          pickup_scheduled_at?: string | null
          source_indent_code?: string | null
          status?: string | null
          supplier_trip_sequence?: number | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          assigned_driver_id?: string | null
          booking_ref?: string | null
          created_at?: string | null
          driver_display_trip_id?: string | null
          dropoff_address?: string | null
          dropoff_location?: string | null
          dropoff_scheduled_at?: never
          id?: string | null
          instructions?: string | null
          pickup_address?: string | null
          pickup_location?: string | null
          pickup_scheduled_at?: string | null
          source_indent_code?: string | null
          status?: string | null
          supplier_trip_sequence?: number | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "driver_kyc_review_queue"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_active_trips: {
        Row: {
          client_name: string | null
          client_price: number | null
          driver_current_status: string | null
          driver_display_name: string | null
          driver_name: string | null
          driver_phone: string | null
          drop_location: string | null
          id: string | null
          margin: number | null
          organization_id: string | null
          payment_status: string | null
          pickup_area: string | null
          pickup_date: string | null
          status: string | null
          supplier_name: string | null
          supplier_rate: number | null
          trip_number: string | null
          vehicle_display_number: string | null
          vehicle_number: string | null
          vehicle_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_client_revenue: {
        Row: {
          client_id: string | null
          client_name: string | null
          organization_id: string | null
          outstanding: number | null
          total_billed: number | null
          total_collected: number | null
          total_trips: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_driver_balances: {
        Row: {
          completed_trips: number | null
          current_balance: number | null
          driver_id: string | null
          driver_name: string | null
          organization_id: string | null
          phone: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_driver_tracking_health: {
        Row: {
          actual_distance_km: number | null
          anchor_at: string | null
          days_elapsed: number | null
          id: string | null
          target_km: number | null
          tracking_status: string | null
          trip_number: string | null
        }
        Insert: {
          actual_distance_km?: never
          anchor_at?: never
          days_elapsed?: never
          id?: string | null
          target_km?: never
          tracking_status?: never
          trip_number?: string | null
        }
        Update: {
          actual_distance_km?: never
          anchor_at?: never
          days_elapsed?: never
          id?: string | null
          target_km?: never
          tracking_status?: never
          trip_number?: string | null
        }
        Relationships: []
      }
      v_long_haul_health: {
        Row: {
          current_km: number | null
          expected_km: number | null
          health_status: string | null
          time_elapsed: string | null
          total_distance_km: number | null
          trip_id: string | null
          trip_number: string | null
        }
        Insert: {
          current_km?: never
          expected_km?: never
          health_status?: never
          time_elapsed?: never
          total_distance_km?: never
          trip_id?: string | null
          trip_number?: string | null
        }
        Update: {
          current_km?: never
          expected_km?: never
          health_status?: never
          time_elapsed?: never
          total_distance_km?: never
          trip_id?: string | null
          trip_number?: string | null
        }
        Relationships: []
      }
      v_open_indents: {
        Row: {
          client_name: string | null
          client_price: number | null
          drop_location: string | null
          id: string | null
          indent_number: string | null
          organization_id: string | null
          pickup_area: string | null
          pickup_date: string | null
          quote_count: number | null
          status: string | null
          supplier_target: number | null
          vehicle_type: string | null
          weight: number | null
        }
        Relationships: [
          {
            foreignKeyName: "indents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string | null
          id: string | null
          role: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          address_line: string | null
          business_pan: string | null
          business_type: string | null
          cin: string | null
          city: string | null
          created_at: string | null
          deleted_at: string | null
          employee_count: string | null
          gstin: string | null
          id: string | null
          kyc_rejected_reason: string | null
          logo_url: string | null
          name: string | null
          operating_model: string | null
          owner_id: string | null
          slug: string | null
          state: string | null
          updated_at: string | null
          verification_status:
            | Database["public"]["Enums"]["kyc_verification_status"]
            | null
          verified_at: string | null
          verified_by: string | null
          zone: string | null
        }
        Insert: {
          address_line?: string | null
          business_pan?: string | null
          business_type?: string | null
          cin?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          employee_count?: string | null
          gstin?: string | null
          id?: string | null
          kyc_rejected_reason?: string | null
          logo_url?: string | null
          name?: string | null
          operating_model?: string | null
          owner_id?: string | null
          slug?: string | null
          state?: string | null
          updated_at?: string | null
          verification_status?:
            | Database["public"]["Enums"]["kyc_verification_status"]
            | null
          verified_at?: string | null
          verified_by?: string | null
          zone?: string | null
        }
        Update: {
          address_line?: string | null
          business_pan?: string | null
          business_type?: string | null
          cin?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          employee_count?: string | null
          gstin?: string | null
          id?: string | null
          kyc_rejected_reason?: string | null
          logo_url?: string | null
          name?: string | null
          operating_model?: string | null
          owner_id?: string | null
          slug?: string | null
          state?: string | null
          updated_at?: string | null
          verification_status?:
            | Database["public"]["Enums"]["kyc_verification_status"]
            | null
          verified_at?: string | null
          verified_by?: string | null
          zone?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _ensure_mover_asset_trip: {
        Args: {
          p_actor_user_id?: string
          p_driver_id?: string
          p_indent_id: string
          p_vehicle_display_number?: string
          p_vehicle_id?: string
        }
        Returns: undefined
      }
      _next_support_ticket_display_id: { Args: never; Returns: string }
      _resolve_or_create_market_driver: {
        Args: { p_bidder_user_id: string; p_organization_id: string }
        Returns: string
      }
      _trip_status_rank: { Args: { p_status: string }; Returns: number }
      accept_bid: {
        Args: { p_actor_org_id: string; p_bid_id: string }
        Returns: undefined
      }
      accept_driver_direct_bid: { Args: { p_bid_id: string }; Returns: Json }
      accept_driver_invite: { Args: { p_invite_id: string }; Returns: Json }
      accept_market_bid: { Args: { p_bid_id: string }; Returns: Json }
      accept_partner_view: {
        Args: {
          contact_id?: string
          org_id: string
          partner_paid: number
          partner_sales: number
          trip_id: string
        }
        Returns: undefined
      }
      accept_pending_team_invitation: {
        Args: { p_invite_id: string }
        Returns: Json
      }
      accept_team_invite: { Args: { p_org_id: string }; Returns: undefined }
      acknowledge_global_alert: {
        Args: { p_alert_key: string; p_org_id: string }
        Returns: undefined
      }
      acknowledge_ledger_messages_for_transaction: {
        Args: {
          p_acknowledged_at: string
          p_conversation_id: string
          p_message_id: string
        }
        Returns: number
      }
      activate_platform_user: { Args: never; Returns: undefined }
      add_driver_ledger_entry: {
        Args: {
          p_amount: number
          p_description?: string
          p_driver_id: string
          p_org_id: string
          p_reference_id?: string
          p_reference_type?: string
          p_trip_id?: string
          p_type: string
        }
        Returns: string
      }
      admin_add_internal_note: {
        Args: { p_body: string; p_ticket_id: string }
        Returns: Json
      }
      admin_approve_profile: {
        Args: { p_admin_id: string; p_notes?: string; p_org_id: string }
        Returns: Json
      }
      admin_change_support_ticket_priority: {
        Args: { p_priority: string; p_ticket_id: string }
        Returns: Json
      }
      admin_change_support_ticket_status: {
        Args: { p_status: string; p_ticket_id: string }
        Returns: Json
      }
      admin_force_unlock_profile: {
        Args: { p_admin_id: string; p_org_id: string; p_reason: string }
        Returns: Json
      }
      admin_list_support_tickets: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
          p_unassigned_only?: boolean
        }
        Returns: Json
      }
      admin_mark_support_ticket_read: {
        Args: { p_ticket_id: string }
        Returns: Json
      }
      admin_reject_profile: {
        Args: {
          p_admin_id: string
          p_notes?: string
          p_org_id: string
          p_rejection_reasons: Json
        }
        Returns: Json
      }
      admin_reply_to_support_ticket: {
        Args: { p_body: string; p_ticket_id: string }
        Returns: Json
      }
      admin_support_attention_count: { Args: never; Returns: number }
      admin_support_ticket_context_labels: {
        Args: { p_ticket_id: string }
        Returns: Json
      }
      allocate_invoice_number: {
        Args: { p_financial_yr?: string; p_org_id: string }
        Returns: string
      }
      allocate_operational_sequence: {
        Args: { p_entity_type: string; p_org_id: string }
        Returns: number
      }
      apply_roster_deploy_from_direct_quote: {
        Args: { p_driver_id: string; p_quote_id: string; p_vehicle_id: string }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          compliance_decision: string | null
          compliance_exception_reason: string | null
          compliance_outstanding_summary: Json | null
          compliance_verified_at: string | null
          compliance_verified_by: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          dco_payee_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          execution_type: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          lane_id: string | null
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          operating_mode: string
          organization_id: string
          owner_user_id: string | null
          owner_vehicle_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          platform_fee_calc_snapshot: Json | null
          pod_hard_copy_awb_number: string | null
          pod_hard_copy_courier: string | null
          pod_hard_copy_received_by: string | null
          pod_received_at: string | null
          pod_required: boolean
          sale_rate_basis: string | null
          sale_unit_rate: number | null
          sequence_number: number | null
          source: string
          source_bid_id: string | null
          source_indent_code: string | null
          source_indent_id: string | null
          source_market_bid_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          supplier_rate_basis: string | null
          supplier_trip_sequence: number | null
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      approve_org_domain_join_request: {
        Args: { p_request_id: string }
        Returns: {
          created_at: string | null
          id: string
          joined_at: string
          organization_id: string
          permissions: Json
          role: string
          status: string
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_trip_compliance_with_exception: {
        Args: { p_comment: string; p_trip_id: string }
        Returns: undefined
      }
      archive_chat_messages: {
        Args: { p_batch?: number; p_older_than?: string }
        Returns: number
      }
      are_orgs_connected: {
        Args: { p_org_a: string; p_org_b: string }
        Returns: boolean
      }
      are_orgs_connected_or_reach_target: {
        Args: { p_author_org: string; p_post_id: string; p_viewer_org: string }
        Returns: boolean
      }
      assign_aggregate_trip_driver: {
        Args: {
          p_driver_name?: string
          p_driver_org_id: string
          p_driver_phone: string
          p_execution_type?: string
          p_trip_id: string
          p_vehicle_display_number?: string
          p_vehicle_id?: string
        }
        Returns: Json
      }
      auth_org_id: { Args: never; Returns: string }
      award_direct_quote: {
        Args: { p_indent_id: string; p_winning_quote_id: string }
        Returns: Json
      }
      award_indent_to_trip: {
        Args: {
          p_driver_id?: string
          p_indent_id: string
          p_supplier_id?: string
          p_supplier_org_id?: string
          p_supplier_rate?: number
          p_vehicle_display_number?: string
          p_vehicle_id?: string
        }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          compliance_decision: string | null
          compliance_exception_reason: string | null
          compliance_outstanding_summary: Json | null
          compliance_verified_at: string | null
          compliance_verified_by: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          dco_payee_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          execution_type: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          lane_id: string | null
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          operating_mode: string
          organization_id: string
          owner_user_id: string | null
          owner_vehicle_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          platform_fee_calc_snapshot: Json | null
          pod_hard_copy_awb_number: string | null
          pod_hard_copy_courier: string | null
          pod_hard_copy_received_by: string | null
          pod_received_at: string | null
          pod_required: boolean
          sale_rate_basis: string | null
          sale_unit_rate: number | null
          sequence_number: number | null
          source: string
          source_bid_id: string | null
          source_indent_code: string | null
          source_indent_id: string | null
          source_market_bid_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          supplier_rate_basis: string | null
          supplier_trip_sequence: number | null
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      award_market_bid: { Args: { p_bid_id: string }; Returns: Json }
      backfill_trip_room_operational_batch: {
        Args: { p_limit?: number }
        Returns: number
      }
      batch_award_indents_to_trips: {
        Args: { p_org_id: string }
        Returns: number
      }
      calculate_marketplace_platform_fee: {
        Args: { p_bid_amount: number }
        Returns: Json
      }
      can_access_trip_location: {
        Args: { p_trip_id: string }
        Returns: boolean
      }
      can_manage_client_invoice_pod_policy: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      can_manage_platform_admins: { Args: never; Returns: boolean }
      can_manage_support: { Args: never; Returns: boolean }
      can_read_trip_document: { Args: { p_trip_id: string }; Returns: boolean }
      can_review_dco: { Args: never; Returns: boolean }
      can_review_driver_kyc: { Args: never; Returns: boolean }
      can_view_support: { Args: never; Returns: boolean }
      cancel_pending_sent_connections_to_partner_owner: {
        Args: { p_from_org_id: string; p_partner_owner_id: string }
        Returns: string[]
      }
      cancel_reach_campaign: {
        Args: { p_campaign_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_team_invite_pending: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      change_operating_model: {
        Args: { p_new_model: string; p_org_id: string }
        Returns: Json
      }
      change_platform_role: {
        Args: { p_new_role_id: string; p_platform_user_id: string }
        Returns: undefined
      }
      change_trip_status_with_notification: {
        Args: {
          p_new_status: string
          p_organization_id: string
          p_trip_id: string
          p_user_id?: string
          p_user_name?: string
        }
        Returns: Json
      }
      check_cron_job_health: {
        Args: { p_consecutive_failures?: number; p_jobid: number }
        Returns: {
          consecutive_failures: number
          is_healthy: boolean
          last_run: string
          last_status: string
          message: string
        }[]
      }
      check_email_registered_for_signup: {
        Args: { p_email: string }
        Returns: Json
      }
      check_ocr_scan_quota: { Args: { p_org_id: string }; Returns: Json }
      check_org_for_email_domain: { Args: { p_email: string }; Returns: Json }
      check_rate_limit: {
        Args: {
          p_max: number
          p_scope: string
          p_user_id: string
          p_window?: string
        }
        Returns: boolean
      }
      claim_pending_team_invites: {
        Args: { p_phone: string; p_user_id: string }
        Returns: number
      }
      claim_trip_by_otp: {
        Args: { p_code: string; p_max_attempts?: number }
        Returns: Json
      }
      cleanup_expired_idempotency_keys: { Args: never; Returns: number }
      cleanup_rate_limits: { Args: { p_window?: string }; Returns: number }
      column_exists: {
        Args: { p_column: string; p_schema: string; p_table: string }
        Returns: boolean
      }
      compute_client_health_score: {
        Args: { p_client_id: string; p_org_id: string }
        Returns: Json
      }
      compute_compliance_score: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Json
      }
      compute_driver_performance_score: {
        Args: { p_driver_id: string; p_org_id: string }
        Returns: Json
      }
      compute_supplier_reliability_score: {
        Args: { p_org_id: string; p_supplier_id: string }
        Returns: Json
      }
      compute_vehicle_performance_score: {
        Args: { p_org_id: string; p_vehicle_id: string }
        Returns: Json
      }
      confirm_marketplace_fee_payment: {
        Args: {
          p_expected_market_bid_id?: string
          p_failure_reason?: string
          p_outcome?: string
          p_provider?: string
          p_provider_amount: number
          p_provider_event_id: string
          p_provider_order_id: string
          p_provider_payment_id: string
        }
        Returns: Json
      }
      confirm_to_accounting_books: {
        Args: { p_message_id: string; p_org_id: string }
        Returns: Json
      }
      confirm_trip_feedback: {
        Args: { p_msg_id: string; p_rating: number }
        Returns: Json
      }
      consume_driver_invite: { Args: { p_invite_id: string }; Returns: boolean }
      convert_reach_referral: {
        Args: { p_referral_id: string; p_trip_id: string }
        Returns: Json
      }
      counter_driver_direct_bid: {
        Args: { p_bid_id: string; p_counter_amount: number }
        Returns: Json
      }
      create_driver_direct: {
        Args: {
          p_commission_per_km?: number
          p_commission_percent?: number
          p_email?: string
          p_name: string
          p_org_id: string
          p_payable_amount?: number
          p_phone: string
        }
        Returns: Json
      }
      create_execution_plan_with_graph: {
        Args: {
          p_allocations: Json
          p_client_plan_id: string
          p_orders: Json
          p_org_id: string
          p_stops: Json
          p_vehicle_type: string
        }
        Returns: {
          plan_id: string
          plan_number: string
        }[]
      }
      create_fleet_owner_capacity_story: {
        Args: {
          p_available_from?: string
          p_content?: string
          p_destination?: string
          p_expires_at?: string
          p_origin?: string
          p_owner_vehicle_id: string
          p_rate_offer?: number
        }
        Returns: {
          author_user_id: string
          content: string | null
          created_at: string
          destination: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          load_date: string | null
          material: string | null
          organization_id: string | null
          origin: string | null
          owner_vehicle_id: string | null
          rate_offer: number | null
          source_indent_id: string | null
          type: string
          updated_at: string
          vehicle_type: string | null
          view_count: number
          weight_tonnes: number | null
        }
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_market_trip_after_fee_payment: {
        Args: { p_bid_id: string }
        Returns: Json
      }
      create_mover_asset_trip: {
        Args: {
          p_driver_id?: string
          p_indent_id: string
          p_vehicle_display_number?: string
          p_vehicle_id?: string
        }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          compliance_decision: string | null
          compliance_exception_reason: string | null
          compliance_outstanding_summary: Json | null
          compliance_verified_at: string | null
          compliance_verified_by: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          dco_payee_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          execution_type: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          lane_id: string | null
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          operating_mode: string
          organization_id: string
          owner_user_id: string | null
          owner_vehicle_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          platform_fee_calc_snapshot: Json | null
          pod_hard_copy_awb_number: string | null
          pod_hard_copy_courier: string | null
          pod_hard_copy_received_by: string | null
          pod_received_at: string | null
          pod_required: boolean
          sale_rate_basis: string | null
          sale_unit_rate: number | null
          sequence_number: number | null
          source: string
          source_bid_id: string | null
          source_indent_code: string | null
          source_indent_id: string | null
          source_market_bid_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          supplier_rate_basis: string | null
          supplier_trip_sequence: number | null
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_org_domain_join_request: {
        Args: { p_organization_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          email_domain: string
          id: string
          organization_id: string
          requester_name: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_domain_join_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_team_invite_pending: {
        Args: {
          p_email?: string
          p_name: string
          p_org_id: string
          p_permissions?: Json
          p_phone: string
          p_role?: string
        }
        Returns: {
          accepted_user_id: string | null
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invitee_email: string | null
          invitee_name: string
          invitee_phone: string
          invitee_phone_canon: string
          organization_id: string
          permissions: Json
          role: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_team_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_trip_from_assigned_indent: {
        Args: {
          p_driver_id?: string
          p_indent_id: string
          p_vehicle_display_number?: string
          p_vehicle_id?: string
        }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          compliance_decision: string | null
          compliance_exception_reason: string | null
          compliance_outstanding_summary: Json | null
          compliance_verified_at: string | null
          compliance_verified_by: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          dco_payee_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          execution_type: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          lane_id: string | null
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          operating_mode: string
          organization_id: string
          owner_user_id: string | null
          owner_vehicle_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          platform_fee_calc_snapshot: Json | null
          pod_hard_copy_awb_number: string | null
          pod_hard_copy_courier: string | null
          pod_hard_copy_received_by: string | null
          pod_received_at: string | null
          pod_required: boolean
          sale_rate_basis: string | null
          sale_unit_rate: number | null
          sequence_number: number | null
          source: string
          source_bid_id: string | null
          source_indent_code: string | null
          source_indent_id: string | null
          source_market_bid_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          supplier_rate_basis: string | null
          supplier_trip_sequence: number | null
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_trip_from_direct_quote: {
        Args: { p_quote_id: string; p_vehicle_display_number?: string }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          compliance_decision: string | null
          compliance_exception_reason: string | null
          compliance_outstanding_summary: Json | null
          compliance_verified_at: string | null
          compliance_verified_by: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          dco_payee_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          execution_type: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          lane_id: string | null
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          operating_mode: string
          organization_id: string
          owner_user_id: string | null
          owner_vehicle_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          platform_fee_calc_snapshot: Json | null
          pod_hard_copy_awb_number: string | null
          pod_hard_copy_courier: string | null
          pod_hard_copy_received_by: string | null
          pod_received_at: string | null
          pod_required: boolean
          sale_rate_basis: string | null
          sale_unit_rate: number | null
          sequence_number: number | null
          source: string
          source_bid_id: string | null
          source_indent_code: string | null
          source_indent_id: string | null
          source_market_bid_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          supplier_rate_basis: string | null
          supplier_trip_sequence: number | null
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dco_reopen_rejected: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          decision_reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "dco_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      deactivate_fleet_owner_capacity_story: {
        Args: { p_post_id: string }
        Returns: boolean
      }
      decide_reach_referral: {
        Args: { p_approve: boolean; p_referral_id: string }
        Returns: Json
      }
      decline_org_domain_join_request: {
        Args: { p_request_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          email_domain: string
          id: string
          organization_id: string
          requester_name: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_domain_join_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      detect_cron_incident_guarded: { Args: never; Returns: undefined }
      discover_extract_city: { Args: { p_location: string }; Returns: string }
      discover_organizations: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_org_id: string
          p_search?: string
        }
        Returns: {
          address_line: string
          avatar_seed: string
          average_rating: number
          city: string
          connection_status: string
          id: string
          is_in_user_trip_city: boolean
          lane_overlap_count: number
          mutual_count: number
          name: string
          operating_model: string
          profile_role: string
          recommendation_score: number
          state: string
          trip_count: number
          verification_status: string
        }[]
      }
      dismiss_driver_signup_match: {
        Args: { p_driver_id: string }
        Returns: Json
      }
      dispatch_log_watcher_scheduler: { Args: never; Returns: undefined }
      dispatch_push_notifications: { Args: never; Returns: undefined }
      dispatch_verification_workers: { Args: never; Returns: undefined }
      driver_decline_pending_assignment: {
        Args: { p_trip_id: string }
        Returns: Json
      }
      driver_has_assigned_trip_for_supplier: {
        Args: { p_supplier_id: string }
        Returns: boolean
      }
      driver_has_assigned_trip_for_trip_id: {
        Args: { p_trip_id: string }
        Returns: boolean
      }
      driver_has_other_active_trip: {
        Args: { p_current_trip_id?: string; p_driver_id: string }
        Returns: boolean
      }
      driver_kyc_reopen_submission: {
        Args: { p_driver_user_id: string; p_reason: string }
        Returns: {
          attempt_count: number
          created_at: string
          driver_user_id: string
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "driver_kyc_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_phone_has_other_active_trip: {
        Args: { p_current_trip_id?: string; p_driver_id: string }
        Returns: boolean
      }
      driver_reject_trip: { Args: { p_trip_id: string }; Returns: undefined }
      driver_resubmit_kyc_document: {
        Args: {
          p_document_id: string
          p_file_name: string
          p_file_size?: number
          p_mime_type: string
          p_storage_path: string
        }
        Returns: {
          created_at: string
          deleted_at: string | null
          doc_label: string | null
          doc_type: string
          driver_user_id: string
          file_name: string | null
          file_size_bytes: number | null
          id: string
          is_mandatory: boolean
          mime_type: string | null
          rejection_notes: string | null
          status: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "driver_kyc_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_submit_kyc_for_verification: {
        Args: never
        Returns: {
          attempt_count: number
          created_at: string
          driver_user_id: string
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "driver_kyc_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_update_trip_status: {
        Args: {
          p_completed_at?: string
          p_started_at?: string
          p_status: string
          p_trip_id: string
        }
        Returns: undefined
      }
      driver_withdraw_kyc_document: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      emit_event: {
        Args: {
          p_aggregate_id: string
          p_aggregate_type: string
          p_caused_by?: string
          p_correlation_id?: string
          p_event_type: string
          p_metadata?: Json
          p_org_id?: string
          p_payload: Json
          p_user_id?: string
        }
        Returns: string
      }
      emit_network_notification: {
        Args: {
          p_actor_org_id: string
          p_amount_meta: number
          p_bid_id: string
          p_dedupe_key: string
          p_event_type: string
          p_indent_id: string
          p_organization_id: string
          p_payload?: Json
          p_quote_id: string
          p_subtitle: string
          p_title: string
        }
        Returns: undefined
      }
      emit_platform_event: {
        Args: { p_event_type: string; p_org_id?: string; p_payload?: Json }
        Returns: string
      }
      enable_driver_fleet_owner: {
        Args: never
        Returns: {
          created_at: string
          enabled_at: string
          preferred_view: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "driver_fleet_owner_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enforce_rpc_rate_limit: {
        Args: { p_max_requests: number; p_scope: string; p_window: string }
        Returns: undefined
      }
      enqueue_driver_signup_matches: {
        Args: { p_phone: string; p_user_id: string }
        Returns: number
      }
      ensure_asset_completion_auto_entries: {
        Args: { p_trip_id: string }
        Returns: undefined
      }
      ensure_chat_channel: {
        Args: {
          p_channel_key: string
          p_organization_id: string
          p_title?: string
        }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_direct_chat: {
        Args: { p_organization_id: string; p_peer_user_id: string }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_driver_row_by_phone_insert: {
        Args: {
          p_commission_percent?: number
          p_name: string
          p_org_id: string
          p_phone: string
          p_tracking_only: boolean
          p_user_id: string
        }
        Returns: Json
      }
      ensure_driver_signup_matches_for_driver: {
        Args: { p_driver_id: string }
        Returns: number
      }
      ensure_driver_trip_conversation: {
        Args: { p_driver_id: string; p_party_name: string; p_trip_id: string }
        Returns: {
          client_id: string | null
          created_at: string
          driver_id: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          organization_id: string
          party_name: string
          party_type: string
          supplier_id: string | null
          trip_id: string
          unread_dispatcher_count: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trip_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_network_identity: {
        Args: {
          p_identity_type: string
          p_org_id: string
          p_primary_entity: string
          p_primary_id: string
        }
        Returns: string
      }
      ensure_organization_operational_code: {
        Args: { p_org_id: string }
        Returns: string
      }
      ensure_trip_chat_room: {
        Args: { p_trip_id: string }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_trip_otp_for_phone_assigned_driver: {
        Args: { p_trip_id: string; p_ttl_minutes?: number }
        Returns: undefined
      }
      execute_b2b_update: {
        Args: {
          p_event_type: string
          p_organization_id: string
          p_payload?: Json
          p_trip_id: string
        }
        Returns: Json
      }
      expire_old_posts: { Args: never; Returns: number }
      expire_stale_team_invitations: {
        Args: { p_phone: string }
        Returns: number
      }
      expire_stale_team_invitations_by_email: {
        Args: { p_email: string }
        Returns: number
      }
      extract_ledger_meta_trip_number: {
        Args: { p_description: string }
        Returns: string
      }
      find_org_matches_for_counterparty: {
        Args: { p_min_similarity?: number; p_name: string; p_phone?: string }
        Returns: {
          org_city: string
          org_id: string
          org_name: string
          similarity_score: number
        }[]
      }
      find_pending_sent_connection_to_partner_owner: {
        Args: { p_from_org_id: string; p_to_org_id: string }
        Returns: {
          request_id: string
          same_pair: boolean
        }[]
      }
      fn_aggregate_reach_daily_metrics: { Args: never; Returns: undefined }
      fn_allocate_reach_targets: {
        Args: { p_campaign_id: string; p_count: number; p_wave: number }
        Returns: number
      }
      fn_build_chat_lanes: { Args: { p_unified: Json }; Returns: Json }
      fn_can_access_trip_for_chat: {
        Args: { p_trip_id: string }
        Returns: boolean
      }
      fn_chat_can_access_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      fn_chat_ensure_conv_for_network: {
        Args: { p_network_conversation_id: string }
        Returns: string
      }
      fn_chat_ensure_conv_for_trip_lane: {
        Args: { p_trip_conversation_id: string }
        Returns: string
      }
      fn_chat_is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      fn_chat_is_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      fn_complete_reach_campaigns_for_indents: {
        Args: { p_indent_ids: string[] }
        Returns: number
      }
      fn_ensure_trip_chat_room: {
        Args: { p_trip_id: string }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_ensure_trip_chat_room_core: {
        Args: { p_created_by?: string; p_trip_id: string }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_ensure_trip_party_conversations: {
        Args: { p_trip_id: string }
        Returns: undefined
      }
      fn_expire_reach_campaigns: { Args: never; Returns: undefined }
      fn_expire_workspace_products: { Args: never; Returns: undefined }
      fn_insert_driver_location_log_chat: {
        Args: {
          p_body: string
          p_metadata: Json
          p_priority_weight?: number
          p_trip_id: string
        }
        Returns: undefined
      }
      fn_mirror_legacy_trip_message_to_room: {
        Args: { p_msg_id: string }
        Returns: boolean
      }
      fn_pace_reach_campaigns: { Args: never; Returns: undefined }
      fn_post_system_log_to_trip_chats: {
        Args: {
          p_content: string
          p_metadata: Json
          p_priority_weight?: number
          p_trip_id: string
        }
        Returns: undefined
      }
      fn_post_system_message_to_trip_chats:
        | {
            Args: {
              p_content: string
              p_dedupe_status?: string
              p_trip_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_content: string
              p_dedupe_status?: string
              p_simulated?: boolean
              p_trip_id: string
            }
            Returns: undefined
          }
      fn_post_trip_feedback_prompt_to_chats: {
        Args: { p_trip_id: string }
        Returns: undefined
      }
      fn_post_trip_room_action_card: {
        Args: {
          p_body?: string
          p_created_at?: string
          p_event_type: string
          p_legacy_msg_id?: string
          p_metadata?: Json
          p_title: string
          p_trip_id: string
        }
        Returns: undefined
      }
      fn_reach_wave_size: {
        Args: { p_cap: number; p_wave: number }
        Returns: number
      }
      fn_reconcile_trip_conversation_unread: {
        Args: { p_conversation_id: string }
        Returns: number
      }
      fn_release_reach_referral_escrow: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      fn_storage_trip_doc_access: { Args: { p_name: string }; Returns: boolean }
      fn_sync_trip_room_participants: {
        Args: { p_conversation_id: string; p_trip_id: string }
        Returns: undefined
      }
      fn_trip_location_city_hint: {
        Args: { p_trip_id: string }
        Returns: string
      }
      fn_trip_message_counts_as_dispatcher_unread: {
        Args: { p_message_type: string; p_sender_role: string }
        Returns: boolean
      }
      fn_trip_status_chat_message_body: {
        Args: { p: Database["public"]["Tables"]["trips"]["Row"] }
        Returns: string
      }
      generate_enterprise_operational_code: {
        Args: { p_entity_type: string; p_org_id: string }
        Returns: string
      }
      generate_global_reference: {
        Args: { p_entity_id: string; p_entity_type: string; p_org_id?: string }
        Returns: string
      }
      generate_operational_code: {
        Args: { entity_type: string; org_id: string }
        Returns: string
      }
      generate_referral_code: { Args: { p_org_id: string }; Returns: string }
      generate_trip_otp: {
        Args: { p_trip_id: string; p_ttl_minutes?: number }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      get_active_driver_stint: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: {
          commission_per_km: number
          commission_percent: number
          hired_at: string
          id: string
          name: string
          organization_id: string
          payable_amount: number
          phone: string
          status: string
          user_id: string
        }[]
      }
      get_active_products: {
        Args: { p_org_id: string }
        Returns: {
          expires_at: string
          product_id: string
          status: string
          trial_ends_at: string
        }[]
      }
      get_audit_log_for_org: {
        Args: { p_limit?: number; p_offset?: number; p_org_id: string }
        Returns: {
          actor_email: string
          actor_name: string
          created_at: string
          event_type: string
          id: string
          payload: Json
        }[]
      }
      get_b2b_chat_bootstrap: {
        Args: {
          p_hub_trip_bucket?: string
          p_include_message_bodies?: boolean
          p_message_limit?: number
          p_organization_id: string
          p_trip_limit?: number
          p_trip_offset?: number
        }
        Returns: Json
      }
      get_boost_control_center: { Args: never; Returns: Json }
      get_chat_inbox: {
        Args: { p_before?: string; p_limit?: number; p_organization_id: string }
        Returns: {
          channel_key: string
          client_id: string
          conversation_type: string
          created_at: string
          driver_id: string
          id: string
          is_archived: boolean
          last_message_at: string
          last_message_preview: string
          message_count: number
          metadata: Json
          my_last_read_at: string
          organization_id: string
          supplier_id: string
          title: string
          trip_id: string
          unread_count: number
        }[]
      }
      get_chat_messages: {
        Args: { p_before?: string; p_conversation_id: string; p_limit?: number }
        Returns: {
          client_message_id: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          legacy_source: string | null
          message_type: string
          metadata: Json
          organization_id: string
          reply_to_id: string | null
          sender_name: string
          sender_role: string | null
          sender_type: string
          sender_user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "chat_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_client_detail_bundle: {
        Args: { p_client_id: string; p_org_id: string }
        Returns: Json
      }
      get_client_details: { Args: { p_client_id: string }; Returns: Json }
      get_client_management_bundle: {
        Args: { p_client_id: string; p_org_id: string }
        Returns: Json
      }
      get_client_monthly_analytics: {
        Args: { p_client_id: string; p_months_back?: number; p_org_id: string }
        Returns: {
          avg_payment_delay_days: number
          cancellation_rate_pct: number
          collected: number
          km_driven: number
          margin: number
          margin_pct: number
          on_time_pct: number
          outstanding: number
          period: string
          revenue: number
          trip_count: number
        }[]
      }
      get_clients_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_clients_with_profiles: {
        Args: { p_org_id: string }
        Returns: {
          address: string
          avatar_seed: string
          avatar_url: string
          contact_person: string
          created_at: string
          email: string
          gstin: string
          id: string
          is_integrated: boolean
          linked_organization_id: string
          name: string
          organization_id: string
          pan_number: string
          phone: string
          status: string
          updated_at: string
        }[]
      }
      get_compliance_summary: {
        Args: { p_org_id: string }
        Returns: {
          active_docs: number
          entity_type: string
          expired_docs: number
          expiring_30d: number
          expiring_7d: number
          pending_docs: number
          total_docs: number
          verified_docs: number
        }[]
      }
      get_connection_partner_display: {
        Args: { p_linked_organization_id: string }
        Returns: Json
      }
      get_connection_partner_display_batch: {
        Args: { p_linked_organization_ids: string[] }
        Returns: Json
      }
      get_connection_requests_received_with_names: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          from_org_name: string
          from_organization_id: string
          id: string
          request_carrier_supplier: boolean
          request_shipper_client: boolean
          responded_at: string
          responded_by: string
          status: string
          to_org_name: string
          to_organization_id: string
        }[]
      }
      get_connection_requests_sent_with_names: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          from_org_name: string
          from_organization_id: string
          id: string
          request_carrier_supplier: boolean
          request_shipper_client: boolean
          responded_at: string
          responded_by: string
          status: string
          to_org_name: string
          to_organization_id: string
        }[]
      }
      get_customer_ledger_inputs: {
        Args: { p_apply_adjustments?: boolean; p_org_id: string }
        Returns: Json
      }
      get_db_capabilities: { Args: never; Returns: Json }
      get_db_observability_summary: { Args: never; Returns: Json }
      get_db_snapshot: { Args: never; Returns: Json }
      get_dco_ledger_aggregation: {
        Args: { p_org_id: string }
        Returns: {
          dco_payee_id: string
          dco_user_id: string
          due: number
          outstanding: number
          paid: number
          trips_count: number
        }[]
      }
      get_dco_payee_id: { Args: { p_user_id: string }; Returns: string }
      get_direct_quotes_with_bidder_names: {
        Args: { p_indent_id: string }
        Returns: {
          amount: number
          bidder_organization_id: string
          bidder_organization_name: string
          counter_amount: number
          created_at: string
          driver_id: string
          id: string
          indent_id: string
          notes: string
          status: string
          updated_at: string
          vehicle_id: string
        }[]
      }
      get_driver_balance: { Args: { p_driver_id: string }; Returns: number }
      get_driver_coalesced_email_for_org: {
        Args: { p_driver_id: string; p_org_id: string }
        Returns: {
          email: string
        }[]
      }
      get_driver_detail_bundle: {
        Args: { p_driver_id: string; p_org_id: string }
        Returns: Json
      }
      get_driver_invite_sent_status: {
        Args: { p_org_id: string; p_to_user_id: string }
        Returns: {
          status: string
        }[]
      }
      get_driver_invitee_by_phone: {
        Args: { p_phone: string }
        Returns: {
          avatar_seed: string
          avatar_url: string
          email: string
          emergency_contact_name: string
          emergency_contact_phone: string
          full_name: string
          is_in_fleet: boolean
          license_number: string
          phone: string
          user_id: string
        }[]
      }
      get_driver_invites_received: {
        Args: never
        Returns: {
          commission_per_km: number
          commission_percent: number
          created_at: string
          from_org_avatar_seed: string
          from_org_avatar_url: string
          from_org_logo_url: string
          from_org_name: string
          from_organization_id: string
          id: string
          payable_amount: number
          responded_at: string
          responded_by: string
          status: string
          to_user_id: string
        }[]
      }
      get_driver_invites_sent: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          driver_name: string
          from_org_name: string
          id: string
          status: string
          to_user_id: string
        }[]
      }
      get_driver_kyc_reviewer_profiles: {
        Args: { p_driver_user_ids: string[] }
        Returns: {
          avatar_seed: string
          avatar_url: string
          email: string
          full_name: string
          id: string
          phone: string
        }[]
      }
      get_driver_latest_location: {
        Args: { p_driver_id: string }
        Returns: {
          accuracy: number
          latitude: number
          longitude: number
          recorded_at: string
        }[]
      }
      get_driver_ledger_aggregation: {
        Args: { p_org_id: string }
        Returns: {
          driver_id: string
          due: number
          paid: number
          pending: number
          trips_count: number
        }[]
      }
      get_driver_location_history_for_trip: {
        Args: { p_limit?: number; p_trip_id: string }
        Returns: {
          latitude: number
          longitude: number
          recorded_at: string
        }[]
      }
      get_driver_monthly_analytics: {
        Args: { p_driver_id: string; p_months_back?: number; p_org_id: string }
        Returns: {
          earnings: number
          km_driven: number
          paid: number
          period: string
          revenue: number
          trip_count: number
        }[]
      }
      get_driver_phone_active_trip: {
        Args: { p_exclude_trip_id?: string; p_phone: string }
        Returns: Json
      }
      get_driver_previous_rows_by_identity: {
        Args: { p_driver_id: string; p_org_id: string }
        Returns: {
          created_at: string
          id: string
          left_at: string
          name: string
          phone: string
          user_id: string
        }[]
      }
      get_driver_profile_display: {
        Args: { p_driver_id: string }
        Returns: Json
      }
      get_driver_profile_display_batch: {
        Args: { p_driver_ids: string[] }
        Returns: Json
      }
      get_driver_reach_stories: {
        Args: never
        Returns: {
          campaign_id: string
          campaign_org_id: string
          campaign_status: string
          direct_bid_amount: number
          direct_bid_counter_amount: number
          direct_bid_status: string
          driver_reward_enabled: boolean
          expires_at: string
          org_logo_url: string
          org_name: string
          post_id: string
          posted_at: string
          published_at: string
          recommended_at: string
          referral_id: string
          referral_reward_amount: number
          referral_status: string
          reward_amount: number
          reward_available: boolean
          rewarded_at: string
          snapshot_content: string
          snapshot_destination: string
          snapshot_material: string
          snapshot_origin: string
          snapshot_post_type: string
          snapshot_rate_offer: number
          snapshot_title: string
          snapshot_vehicle_type: string
          source_deleted_at: string
        }[]
      }
      get_driver_signup_match_status: {
        Args: { p_driver_id: string }
        Returns: {
          detected_at: string
          id: string
          matched_user_id: string
          state: string
        }[]
      }
      get_driver_stint_history: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: {
          commission_per_km: number
          commission_percent: number
          hired_at: string
          id: string
          left_at: string
          name: string
          organization_id: string
          payable_amount: number
          phone: string
          user_id: string
        }[]
      }
      get_driver_tenures: {
        Args: { p_driver_id: string; p_org_id: string }
        Returns: {
          created_at: string
          driver_id: string
          id: string
          joined_at: string
          left_at: string
          organization_id: string
          trip_count: number
        }[]
      }
      get_driver_trip_stop_orders: {
        Args: { p_trip_id: string }
        Returns: {
          address_line: string
          arrived_at: string
          attachment_role: string
          city: string
          completed_at: string
          contact_name: string
          contact_phone: string
          currency: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_window_end: string
          delivery_window_start: string
          display_name: string
          execution_plan_id: string
          failure_reason: string
          indent_id: string
          label: string
          latitude: number
          longitude: number
          notes: string
          order_completed_drop_stop_count: number
          order_distinct_drop_stop_count: number
          order_number: string
          order_total_amount: number
          pincode: string
          pod_required: boolean
          priority: string
          product_id: string
          product_image_path: string
          product_name: string
          product_sku: string
          quantity: number
          sales_order_id: string
          sales_order_line_id: string
          sequence: number
          source_type: string
          state: string
          stop_distinct_drop_order_count: number
          stop_execution_status: string
          stop_id: string
          stop_type: string
          trip_id: string
        }[]
      }
      get_drivers_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_drivers_with_profiles: {
        Args: { p_org_id: string }
        Returns: {
          assigned_vehicle_id: string
          avatar_seed: string
          avatar_url: string
          commission_per_km: number
          commission_percent: number
          created_at: string
          email: string
          id: string
          left_at: string
          name: string
          organization_id: string
          payable_amount: number
          phone: string
          status: string
          tracking_only: boolean
          updated_at: string
          user_id: string
        }[]
      }
      get_email_by_phone: { Args: { p_phone: string }; Returns: string }
      get_expiring_documents: {
        Args: { p_days_ahead?: number; p_org_id: string }
        Returns: {
          days_until: number
          doc_label: string
          doc_number: string
          doc_type: string
          entity_id: string
          entity_type: string
          expiry_date: string
          id: string
          status: string
        }[]
      }
      get_global_app_bootstrap: { Args: { p_org_id: string }; Returns: Json }
      get_identity_health: { Args: { p_since?: string }; Returns: Json }
      get_incident_details: { Args: { p_incident_id: string }; Returns: Json }
      get_incidents_summary: {
        Args: { p_limit?: number; p_status?: string }
        Returns: {
          confidence: number
          diagnosis: string
          event_count: number
          first_seen: string
          id: string
          investigation_status: string
          last_seen: string
          service: string
          severity: string
          status: string
          title: string
        }[]
      }
      get_indents_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_initial_chat_state: {
        Args: {
          p_hub_trip_bucket?: string
          p_include_message_bodies?: boolean
          p_message_limit?: number
          p_organization_id: string
          p_trip_limit?: number
          p_trip_offset?: number
        }
        Returns: Json
      }
      get_integrated_partners: { Args: { p_org_id: string }; Returns: Json }
      get_invitee_by_phone: {
        Args: { p_org_id: string; p_phone: string }
        Returns: {
          full_name: string
          organization_id: string
          organization_name: string
          phone: string
          profile_company_name: string
          profile_role: string
        }[]
      }
      get_invitees_by_phones: {
        Args: { p_org_id: string; p_phones: string[] }
        Returns: {
          full_name: string
          organization_id: string
          organization_name: string
          phone: string
          profile_company_name: string
          profile_role: string
        }[]
      }
      get_last_n_locations_for_trip: {
        Args: { p_n?: number; p_trip_id: string }
        Returns: {
          latitude: number
          longitude: number
          recorded_at: string
        }[]
      }
      get_last_trip_location: { Args: { p_trip_id: string }; Returns: Json }
      get_latest_assignment_audit_by_trip_ids: {
        Args: { p_trip_ids: string[] }
        Returns: {
          changed_at: string
          changed_by: string
          trip_id: string
        }[]
      }
      get_latest_driver_location_for_trip: {
        Args: { p_trip_id: string }
        Returns: Json
      }
      get_linked_client_org_locations: {
        Args: { p_client_id: string; p_org_id: string }
        Returns: {
          address_line: string
          city: string
          department: string
          id: string
          is_verified: boolean
          location_type: string
          name: string
          organization_id: string
          sort_order: number
          state: string
        }[]
      }
      get_load_chain_ancestor_orgs: {
        Args: { p_indent_id: string; p_max_depth?: number }
        Returns: {
          hop: number
          org_id: string
        }[]
      }
      get_mover_asset_client_paid: {
        Args: { p_trip_id: string }
        Returns: number
      }
      get_multi_lane_bootstrap: {
        Args: {
          p_hub_trip_bucket?: string
          p_include_message_bodies?: boolean
          p_message_limit?: number
          p_organization_id: string
          p_trip_limit?: number
          p_trip_offset?: number
        }
        Returns: Json
      }
      get_mutual_connections: {
        Args: { p_target_org_id: string; p_viewer_org_id: string }
        Returns: {
          avatar_seed: string
          avatar_url: string
          id: string
          name: string
        }[]
      }
      get_my_pending_domain_join_request: {
        Args: never
        Returns: {
          created_at: string
          id: string
          organization_id: string
          organization_name: string
          status: string
        }[]
      }
      get_my_platform_permissions: {
        Args: never
        Returns: {
          permission_key: string
        }[]
      }
      get_my_team_invites: {
        Args: never
        Returns: {
          id: string
          joined_at: string
          org_name: string
          organization_id: string
          role: string
        }[]
      }
      get_network_conversations_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_network_feed: {
        Args: { p_limit?: number; p_offset?: number; p_org_id: string }
        Returns: {
          author_user_id: string
          bid_count: number
          content: string
          created_at: string
          destination: string
          expires_at: string
          id: string
          is_active: boolean
          is_sponsored: boolean
          load_date: string
          material: string
          org_avatar_seed: string
          org_avatar_url: string
          org_name: string
          organization_id: string
          origin: string
          rate_offer: number
          reach_campaign_id: string
          source_indent_id: string
          type: string
          vehicle_type: string
          view_count: number
          weight_tonnes: number
        }[]
      }
      get_next_trip_sequence_for_org: {
        Args: { p_org_id: string }
        Returns: number
      }
      get_ocr_metrics: {
        Args: { p_days?: number; p_org_id: string }
        Returns: {
          avg_confidence: number
          avg_duration_ms: number
          duplicate_count: number
          failed_count: number
          jobs_in_window: number
          jobs_this_month: number
          jobs_today: number
          quota_limit: number
          quota_remaining: number
          quota_tier: string
          quota_used: number
        }[]
      }
      get_org_active_products: {
        Args: { p_org_id: string }
        Returns: {
          activated_at: string
          billing_cycle: string
          days_remaining: number
          expires_at: string
          product_id: string
          seats: number
          status: string
          trial_ends_at: string
        }[]
      }
      get_org_branding_for_driver: {
        Args: { p_org_ids: string[] }
        Returns: {
          avatar_seed: string
          avatar_url: string
          logo_url: string
          organization_id: string
        }[]
      }
      get_org_domain_join_requests: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          email: string
          id: string
          organization_id: string
          requester_name: string
          status: string
          user_id: string
        }[]
      }
      get_org_ledger_summary: {
        Args: { p_from?: string; p_org_id: string; p_to?: string }
        Returns: {
          net_balance: number
          payables: number
          receivables: number
          total_in: number
          total_out: number
        }[]
      }
      get_org_members_with_profiles: {
        Args: { p_org_id: string }
        Returns: {
          avatar_seed: string
          avatar_url: string
          email: string
          full_name: string
          id: string
          joined_at: string
          organization_id: string
          permissions: Json
          phone: string
          role: string
          status: string
          user_id: string
        }[]
      }
      get_org_team_pending_invites: {
        Args: { p_org_id: string }
        Returns: {
          conflict_org_names: string[]
          created_at: string
          email_conflict: boolean
          expires_at: string
          id: string
          invitee_email: string
          invitee_name: string
          invitee_phone: string
          organization_id: string
          permissions: Json
          role: string
          status: string
        }[]
      }
      get_org_trip_metrics: {
        Args: { p_org_id: string }
        Returns: {
          active_trips: number
          completed_trips: number
          last_trip_updated_at: string
          total_cost: number
          total_margin: number
          total_revenue: number
          total_trips: number
        }[]
      }
      get_organizations_for_user: {
        Args: never
        Returns: {
          id: string
          name: string
          owner_id: string
          slug: string
        }[]
      }
      get_partner_trip_ids_for_shared_ledger_focus: {
        Args: { org_id: string; partner_key: string; viewer_trip_id: string }
        Returns: string[]
      }
      get_pending_otp_claim_count: { Args: never; Returns: Json }
      get_pending_otp_trips: {
        Args: never
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          compliance_decision: string | null
          compliance_exception_reason: string | null
          compliance_outstanding_summary: Json | null
          compliance_verified_at: string | null
          compliance_verified_by: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          dco_payee_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          execution_type: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          lane_id: string | null
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          operating_mode: string
          organization_id: string
          owner_user_id: string | null
          owner_vehicle_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          platform_fee_calc_snapshot: Json | null
          pod_hard_copy_awb_number: string | null
          pod_hard_copy_courier: string | null
          pod_hard_copy_received_by: string | null
          pod_received_at: string | null
          pod_required: boolean
          sale_rate_basis: string | null
          sale_unit_rate: number | null
          sequence_number: number | null
          source: string
          source_bid_id: string | null
          source_indent_code: string | null
          source_indent_id: string | null
          source_market_bid_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          supplier_rate_basis: string | null
          supplier_trip_sequence: number | null
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_platform_health: { Args: never; Returns: Json }
      get_pod_reconciliation_summary: {
        Args: { p_organization_id?: string }
        Returns: {
          approved_count: number
          approved_sum: number
          invoiced_count: number
          invoiced_sum: number
          pod_pending_count: number
          pod_pending_sum: number
          received_count: number
          received_sum: number
        }[]
      }
      get_reach_campaign_delivery: {
        Args: { p_campaign_id: string }
        Returns: {
          bids: number
          conversions: number
          released_at: string
          targets: number
          verified_targets: number
          viewed: number
          wave: number
        }[]
      }
      get_reach_campaign_metrics: {
        Args: { p_campaign_id: string }
        Returns: {
          bids: number
          credits_used: number
          impressions: number
          views: number
        }[]
      }
      get_reach_org_summary: { Args: { p_org_id: string }; Returns: Json }
      get_reach_referral_inbox: {
        Args: { p_fleet_org_id: string }
        Returns: {
          campaign_id: string
          campaign_org_id: string
          campaign_status: string
          created_at: string
          decided_at: string
          driver_name: string
          driver_phone: string
          driver_referrals_converted: number
          driver_referrals_total: number
          driver_trips_completed: number
          driver_user_id: string
          id: string
          note: string
          post_id: string
          reason: string
          reward_amount: number
          rewarded_at: string
          snapshot_destination: string
          snapshot_material: string
          snapshot_origin: string
          snapshot_post_type: string
          snapshot_title: string
          snapshot_vehicle_type: string
          status: string
          suggested_rate: number
        }[]
      }
      get_referrer_name_by_code: { Args: { p_code: string }; Returns: string }
      get_safe_fallback_indent_number: { Args: never; Returns: string }
      get_safe_fallback_trip_number: { Args: never; Returns: string }
      get_shared_ledger_entries: {
        Args: { org_id: string; partner_key: string }
        Returns: {
          amount: number
          id: string
          reference_id: string
          transaction_date: string
        }[]
      }
      get_shared_ledger_notifications: {
        Args: { org_id: string; status_filter?: string }
        Returns: {
          amount_meta: number | null
          created_at: string
          dedupe_key: string | null
          event_type: string
          handled_at: string | null
          handled_by_user_id: string | null
          id: string
          organization_id: string
          partner_key: string | null
          partner_org_id: string | null
          payload_json: Json
          read_at: string | null
          source_dispute_id: string | null
          status: string
          subtitle: string | null
          title: string
          transaction_id: string | null
          trip_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "shared_ledger_notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_shared_ledger_notifications_count: {
        Args: { org_id: string }
        Returns: number
      }
      get_shared_ledger_trip_summary: {
        Args: { org_id: string; partner_key: string }
        Returns: {
          partner_paid: number
          partner_sales: number
          trip_id: string
        }[]
      }
      get_shared_trip_finance_adjustments: {
        Args: { org_id: string; partner_key: string }
        Returns: {
          amount: number
          created_at: string
          id: string
          impact: string
          mission_key: string
          organization_id: string
          reason: string
          trip_id: string
          type: string
          void_reason: string
          voided_at: string
        }[]
      }
      get_shipper_display_names_for_supplier_trips: {
        Args: { p_org_id: string }
        Returns: {
          shipper_display_name: string
          trip_id: string
        }[]
      }
      get_sqids_alphabet: { Args: never; Returns: string }
      get_story_closed_info: {
        Args: { p_post_id: string }
        Returns: {
          indent_status: string
          reason: string
        }[]
      }
      get_story_preview: {
        Args: { p_post_id: string }
        Returns: {
          destination: string
          expires_at: string
          id: string
          is_active: boolean
          load_date: string
          org_name: string
          organization_id: string
          origin: string
          type: string
          vehicle_type: string
        }[]
      }
      get_supplier_details: { Args: { p_supplier_id: string }; Returns: Json }
      get_supplier_driver_salary_requests: {
        Args: { p_supplier_id: string; p_viewer_org_id: string }
        Returns: Json
      }
      get_supplier_ledger_aggregation: {
        Args: { p_apply_adjustments?: boolean; p_org_id: string }
        Returns: {
          due: number
          paid: number
          supplier_id: string
          trips_count: number
          unsettled: number
        }[]
      }
      get_supplier_linked_drivers: {
        Args: { p_supplier_id: string; p_viewer_org_id: string }
        Returns: Json
      }
      get_supplier_management_bundle: {
        Args: { p_org_id: string; p_supplier_id: string }
        Returns: Json
      }
      get_supplier_monthly_analytics: {
        Args: {
          p_months_back?: number
          p_org_id: string
          p_supplier_id: string
        }
        Returns: {
          avg_settlement_days: number
          cancellation_rate_pct: number
          km_driven: number
          margin_contribution: number
          margin_contribution_pct: number
          on_time_pct: number
          outstanding: number
          paid: number
          period: string
          revenue_handled: number
          supplier_payable: number
          trip_count: number
        }[]
      }
      get_supplier_trip_ids_for_org: {
        Args: { p_org_id: string }
        Returns: Json
      }
      get_suppliers_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_suppliers_with_profiles: {
        Args: { p_org_id: string }
        Returns: {
          address: string
          avatar_seed: string
          avatar_url: string
          company_name: string
          contact: string
          contact_person: string
          created_at: string
          email: string
          gstin: string
          id: string
          is_active: boolean
          is_verified: boolean
          linked_organization_id: string
          name: string
          organization_id: string
          phone: string
          supplier_type: string
          updated_at: string
        }[]
      }
      get_table_columns: {
        Args: { p_schema: string; p_table: string }
        Returns: {
          column_name: string
          data_type: string
          is_nullable: string
          ordinal_position: number
          udt_name: string
        }[]
      }
      get_tier_capabilities: { Args: { p_org_id: string }; Returns: Json }
      get_transactions_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_trigger_coverage: {
        Args: never
        Returns: {
          has_rls: boolean
          tbl: string
          trg_count: number
          trg_names: string[]
        }[]
      }
      get_trip_assigner_displays_for_driver: {
        Args: { p_trip_ids: string[] }
        Returns: {
          assigner_user_id: string
          assigning_organization_avatar_seed: string
          assigning_organization_avatar_url: string
          assigning_organization_id: string
          assigning_organization_logo_url: string
          assigning_organization_name: string
          display_name: string
          trip_id: string
        }[]
      }
      get_trip_chat_room: {
        Args: { p_trip_id: string }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_trip_checkpoint_distance_sums: {
        Args: { p_trip_ids: string[] }
        Returns: {
          total_distance_m: number
          trip_id: string
        }[]
      }
      get_trip_detail_bundle: {
        Args: { p_trip_id: string; p_viewer_org_id: string }
        Returns: Json
      }
      get_trip_otp: {
        Args: { p_trip_id: string }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      get_trip_status_summary: {
        Args: { p_org_id: string }
        Returns: {
          count: number
          status: string
        }[]
      }
      get_trip_subcontracts: {
        Args: { p_trip_ids: string[]; p_viewer_org_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          rate: number
          status: string
          sub_driver_id: string | null
          sub_supplier_name: string | null
          sub_supplier_on_platform: boolean
          sub_supplier_org_id: string | null
          sub_supplier_phone: string | null
          sub_trip_code: string | null
          supplier_id: string | null
          trip_id: string
          updated_at: string
          viewer_org_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "trip_subcontracts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_trips_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_trips_for_org: { Args: { p_org_id: string }; Returns: Json[] }
      get_trips_for_pod_org: { Args: { p_org_id: string }; Returns: Json[] }
      get_trips_where_org_is_client: {
        Args: { p_org_id: string }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          compliance_decision: string | null
          compliance_exception_reason: string | null
          compliance_outstanding_summary: Json | null
          compliance_verified_at: string | null
          compliance_verified_by: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          dco_payee_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          execution_type: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          lane_id: string | null
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          operating_mode: string
          organization_id: string
          owner_user_id: string | null
          owner_vehicle_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          platform_fee_calc_snapshot: Json | null
          pod_hard_copy_awb_number: string | null
          pod_hard_copy_courier: string | null
          pod_hard_copy_received_by: string | null
          pod_received_at: string | null
          pod_required: boolean
          sale_rate_basis: string | null
          sale_unit_rate: number | null
          sequence_number: number | null
          source: string
          source_bid_id: string | null
          source_indent_code: string | null
          source_indent_id: string | null
          source_market_bid_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          supplier_rate_basis: string | null
          supplier_trip_sequence: number | null
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_trips_where_org_is_supplier: {
        Args: { p_org_id: string }
        Returns: {
          assigned_driver_id: string | null
          booking_ref: string | null
          created_at: string | null
          driver_display_trip_id: string | null
          dropoff_address: string | null
          dropoff_location: string | null
          dropoff_scheduled_at: string | null
          id: string | null
          instructions: string | null
          pickup_address: string | null
          pickup_location: string | null
          pickup_scheduled_at: string | null
          source_indent_code: string | null
          status: string | null
          supplier_trip_sequence: number | null
          updated_at: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips_supplier_view"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_unified_b2b_bootstrap: {
        Args: {
          p_hub_trip_bucket?: string
          p_include_message_bodies?: boolean
          p_message_limit?: number
          p_organization_id: string
          p_trip_limit?: number
          p_trip_offset?: number
        }
        Returns: Json
      }
      get_unlinked_counterparties: {
        Args: { p_org_id: string }
        Returns: {
          counterparty_name: string
          counterparty_type: string
          last_trip_date: string
          trip_count: number
        }[]
      }
      get_user_profile_by_email: {
        Args: { p_email: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          phone: string
          role: string
          user_id: string
        }[]
      }
      get_user_profile_by_phone: {
        Args: { p_phone: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          phone: string
          role: string
          user_id: string
        }[]
      }
      get_vehicle_for_trip_viewer: {
        Args: {
          p_trip_id: string
          p_vehicle_id: string
          p_viewer_org_id: string
        }
        Returns: Json
      }
      get_vehicle_monthly_analytics: {
        Args: { p_months_back?: number; p_org_id: string; p_vehicle_id: string }
        Returns: {
          expense: number
          km_driven: number
          margin_pct: number
          period: string
          profit: number
          revenue: number
          trip_count: number
        }[]
      }
      get_vehicles_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_verification_documents: { Args: { p_org_id: string }; Returns: Json }
      get_verification_job_status: { Args: { p_org_id: string }; Returns: Json }
      get_whatsapp_bootstrap_data: {
        Args: {
          p_hub_trip_bucket?: string
          p_include_message_bodies?: boolean
          p_message_limit?: number
          p_organization_id: string
          p_trip_limit?: number
          p_trip_offset?: number
        }
        Returns: Json
      }
      get_workspace_kyc_status: { Args: { p_org_id: string }; Returns: Json }
      global_search: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_org_id?: string
          p_query: string
          p_types?: string[]
        }
        Returns: {
          display_name: string
          entity_id: string
          entity_type: string
          network_ref: string
          org_id: string
          rank: number
          reference: string
          secondary_ref: string
        }[]
      }
      ground_ops_missing_mandatory_documents: {
        Args: { p_org_id: string; p_trip_id: string }
        Returns: string[]
      }
      harness_submit_marketplace_bid: {
        Args: {
          p_amount: number
          p_bidder_org_id: string
          p_bidder_user_id: string
          p_note?: string
          p_post_id: string
        }
        Returns: Json
      }
      has_member_surface: {
        Args: { p_org_id: string; p_surface_id: string }
        Returns: boolean
      }
      has_platform_permission: {
        Args: { p_permission: string; p_user_id: string }
        Returns: boolean
      }
      idempotency_acquire: {
        Args: {
          p_entity_type: string
          p_key: string
          p_org_id: string
          p_req_hash: string
          p_user_id: string
        }
        Returns: Json
      }
      idempotency_complete: {
        Args: { p_entity_id: string; p_key: string; p_response?: Json }
        Returns: undefined
      }
      idempotency_fail: {
        Args: { p_error: string; p_key: string }
        Returns: undefined
      }
      increment_credit_wallet: {
        Args: {
          p_amount: number
          p_notes?: string
          p_org_id: string
          p_reference_id?: string
          p_reference_type?: string
          p_type: string
        }
        Returns: {
          balance: number
          transaction_id: string
        }[]
      }
      increment_product_usage: {
        Args: {
          p_metric_key: string
          p_org_id: string
          p_product_id: string
          p_quantity?: number
        }
        Returns: undefined
      }
      increment_subcontract_seq: {
        Args: { p_sourcing_org_id: string }
        Returns: number
      }
      increment_supplier_trip_seq: {
        Args: { p_supplier_org_id: string }
        Returns: number
      }
      indent_creator_org_names_for_viewer: {
        Args: { p_trip_numbers: string[]; p_viewer_org: string }
        Returns: {
          creator_org_name: string
          trip_number: string
        }[]
      }
      indent_has_convertible_sale: {
        Args: { p_indent: Database["public"]["Tables"]["indents"]["Row"] }
        Returns: boolean
      }
      indent_open_for_marketplace_bids: {
        Args: { p_indent_id: string }
        Returns: boolean
      }
      indent_route_label: {
        Args: { p_indent: Database["public"]["Tables"]["indents"]["Row"] }
        Returns: string
      }
      indent_target_for_broadcast: {
        Args: { indent_id: string }
        Returns: {
          id: string
          organization_id: string
          supplier_rate_basis: string
          supplier_target: number
          weight: number
        }[]
      }
      ingest_application_log: {
        Args: {
          p_error_type?: string
          p_latency_ms?: number
          p_level: string
          p_message: string
          p_metadata?: Json
          p_method?: string
          p_request_id?: string
          p_route?: string
          p_service: string
          p_source?: string
          p_status_code?: number
          p_user_id_hash?: string
        }
        Returns: number
      }
      initiate_marketplace_fee_payment_order: {
        Args: {
          p_bid_id: string
          p_provider?: string
          p_provider_order_id: string
        }
        Returns: Json
      }
      invite_driver: {
        Args: {
          p_commission_per_km?: number
          p_commission_percent?: number
          p_email?: string
          p_name: string
          p_org_id: string
          p_payable_amount?: number
          p_phone: string
        }
        Returns: Json
      }
      invite_existing_user_to_org: {
        Args: {
          p_org_id: string
          p_permissions?: Json
          p_role: string
          p_user_id: string
        }
        Returns: {
          created_at: string | null
          id: string
          joined_at: string
          organization_id: string
          permissions: Json
          role: string
          status: string
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      invite_platform_admin: {
        Args: { p_role_id: string; p_target_user_id: string }
        Returns: string
      }
      is_active_org_member_phone: {
        Args: { p_org_id: string; p_phone: string }
        Returns: boolean
      }
      is_active_platform_user: { Args: { p_user_id: string }; Returns: boolean }
      is_app_migration_applied: {
        Args: { p_version: string }
        Returns: boolean
      }
      is_approved_supplier: {
        Args: { p_bidder_org: string; p_owner_org: string }
        Returns: boolean
      }
      is_compliance_blocking: {
        Args: { p_driver_id?: string; p_vehicle_id?: string }
        Returns: Json
      }
      is_current_user_dco_eligible: { Args: never; Returns: boolean }
      is_dco_eligible: { Args: { p_user_id: string }; Returns: boolean }
      is_driver_available: { Args: { p_user_id: string }; Returns: boolean }
      is_driver_fleet_owner: { Args: { p_user_id?: string }; Returns: boolean }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      is_org_owner: { Args: { org_id: string }; Returns: boolean }
      is_org_staff: { Args: { org_id: string }; Returns: boolean }
      is_uuidv4: { Args: { p_id: string }; Returns: boolean }
      is_uuidv7: { Args: { p_id: string }; Returns: boolean }
      is_valid_business_reference: { Args: { p_ref: string }; Returns: boolean }
      issue_customer_invoice: {
        Args: {
          p_cgst_amount: number
          p_client_id: string
          p_client_name: string
          p_created_by?: string
          p_draft_id?: string
          p_due_date?: string
          p_gst_rate: number
          p_idempotency_key?: string
          p_igst_amount: number
          p_invoice_date?: string
          p_notes?: string
          p_org_id: string
          p_sgst_amount: number
          p_subtotal: number
          p_total_amount: number
          p_trip_ids: string[]
        }
        Returns: string
      }
      issue_manual_invoice: {
        Args: {
          p_cgst_amount: number
          p_client_id: string
          p_client_name: string
          p_client_snapshot?: Json
          p_created_by?: string
          p_draft_id?: string
          p_due_date?: string
          p_gst_rate: number
          p_idempotency_key?: string
          p_igst_amount: number
          p_invoice_date?: string
          p_issuer_snapshot?: Json
          p_line_items?: Json
          p_notes?: string
          p_org_id: string
          p_payment_terms?: string
          p_sgst_amount: number
          p_subtotal: number
          p_tax_snapshot?: Json
          p_total_amount: number
        }
        Returns: string
      }
      issue_manual_plan_invoice: {
        Args: {
          p_billing_period_end: string
          p_billing_period_start: string
          p_cgst_amount: number
          p_client_id: string
          p_client_name: string
          p_client_snapshot?: Json
          p_created_by?: string
          p_draft_id?: string
          p_due_date?: string
          p_gst_rate: number
          p_idempotency_key?: string
          p_igst_amount: number
          p_invoice_date?: string
          p_issuer_snapshot?: Json
          p_line_items?: Json
          p_manual_plan_snapshot?: Json
          p_notes?: string
          p_org_id: string
          p_payment_terms?: string
          p_plan_id: string
          p_sgst_amount: number
          p_subtotal: number
          p_tax_snapshot?: Json
          p_total_amount: number
        }
        Returns: string
      }
      issue_sales_order_invoice: {
        Args: {
          p_cgst_amount: number
          p_client_id: string
          p_client_name: string
          p_client_snapshot?: Json
          p_created_by?: string
          p_draft_id?: string
          p_due_date?: string
          p_gst_rate: number
          p_idempotency_key?: string
          p_igst_amount: number
          p_invoice_date?: string
          p_issuer_snapshot?: Json
          p_line_items?: Json
          p_notes?: string
          p_org_id: string
          p_payment_terms?: string
          p_sales_order_id: string
          p_sgst_amount: number
          p_subtotal: number
          p_tax_snapshot?: Json
          p_total_amount: number
        }
        Returns: string
      }
      join_product_waitlist: {
        Args: {
          p_company_name?: string
          p_email: string
          p_fleet_size?: string
          p_full_name?: string
          p_org_id: string
          p_product_id: string
          p_use_case?: string
        }
        Returns: Json
      }
      kill_idle_in_transaction_sessions: {
        Args: { p_threshold?: string }
        Returns: {
          duration: string
          pid: number
          query: string
          terminated: boolean
        }[]
      }
      kyc_missing_required_documents: {
        Args: { p_org_id: string }
        Returns: string[]
      }
      leave_fleet: { Args: { p_organization_id: string }; Returns: undefined }
      link_driver_phone: {
        Args: { p_driver_id: string; p_phone: string }
        Returns: Json
      }
      list_dco_review_queue: {
        Args: never
        Returns: {
          decision_reason: string
          driver_email: string
          driver_name: string
          driver_phone: string
          requested_at: string
          reviewed_at: string
          status: string
          user_id: string
        }[]
      }
      list_driver_direct_bids_for_post: {
        Args: { p_post_id: string }
        Returns: {
          amount: number
          counter_amount: number
          created_at: string
          driver_avatar_seed: string
          driver_avatar_url: string
          driver_display_name: string
          driver_user_id: string
          id: string
          is_fleet_owner: boolean
          note: string
          post_id: string
          status: string
          updated_at: string
        }[]
      }
      list_market_bids_for_indent: {
        Args: { p_indent_id: string }
        Returns: {
          accepted_at: string
          amount: number
          bidder_display_name: string
          bidder_masked_phone: string
          bidder_organization_id: string
          bidder_organization_name: string
          bidder_phone: string
          bidder_type: string
          bidder_user_id: string
          created_at: string
          fee_payment_status: string
          id: string
          indent_id: string
          is_fleet_owner: boolean
          note: string
          platform_fee_amount: number
          status: string
          updated_at: string
          vehicle_body_type: string
          vehicle_brand: string
          vehicle_capacity: string
          vehicle_model: string
          vehicle_number: string
        }[]
      }
      list_my_org_market_bids: {
        Args: { p_limit?: number; p_org_id: string }
        Returns: {
          accepted_at: string
          amount: number
          created_at: string
          drop_location: string
          fee_payment_status: string
          id: string
          indent_id: string
          indent_number: string
          load_type: string
          note: string
          owner_masked_phone: string
          owner_organization_id: string
          owner_organization_name: string
          owner_phone: string
          pickup_area: string
          pickup_date: string
          platform_fee_amount: number
          status: string
        }[]
      }
      list_open_marketplace_loads_for_fleet_owner: {
        Args: { p_limit?: number }
        Returns: {
          circulation_target: string
          created_at: string
          creator_organization_avatar_seed: string
          creator_organization_id: string
          creator_organization_logo_url: string
          creator_organization_name: string
          drop_location: string
          id: string
          indent_number: string
          load_type: string
          pickup_area: string
          pickup_date: string
          rate_offer: number
          status: string
          vehicle_type: string
        }[]
      }
      list_open_marketplace_loads_for_org: {
        Args: { p_limit?: number; p_org_id: string }
        Returns: {
          circulation_target: string
          created_at: string
          creator_organization_id: string
          creator_organization_name: string
          drop_location: string
          id: string
          indent_number: string
          is_sponsored: boolean
          load_type: string
          pickup_area: string
          pickup_date: string
          rate_offer: number
          reach_campaign_id: string
          status: string
          vehicle_type: string
        }[]
      }
      list_platform_admins: {
        Args: never
        Returns: {
          created_at: string
          email: string
          last_sign_in_at: string
          platform_user_id: string
          role_id: string
          role_name: string
          status: string
          user_id: string
        }[]
      }
      lock_driver_phone: { Args: { p_last10: string }; Returns: undefined }
      log_client_audit: {
        Args: {
          p_action: string
          p_client_id: string
          p_entity_id: string
          p_entity_type: string
          p_field_name?: string
          p_new_value?: string
          p_old_value?: string
          p_org_id: string
        }
        Returns: undefined
      }
      log_id_generation: {
        Args: {
          p_entity_id?: string
          p_entity_type: string
          p_generated: string
          p_latency_ms?: number
          p_org_id: string
          p_path?: string
          p_reference?: string
        }
        Returns: undefined
      }
      lookup_by_reference: {
        Args: { p_ref: string }
        Returns: {
          entity_id: string
          entity_type: string
          org_id: string
        }[]
      }
      make_operational_org_code: {
        Args: { p_org_id: string; p_org_name: string; p_salt?: number }
        Returns: string
      }
      mark_chat_conversation_read: {
        Args: { p_conversation_id: string; p_up_to?: string }
        Returns: undefined
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_delivered: { Args: { p_message_ids: string[] }; Returns: undefined }
      mark_messages_seen: {
        Args: { p_conversation_id: string; p_message_ids: string[] }
        Returns: undefined
      }
      mark_network_conversation_read: {
        Args: { p_conversation_id: string; p_reader_org_id: string }
        Returns: undefined
      }
      mark_reach_campaign_source_deleted: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      mark_reach_referral_bid: {
        Args: { p_bid_id: string; p_referral_id: string }
        Returns: Json
      }
      mark_shared_ledger_notification_handled: {
        Args: { p_id: string; p_org_id: string }
        Returns: undefined
      }
      mark_shared_ledger_notification_read: {
        Args: { p_id: string; p_org_id: string }
        Returns: undefined
      }
      mark_support_ticket_read_by_user: {
        Args: { p_ticket_id: string }
        Returns: Json
      }
      mark_trip_compliance_verified: {
        Args: { p_trip_id: string }
        Returns: undefined
      }
      market_indents_for_org: {
        Args: { p_org_id: string }
        Returns: {
          assigned_supplier_id: string
          assigned_supplier_rate: number
          circulation_target: string
          client_name: string
          client_price: number
          created_at: string
          creator_organization_name: string
          drop_location: string
          id: string
          indent_number: string
          load_type: string
          organization_id: string
          pickup_area: string
          pickup_date: string
          status: string
          supplier_target: number
          updated_at: string
          vehicle_type: string
          weight: number
        }[]
      }
      mask_phone_last4: { Args: { p_phone: string }; Returns: string }
      match_driver_by_phone: {
        Args: {
          p_org_id: string
          p_phone: string
          p_require_unlinked?: boolean
        }
        Returns: {
          assigned_vehicle_id: string | null
          avatar_seed: string | null
          avatar_url: string | null
          commission_per_km: number | null
          commission_percent: number | null
          created_at: string | null
          deleted_at: string | null
          driver_code: string | null
          email: string | null
          emergency_contact: string | null
          emergency_name: string | null
          hired_at: string
          id: string
          left_at: string | null
          license_number: string | null
          name: string
          organization_id: string
          payable_amount: number | null
          phone: string | null
          phone_normalised: string | null
          relationship_origin: string | null
          relationship_status: string | null
          status: string
          tracking_only: boolean
          updated_at: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "drivers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      member_role_permissions_unchanged: {
        Args: {
          p_member_id: string
          p_new_permissions: Json
          p_new_role: string
        }
        Returns: boolean
      }
      my_organization_ids: { Args: never; Returns: string[] }
      next_indent_number: { Args: { p_org_id: string }; Returns: string }
      next_operational_sequence_value: {
        Args: { p_entity_type: string; p_org_id: string }
        Returns: number
      }
      next_order_number: { Args: { p_org_id: string }; Returns: string }
      next_plan_number: { Args: { p_org_id: string }; Returns: string }
      next_trip_number: { Args: { p_org_id: string }; Returns: string }
      normalise_phone: { Args: { raw: string }; Returns: string }
      normalize_phone_canon: { Args: { p_phone: string }; Returns: string }
      normalize_phone_last10: { Args: { p_phone: string }; Returns: string }
      normalize_phone_number: { Args: { p: string }; Returns: string }
      operational_prefix_for_entity: {
        Args: { p_entity_type: string }
        Returns: string
      }
      ops_agent_rate_limit_try_consume: {
        Args: {
          p_max_per_window?: number
          p_user_id: string
          p_window_seconds?: number
        }
        Returns: Json
      }
      org_display_name: { Args: { p_org_id: string }; Returns: string }
      org_has_kyc_document: {
        Args: { p_org_id: string; p_types: string[] }
        Returns: boolean
      }
      organization_name_is_taken: { Args: { p_name: string }; Returns: boolean }
      platform_approve_dco: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          decision_reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "dco_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_approve_driver_kyc_document: {
        Args: { p_document_id: string; p_notes?: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          doc_label: string | null
          doc_type: string
          driver_user_id: string
          file_name: string | null
          file_size_bytes: number | null
          id: string
          is_mandatory: boolean
          mime_type: string | null
          rejection_notes: string | null
          status: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "driver_kyc_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_approve_verification: {
        Args: { p_notes?: string; p_org_id: string }
        Returns: Json
      }
      platform_next_canonical_code: {
        Args: { p_prefix: string; p_width?: number }
        Returns: string
      }
      platform_reinstate_dco: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          decision_reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "dco_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_reject_dco: {
        Args: { p_reason: string; p_user_id: string }
        Returns: {
          created_at: string
          decision_reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "dco_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_reject_driver_kyc_document: {
        Args: { p_document_id: string; p_rejection_reason: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          doc_label: string | null
          doc_type: string
          driver_user_id: string
          file_name: string | null
          file_size_bytes: number | null
          id: string
          is_mandatory: boolean
          mime_type: string | null
          rejection_notes: string | null
          status: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "driver_kyc_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_reject_verification: {
        Args: { p_notes?: string; p_org_id: string; p_rejection_reasons: Json }
        Returns: Json
      }
      platform_review_driver_kyc_submission: {
        Args: { p_driver_user_id: string; p_notes?: string; p_status: string }
        Returns: {
          attempt_count: number
          created_at: string
          driver_user_id: string
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "driver_kyc_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_suspend_dco: {
        Args: { p_reason: string; p_user_id: string }
        Returns: {
          created_at: string
          decision_reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "dco_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_user_holds_any_role: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      platform_user_holds_role: {
        Args: { p_platform_user_id: string; p_role_name: string }
        Returns: boolean
      }
      platform_user_id_for_auth_user: {
        Args: { p_user_id: string }
        Returns: string
      }
      platform_would_remove_last_super_admin: {
        Args: { p_excluding_platform_user_id: string }
        Returns: boolean
      }
      precheck_team_invite_contact: {
        Args: { p_email?: string; p_org_id: string; p_phone: string }
        Returns: Json
      }
      process_b2b_event: {
        Args: {
          p_event_type: string
          p_organization_id: string
          p_payload?: Json
          p_trip_id: string
        }
        Returns: Json
      }
      prune_cron_incident_snapshots: { Args: never; Returns: undefined }
      prune_cron_job_run_details: { Args: never; Returns: undefined }
      publish_reach_campaign: {
        Args: {
          p_distribution_channels?: string[]
          p_driver_reward_enabled?: boolean
          p_org_id: string
          p_payment_method: string
          p_plan_id: string
          p_post_id: string
          p_reward_amount?: number
          p_reward_budget?: number
          p_reward_type?: string
        }
        Returns: Json
      }
      quoted_indents_for_org: {
        Args: { org_id: string }
        Returns: {
          assigned_supplier_id: string
          assigned_supplier_rate: number
          circulation_target: string
          client_name: string
          client_price: number
          created_at: string
          creator_organization_name: string
          drop_location: string
          id: string
          indent_number: string
          load_type: string
          organization_id: string
          pickup_area: string
          pickup_date: string
          status: string
          supplier_target: number
          updated_at: string
          vehicle_type: string
          weight: number
        }[]
      }
      recommend_reach_campaign: {
        Args: {
          p_campaign_id: string
          p_fleet_org_id: string
          p_note?: string
          p_reason?: string
          p_suggested_rate?: number
        }
        Returns: Json
      }
      record_activity: {
        Args: {
          p_activity_type: string
          p_actor_id: string
          p_actor_name: string
          p_actor_type: string
          p_context?: Json
          p_is_public?: boolean
          p_org_id?: string
          p_target_id: string
          p_target_name?: string
          p_target_ref?: string
          p_target_type: string
        }
        Returns: string
      }
      record_reach_driver_event: {
        Args: { p_campaign_id: string; p_event_type: string }
        Returns: undefined
      }
      record_reach_event: {
        Args: {
          p_actor_org_id: string
          p_campaign_id: string
          p_event_type: string
        }
        Returns: undefined
      }
      record_referral: {
        Args: { p_referred_org_id: string; p_referrer_org_id: string }
        Returns: string
      }
      record_referral_by_code: {
        Args: { p_code: string; p_referred_org_id: string }
        Returns: string
      }
      record_support_ticket_attachment: {
        Args: {
          p_comment_id?: string
          p_mime_type?: string
          p_size_bytes?: number
          p_storage_path: string
          p_ticket_id: string
        }
        Returns: string
      }
      record_trip_hard_copy_pod: {
        Args: {
          p_awb_number?: string
          p_comment?: string
          p_courier?: string
          p_received_by?: string
          p_trip_id: string
        }
        Returns: boolean
      }
      refresh_dashboard_trip_metrics: { Args: never; Returns: undefined }
      refresh_trip_chat_room_team: {
        Args: { p_trip_id: string }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      regenerate_trip_otp: {
        Args: { p_trip_id: string; p_ttl_minutes?: number }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      register_verification_document: {
        Args: {
          p_document_type: Database["public"]["Enums"]["verification_document_type"]
          p_mime_type: string
          p_org_id: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: Json
      }
      reject_driver_direct_bid: { Args: { p_bid_id: string }; Returns: Json }
      reject_driver_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      reject_market_bid: { Args: { p_bid_id: string }; Returns: Json }
      reject_team_invite: { Args: { p_org_id: string }; Returns: undefined }
      release_and_reopen_indent: {
        Args: { p_indent_id: string }
        Returns: {
          assigned_supplier_id: string | null
          assigned_supplier_rate: number | null
          circulation_target: string | null
          client_id: string | null
          client_name: string
          client_price: number
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          display_indent_id: string | null
          drop_location: string
          execution_plan_id: string | null
          id: string
          indent_code: string | null
          indent_number: string
          indent_operational_code: string | null
          lane_id: string | null
          last_saved_at: string | null
          load_type: string | null
          organization_id: string
          owner_user_id: string | null
          pickup_area: string
          pickup_date: string | null
          sale_rate_basis: string | null
          sale_unit_rate: number | null
          sales_order_id: string | null
          sequence_number: number | null
          shared_at: string | null
          status: string
          supplier_rate_basis: string | null
          supplier_target: number
          updated_at: string | null
          vehicle_type: string | null
          warehouse_id: string | null
          weight: number | null
        }
        SetofOptions: {
          from: "*"
          to: "indents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_platform_admin: {
        Args: { p_platform_user_id: string }
        Returns: undefined
      }
      reopen_driver_invite: {
        Args: {
          p_commission_per_km?: number
          p_commission_percent?: number
          p_from_org_name?: string
          p_invitee_name?: string
          p_org_id: string
          p_payable_amount?: number
          p_to_user_id: string
        }
        Returns: Json
      }
      reply_to_support_ticket: {
        Args: { p_body: string; p_ticket_id: string }
        Returns: Json
      }
      request_dco_status: {
        Args: never
        Returns: {
          created_at: string
          decision_reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "dco_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_kyc_document_review: { Args: { p_org_id: string }; Returns: Json }
      reset_driver_signup_invite: {
        Args: { p_driver_id: string }
        Returns: Json
      }
      resolve_dispute:
        | {
            Args: {
              p_action: string
              p_dispute_id: string
              p_resolved_by_org_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_actor_org_id: string
              p_dispute_id: string
              p_resolution: string
            }
            Returns: undefined
          }
      resolve_ocr_scan_monthly_limit: {
        Args: { p_org_id: string }
        Returns: {
          monthly_limit: number
          tier: string
        }[]
      }
      resolve_pending_team_invitations_by_email: {
        Args: { p_email: string }
        Returns: {
          business_unit_name: string
          created_at: string
          department_name: string
          expires_at: string
          invite_id: string
          invited_by_name: string
          invitee_email: string
          invitee_name: string
          is_expired: boolean
          organization_id: string
          organization_name: string
          platform_role: string
          role: string
          status: string
        }[]
      }
      resolve_pending_team_invitations_by_phone: {
        Args: { p_phone: string }
        Returns: {
          business_unit_name: string
          created_at: string
          department_name: string
          expires_at: string
          invite_id: string
          invited_by_name: string
          invitee_email: string
          invitee_name: string
          is_expired: boolean
          organization_id: string
          organization_name: string
          platform_role: string
          role: string
          status: string
        }[]
      }
      revoke_ground_ops_pickup_status: {
        Args: { p_trip_id: string }
        Returns: Json
      }
      run_db_health_monitor: { Args: never; Returns: undefined }
      run_db_health_monitor_guarded: { Args: never; Returns: undefined }
      run_monitor_watchdog: { Args: never; Returns: undefined }
      run_monitor_watchdog_guarded: { Args: never; Returns: undefined }
      search_chat_messages: {
        Args: { p_limit?: number; p_organization_id: string; p_query: string }
        Returns: {
          client_message_id: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          legacy_source: string | null
          message_type: string
          metadata: Json
          organization_id: string
          reply_to_id: string | null
          sender_name: string
          sender_role: string | null
          sender_type: string
          sender_user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "chat_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      seed_stop_execution_state_for_trip: {
        Args: { p_trip_id: string }
        Returns: undefined
      }
      send_chat_message: {
        Args: {
          p_client_message_id?: string
          p_content: string
          p_conversation_id: string
          p_mentions?: string[]
          p_message_type?: string
          p_metadata?: Json
          p_reply_to_id?: string
        }
        Returns: {
          client_message_id: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          legacy_source: string | null
          message_type: string
          metadata: Json
          organization_id: string
          reply_to_id: string | null
          sender_name: string
          sender_role: string | null
          sender_type: string
          sender_user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "chat_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_driver_signup_match_invite:
        | { Args: { p_driver_id: string }; Returns: Json }
        | {
            Args: {
              p_commission_per_km?: number
              p_commission_percent?: number
              p_driver_id: string
              p_payable_amount?: number
            }
            Returns: Json
          }
      send_trip_chat_message: {
        Args: {
          p_content: string
          p_conversation_id: string
          p_message_type?: string
          p_metadata?: Json
          p_sender_name: string
          p_sender_role: string
          p_sender_user_id?: string
        }
        Returns: {
          content: string
          context_indent_id: string | null
          context_trip_id: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean
          is_delivered: boolean
          is_read: boolean
          message_type: string
          metadata: Json | null
          organization_id: string
          priority_weight: number
          reactions: Json | null
          read_at: string | null
          reply_to_id: string | null
          reply_to_preview: Json | null
          sender_avatar_seed: string | null
          sender_name: string
          sender_role: string
          sender_user_id: string | null
          visibility_tags: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "trip_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_member_role: {
        Args: { p_member_id: string; p_permissions: Json; p_role: string }
        Returns: Json
      }
      set_member_surfaces_as_manager: {
        Args: { p_member_id: string; p_surfaces: Json }
        Returns: Json
      }
      set_platform_user_status: {
        Args: { p_platform_user_id: string; p_status: string }
        Returns: undefined
      }
      set_trip_owner_vehicle: {
        Args: { p_owner_vehicle_id: string; p_trip_id: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simulate_ground_ops_pickup_status: {
        Args: { p_new_status: string; p_trip_id: string }
        Returns: Json
      }
      soft_delete_trip: {
        Args: { p_org_id: string; p_trip_id: string }
        Returns: undefined
      }
      soft_delete_trip_chat_by_storage_path: {
        Args: { p_storage_path: string; p_trip_id: string }
        Returns: number
      }
      sqids_encode_booking_ref: { Args: { p_num: number }; Returns: string }
      sqids_encode_id: { Args: { p_num: number }; Returns: string }
      sqids_encode_numbers: {
        Args: { p_attempt?: number; p_min_length?: number; p_numbers: number[] }
        Returns: string
      }
      sqids_encode_sub_trip_code: {
        Args: { p_operational_code: string; p_seq: number }
        Returns: string
      }
      sqids_shuffle: { Args: { p_alphabet: string }; Returns: string }
      sqids_to_id: {
        Args: { p_alphabet: string; p_num: number }
        Returns: string
      }
      sqids_working_alphabet: { Args: never; Returns: string }
      submit_atomic_feedback: {
        Args: {
          p_comment?: string
          p_message_id: string
          p_organization_id: string
          p_rated_id: string
          p_rated_type: string
          p_score: number
          p_tags?: string[]
          p_trip_id: string
        }
        Returns: Json
      }
      submit_business_event: {
        Args: {
          p_content: string
          p_conversation_id?: string
          p_event_type: string
          p_metadata?: Json
          p_new_trip_status?: string
          p_organization_id: string
          p_trip_id: string
          p_user_id?: string
          p_user_name?: string
        }
        Returns: Json
      }
      submit_business_verification: {
        Args: {
          p_address_pincode?: string
          p_address_proof_path?: string
          p_address_proof_type?: string
          p_gst_not_applicable?: boolean
          p_org_id: string
          p_registration_type?: Database["public"]["Enums"]["registration_type_enum"]
        }
        Returns: Json
      }
      submit_driver_direct_bid: {
        Args: { p_amount: number; p_note?: string; p_post_id: string }
        Returns: Json
      }
      submit_driver_shipper_feedback: {
        Args: {
          p_comment?: string
          p_message_id: string
          p_score: number
          p_trip_id: string
        }
        Returns: Json
      }
      submit_market_bid: {
        Args: {
          p_amount: number
          p_bidder_organization_id?: string
          p_indent_id: string
          p_note?: string
          p_owner_vehicle_id?: string
        }
        Returns: Json
      }
      submit_pulse_bid_with_direct_quote: {
        Args: {
          p_amount: number
          p_bidder_org_id: string
          p_note: string
          p_post_id: string
        }
        Returns: Json
      }
      submit_support_ticket: {
        Args: {
          p_category: string
          p_description: string
          p_indent_id?: string
          p_market_bid_id?: string
          p_organization_id?: string
          p_owner_vehicle_id?: string
          p_source_screen?: string
          p_subject: string
          p_trip_id?: string
        }
        Returns: Json
      }
      submit_trip_feedback: {
        Args: {
          p_message_id: string
          p_organization_id: string
          p_rated_id: string
          p_rated_type: string
          p_score: number
          p_tags: string[]
          p_trip_id: string
        }
        Returns: Json
      }
      sync_driver_rows_user_id_for_profile: {
        Args: { p_profile_id: string }
        Returns: number
      }
      sync_my_driver_rows_user_id: { Args: never; Returns: number }
      toggle_chat_reaction: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: Json
      }
      toggle_trip_message_reaction: {
        Args: {
          p_emoji: string
          p_message_id: string
          p_org_id: string
          p_user_id: string
        }
        Returns: Json
      }
      tracking_detect_geofence_transition: {
        Args: {
          p_driver_id: string
          p_latitude: number
          p_longitude: number
          p_org_id: string
          p_recorded_at: string
          p_trip_id: string
        }
        Returns: undefined
      }
      tracking_record_checkpoint: {
        Args: {
          p_accuracy?: number
          p_driver_id: string
          p_heading?: number
          p_latitude: number
          p_longitude: number
          p_org_id: string
          p_recorded_at?: string
          p_session_id: string
          p_source?: string
          p_speed_kmh?: number
          p_trip_id: string
        }
        Returns: Json
      }
      transfer_organization_ownership: {
        Args: { p_new_owner_user_id: string; p_org_id: string }
        Returns: Json
      }
      trip_otp_increment_failed: {
        Args: { p_code: string }
        Returns: undefined
      }
      update_incident_status: {
        Args: { p_incident_id: string; p_new_status: string }
        Returns: boolean
      }
      update_organization_logo: {
        Args: { p_logo_url: string; p_org_id: string }
        Returns: undefined
      }
      update_workspace_kyc: {
        Args: {
          p_cin?: string
          p_gstin?: string
          p_org_id: string
          p_pan?: string
        }
        Returns: Json
      }
      upgrade_reach_campaign: {
        Args: {
          p_campaign_id: string
          p_new_plan_id: string
          p_payment_method: string
        }
        Returns: Json
      }
      upsert_driver_org_membership: {
        Args: {
          p_organization_id: string
          p_status?: string
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_entity_anchor: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_legacy_ref?: string
          p_org_id: string
        }
        Returns: undefined
      }
      upsert_trip_subcontract: {
        Args: {
          p_rate: number
          p_supplier_id: string
          p_trip_id: string
          p_viewer_org_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          rate: number
          status: string
          sub_driver_id: string | null
          sub_supplier_name: string | null
          sub_supplier_on_platform: boolean
          sub_supplier_org_id: string | null
          sub_supplier_phone: string | null
          sub_trip_code: string | null
          supplier_id: string | null
          trip_id: string
          updated_at: string
          viewer_org_id: string
        }
        SetofOptions: {
          from: "*"
          to: "trip_subcontracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      use_vehicle_document_for_trip: {
        Args: {
          p_document_type: string
          p_entity_document_id: string
          p_trip_id: string
        }
        Returns: Json
      }
      uuidv7_generate: { Args: never; Returns: string }
      uuidv7_timestamp: { Args: { p_id: string }; Returns: string }
      validate_identity_integrity: { Args: { p_since?: string }; Returns: Json }
      verify_trip_document: {
        Args: {
          p_document_id: string
          p_rejection_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      windowed_trip_message_history: {
        Args: {
          p_before?: string
          p_conversation_id: string
          p_limit?: number
          p_party_type?: string
        }
        Returns: {
          content: string
          context_indent_id: string | null
          context_trip_id: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean
          is_delivered: boolean
          is_read: boolean
          message_type: string
          metadata: Json | null
          organization_id: string
          priority_weight: number
          reactions: Json | null
          read_at: string | null
          reply_to_id: string | null
          reply_to_preview: Json | null
          sender_avatar_seed: string | null
          sender_name: string
          sender_role: string
          sender_user_id: string | null
          visibility_tags: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trip_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      kyc_verification_status:
        | "unverified"
        | "pending"
        | "verified"
        | "rejected"
      ocr_job_status: "pending" | "processing" | "completed" | "failed"
      pillar_status_type:
        | "NOT_STARTED"
        | "QUEUED"
        | "PROCESSING"
        | "PASSED"
        | "MANUAL_REVIEW"
        | "FAILED"
      registration_type_enum:
        | "proprietorship"
        | "llp"
        | "pvt_ltd"
        | "public_ltd"
        | "partnership"
      verification_document_status:
        | "UPLOADED"
        | "OCR_PASSED"
        | "OCR_FAILED"
        | "MANUAL_REVIEW"
        | "REPLACED"
      verification_document_type:
        | "gst_certificate"
        | "pan_card"
        | "address_proof_lease"
        | "address_proof_utility_bill"
        | "address_proof_other"
        | "cin_certificate"
        | "msme_certificate"
        | "incorporation_certificate"
        | "partnership_deed"
        | "llp_agreement"
        | "iec_certificate"
      verification_job_status:
        | "QUEUED"
        | "PROCESSING"
        | "COMPLETED"
        | "PARTIAL_REVIEW"
        | "FAILED"
      verification_tier_enum:
        | "TIER_0_SANDBOX"
        | "TIER_1_PARTIAL"
        | "TIER_2_FULL"
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
      kyc_verification_status: [
        "unverified",
        "pending",
        "verified",
        "rejected",
      ],
      ocr_job_status: ["pending", "processing", "completed", "failed"],
      pillar_status_type: [
        "NOT_STARTED",
        "QUEUED",
        "PROCESSING",
        "PASSED",
        "MANUAL_REVIEW",
        "FAILED",
      ],
      registration_type_enum: [
        "proprietorship",
        "llp",
        "pvt_ltd",
        "public_ltd",
        "partnership",
      ],
      verification_document_status: [
        "UPLOADED",
        "OCR_PASSED",
        "OCR_FAILED",
        "MANUAL_REVIEW",
        "REPLACED",
      ],
      verification_document_type: [
        "gst_certificate",
        "pan_card",
        "address_proof_lease",
        "address_proof_utility_bill",
        "address_proof_other",
        "cin_certificate",
        "msme_certificate",
        "incorporation_certificate",
        "partnership_deed",
        "llp_agreement",
        "iec_certificate",
      ],
      verification_job_status: [
        "QUEUED",
        "PROCESSING",
        "COMPLETED",
        "PARTIAL_REVIEW",
        "FAILED",
      ],
      verification_tier_enum: [
        "TIER_0_SANDBOX",
        "TIER_1_PARTIAL",
        "TIER_2_FULL",
      ],
    },
  },
} as const
