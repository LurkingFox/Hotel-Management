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
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      access_log: {
        Row: {
          accessed_at: string | null
          credential_identifier: string
          guest_name: string | null
          id: string
          issued_by: string | null
          note: string | null
          result: Database["public"]["Enums"]["access_result"]
          room_id: string | null
        }
        Insert: {
          accessed_at?: string | null
          credential_identifier: string
          guest_name?: string | null
          id?: string
          issued_by?: string | null
          note?: string | null
          result: Database["public"]["Enums"]["access_result"]
          room_id?: string | null
        }
        Update: {
          accessed_at?: string | null
          credential_identifier?: string
          guest_name?: string | null
          id?: string
          issued_by?: string | null
          note?: string | null
          result?: Database["public"]["Enums"]["access_result"]
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_log_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          balance_ghs: number | null
          cancel_note: string | null
          check_in: string
          check_out_actual: string | null
          check_out_expected: string
          created_at: string | null
          guest_name: string
          guest_profile_id: string | null
          guest_phone: string | null
          id: string
          nights: number
          paid_ghs: number
          room_id: string | null
          status: Database["public"]["Enums"]["booking_status"]
          total_ghs: number
        }
        Insert: {
          balance_ghs?: number | null
          cancel_note?: string | null
          check_in: string
          check_out_actual?: string | null
          check_out_expected: string
          created_at?: string | null
          guest_name: string
          guest_profile_id?: string | null
          guest_phone?: string | null
          id?: string
          nights: number
          paid_ghs?: number
          room_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          total_ghs: number
        }
        Update: {
          balance_ghs?: number | null
          cancel_note?: string | null
          check_in?: string
          check_out_actual?: string | null
          check_out_expected?: string
          created_at?: string | null
          guest_name?: string
          guest_profile_id?: string | null
          guest_phone?: string | null
          id?: string
          nights?: number
          paid_ghs?: number
          room_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          total_ghs?: number
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_profile_id_fkey"
            columns: ["guest_profile_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_access_credentials: {
        Row: {
          booking_id: string
          created_at: string
          credential_code: string | null
          id: string
          issued_by: string | null
          issued_to: string | null
          note: string | null
          provider: string
          provider_error_code: string | null
          provider_error_message: string | null
          provider_event_id: string | null
          provider_event_occurred_at: string | null
          provider_event_type: string | null
          provider_device_id: string | null
          provider_reference: string | null
          provider_status: string | null
          room_id: string | null
          status: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          credential_code?: string | null
          id?: string
          issued_by?: string | null
          issued_to?: string | null
          note?: string | null
          provider: string
          provider_error_code?: string | null
          provider_error_message?: string | null
          provider_event_id?: string | null
          provider_event_occurred_at?: string | null
          provider_event_type?: string | null
          provider_device_id?: string | null
          provider_reference?: string | null
          provider_status?: string | null
          room_id?: string | null
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          credential_code?: string | null
          id?: string
          issued_by?: string | null
          issued_to?: string | null
          note?: string | null
          provider?: string
          provider_error_code?: string | null
          provider_error_message?: string | null
          provider_event_id?: string | null
          provider_event_occurred_at?: string | null
          provider_event_type?: string | null
          provider_device_id?: string | null
          provider_reference?: string | null
          provider_status?: string | null
          room_id?: string | null
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_access_credentials_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_access_credentials_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_extension_audits: {
        Row: {
          authorization_mode: string
          authorized_by: string | null
          booking_id: string
          confirmation_note: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          incremental_amount_ghs: number
          new_check_out_expected: string
          new_total_ghs: number
          payment_method: Database["public"]["Enums"]["pay_method"] | null
          payment_recorded_ghs: number
          payment_reference: string | null
          previous_check_out_expected: string
          previous_total_ghs: number
          reason: string
          requested_by: string
          requester_role: string
        }
        Insert: {
          authorization_mode: string
          authorized_by?: string | null
          booking_id: string
          confirmation_note?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          incremental_amount_ghs: number
          new_check_out_expected: string
          new_total_ghs: number
          payment_method?: Database["public"]["Enums"]["pay_method"] | null
          payment_recorded_ghs?: number
          payment_reference?: string | null
          previous_check_out_expected: string
          previous_total_ghs: number
          reason: string
          requested_by: string
          requester_role: string
        }
        Update: {
          authorization_mode?: string
          authorized_by?: string | null
          booking_id?: string
          confirmation_note?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          incremental_amount_ghs?: number
          new_check_out_expected?: string
          new_total_ghs?: number
          payment_method?: Database["public"]["Enums"]["pay_method"] | null
          payment_recorded_ghs?: number
          payment_reference?: string | null
          previous_check_out_expected?: string
          previous_total_ghs?: number
          reason?: string
          requested_by?: string
          requester_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_extension_audits_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_profile: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          email: string | null
          id: boolean
          logo_path: string | null
          logo_url: string | null
          name: string
          phone: string | null
          region: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          email?: string | null
          id?: boolean
          logo_path?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          region?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          email?: string | null
          id?: boolean
          logo_path?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          region?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: []
      }
      guest_identity_documents: {
        Row: {
          created_at: string
          document_number: string
          document_type: Database["public"]["Enums"]["identity_document_type"]
          expires_on: string | null
          guest_profile_id: string
          id: string
          issued_on: string | null
          issuing_country: string | null
          status: Database["public"]["Enums"]["identity_document_status"]
          updated_at: string
          verification_notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          document_number: string
          document_type: Database["public"]["Enums"]["identity_document_type"]
          expires_on?: string | null
          guest_profile_id: string
          id?: string
          issued_on?: string | null
          issuing_country?: string | null
          status?: Database["public"]["Enums"]["identity_document_status"]
          updated_at?: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          document_number?: string
          document_type?: Database["public"]["Enums"]["identity_document_type"]
          expires_on?: string | null
          guest_profile_id?: string
          id?: string
          issued_on?: string | null
          issuing_country?: string | null
          status?: Database["public"]["Enums"]["identity_document_status"]
          updated_at?: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_identity_documents_guest_profile_id_fkey"
            columns: ["guest_profile_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_profiles: {
        Row: {
          city: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string
          id: string
          kyc_notes: string | null
          kyc_status: Database["public"]["Enums"]["guest_kyc_status"]
          last_stayed_at: string | null
          nationality: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          id?: string
          kyc_notes?: string | null
          kyc_status?: Database["public"]["Enums"]["guest_kyc_status"]
          last_stayed_at?: string | null
          nationality?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          id?: string
          kyc_notes?: string | null
          kyc_status?: Database["public"]["Enums"]["guest_kyc_status"]
          last_stayed_at?: string | null
          nationality?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      operational_handoff_items: {
        Row: {
          booking_id: string | null
          created_at: string
          detail: string | null
          due_at: string | null
          handoff_id: string
          id: string
          item_type: Database["public"]["Enums"]["operational_handoff_item_type"]
          owner_role: string | null
          priority: Database["public"]["Enums"]["operational_handoff_priority"]
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          room_id: string | null
          service_request_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          detail?: string | null
          due_at?: string | null
          handoff_id: string
          id?: string
          item_type: Database["public"]["Enums"]["operational_handoff_item_type"]
          owner_role?: string | null
          priority?: Database["public"]["Enums"]["operational_handoff_priority"]
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          service_request_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          detail?: string | null
          due_at?: string | null
          handoff_id?: string
          id?: string
          item_type?: Database["public"]["Enums"]["operational_handoff_item_type"]
          owner_role?: string | null
          priority?: Database["public"]["Enums"]["operational_handoff_priority"]
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          service_request_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_handoff_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_handoff_items_handoff_id_fkey"
            columns: ["handoff_id"]
            isOneToOne: false
            referencedRelation: "operational_handoffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_handoff_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_handoff_items_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_handoffs: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          acknowledged_by_staff_id: string | null
          closed_at: string | null
          created_at: string
          created_by_name: string
          created_by_role: string | null
          created_by_staff_id: string | null
          handoff_scope: string
          id: string
          shift_id: string | null
          status: Database["public"]["Enums"]["operational_handoff_status"]
          summary: string | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledged_by_staff_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by_name: string
          created_by_role?: string | null
          created_by_staff_id?: string | null
          handoff_scope?: string
          id?: string
          shift_id?: string | null
          status?: Database["public"]["Enums"]["operational_handoff_status"]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledged_by_staff_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by_name?: string
          created_by_role?: string | null
          created_by_staff_id?: string | null
          handoff_scope?: string
          id?: string
          shift_id?: string | null
          status?: Database["public"]["Enums"]["operational_handoff_status"]
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_handoffs_acknowledged_by_staff_id_fkey"
            columns: ["acknowledged_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_handoffs_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_handoffs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_approvals: {
        Row: {
          approval_type: Database["public"]["Enums"]["manager_approval_type"]
          booking_id: string | null
          detail: string | null
          id: string
          metadata: Json
          requested_at: string
          requested_by: string
          requested_by_role: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["manager_approval_status"]
          target_id: string | null
          target_table: string | null
          title: string
        }
        Insert: {
          approval_type: Database["public"]["Enums"]["manager_approval_type"]
          booking_id?: string | null
          detail?: string | null
          id?: string
          metadata?: Json
          requested_at?: string
          requested_by: string
          requested_by_role?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["manager_approval_status"]
          target_id?: string | null
          target_table?: string | null
          title: string
        }
        Update: {
          approval_type?: Database["public"]["Enums"]["manager_approval_type"]
          booking_id?: string | null
          detail?: string | null
          id?: string
          metadata?: Json
          requested_at?: string
          requested_by?: string
          requested_by_role?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["manager_approval_status"]
          target_id?: string | null
          target_table?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_approvals_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          booking_id: string | null
          created_at: string | null
          id: string
          message: string
          read: boolean
          triggered_by: string
          type: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          message: string
          read?: boolean
          triggered_by: string
          type: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean
          triggered_by?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          }
        ]
      }
      payments: {
        Row: {
          amount_ghs: number
          booking_id: string | null
          id: string
          method: Database["public"]["Enums"]["pay_method"]
          paid_at: string | null
          received_by: string
          reference: string | null
        }
        Insert: {
          amount_ghs: number
          booking_id?: string | null
          id?: string
          method: Database["public"]["Enums"]["pay_method"]
          paid_at?: string | null
          received_by: string
          reference?: string | null
        }
        Update: {
          amount_ghs?: number
          booking_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["pay_method"]
          paid_at?: string | null
          received_by?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      room_access_devices: {
        Row: {
          created_at: string
          display_name: string | null
          external_device_id: string
          id: string
          provider: string
          room_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          external_device_id: string
          id?: string
          provider: string
          room_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          external_device_id?: string
          id?: string
          provider?: string
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_access_devices_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string | null
          id: string
          number: string
          rate_ghs: number
          status: Database["public"]["Enums"]["room_status"]
          type: Database["public"]["Enums"]["room_type"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          number: string
          rate_ghs: number
          status?: Database["public"]["Enums"]["room_status"]
          type: Database["public"]["Enums"]["room_type"]
        }
        Update: {
          created_at?: string | null
          id?: string
          number?: string
          rate_ghs?: number
          status?: Database["public"]["Enums"]["room_status"]
          type?: Database["public"]["Enums"]["room_type"]
        }
        Relationships: []
      }
      service_charges: {
        Row: {
          amount_ghs: number
          booking_id: string | null
          created_at: string | null
          description: string | null
          id: string
          payment_confirmed: boolean
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_id: string | null
          requested_by: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          type: Database["public"]["Enums"]["charge_type"]
        }
        Insert: {
          amount_ghs?: number
          booking_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          payment_confirmed?: boolean
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_id?: string | null
          requested_by?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          type: Database["public"]["Enums"]["charge_type"]
        }
        Update: {
          amount_ghs?: number
          booking_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          payment_confirmed?: boolean
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_id?: string | null
          requested_by?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          type?: Database["public"]["Enums"]["charge_type"]
        }
        Relationships: [
          {
            foreignKeyName: "service_charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_charges_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      service_request_events: {
        Row: {
          actor_name: string | null
          actor_role: string | null
          created_at: string
          event_type: string
          id: string
          message: string
          metadata: Json
          service_request_id: string
        }
        Insert: {
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata?: Json
          service_request_id: string
        }
        Update: {
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          metadata?: Json
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_events_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          assigned_staff_id: string | null
          booking_id: string | null
          category: Database["public"]["Enums"]["service_request_category"]
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_at: string | null
          guest_name: string | null
          id: string
          priority: Database["public"]["Enums"]["service_request_priority"]
          requested_by: string
          requested_by_role: string | null
          resolution_note: string | null
          room_id: string | null
          service_charge_id: string | null
          source: Database["public"]["Enums"]["service_request_source"]
          status: Database["public"]["Enums"]["service_request_status"]
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_staff_id?: string | null
          booking_id?: string | null
          category: Database["public"]["Enums"]["service_request_category"]
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          guest_name?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["service_request_priority"]
          requested_by: string
          requested_by_role?: string | null
          resolution_note?: string | null
          room_id?: string | null
          service_charge_id?: string | null
          source?: Database["public"]["Enums"]["service_request_source"]
          status?: Database["public"]["Enums"]["service_request_status"]
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_staff_id?: string | null
          booking_id?: string | null
          category?: Database["public"]["Enums"]["service_request_category"]
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          guest_name?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["service_request_priority"]
          requested_by?: string
          requested_by_role?: string | null
          resolution_note?: string | null
          room_id?: string | null
          service_charge_id?: string | null
          source?: Database["public"]["Enums"]["service_request_source"]
          status?: Database["public"]["Enums"]["service_request_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_service_charge_id_fkey"
            columns: ["service_charge_id"]
            isOneToOne: false
            referencedRelation: "service_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          ended_at: string | null
          id: string
          staff_id: string | null
          started_at: string | null
        }
        Insert: {
          ended_at?: string | null
          id?: string
          staff_id?: string | null
          started_at?: string | null
        }
        Update: {
          ended_at?: string | null
          id?: string
          staff_id?: string | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          auth_user_id: string | null
          created_at: string | null
          daily_rate_ghs: number
          id: string
          name: string
          on_shift: boolean
          role: string
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string | null
          daily_rate_ghs: number
          id?: string
          name: string
          on_shift?: boolean
          role: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string | null
          daily_rate_ghs?: number
          id?: string
          name?: string
          on_shift?: boolean
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      access_result: "granted" | "denied" | "expired"
      booking_status: "active" | "reserved" | "checked_out" | "cancelled"
      charge_type: "laundry" | "food" | "minibar" | "other"
      guest_kyc_status: "not_started" | "pending" | "verified" | "rejected"
      identity_document_status: "pending" | "verified" | "rejected" | "expired"
      identity_document_type: "ghana_card" | "passport" | "drivers_license" | "voter_id" | "other"
      manager_approval_status: "pending" | "approved" | "rejected"
      manager_approval_type: "booking_extension" | "service_receipt_confirmation" | "guest_kyc_review"
      operational_handoff_item_type:
        | "carryover_guest"
        | "unresolved_request"
        | "payment_risk"
        | "vip_arrival"
        | "room_issue"
        | "general"
      operational_handoff_priority: "normal" | "high" | "urgent"
      operational_handoff_status: "open" | "acknowledged" | "closed"
      pay_method: "cash" | "momo" | "bank_transfer" | "cheque"
      service_request_category:
        | "housekeeping"
        | "maintenance"
        | "laundry"
        | "food"
        | "minibar"
        | "billing"
        | "other"
      service_request_priority: "low" | "normal" | "high" | "urgent"
      service_request_source: "guest_portal" | "manager" | "reception"
      service_request_status:
        | "new"
        | "acknowledged"
        | "assigned"
        | "in_progress"
        | "completed"
        | "cancelled"
      room_status:
        | "vacant"
        | "occupied"
        | "cleaning"
        | "maintenance"
        | "reserved"
      room_type: "single" | "double" | "suite" | "family"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_result: ["granted", "denied", "expired"],
      booking_status: ["active", "reserved", "checked_out", "cancelled"],
      charge_type: ["laundry", "food", "minibar", "other"],
      manager_approval_status: ["pending", "approved", "rejected"],
      manager_approval_type: ["booking_extension", "service_receipt_confirmation", "guest_kyc_review"],
      pay_method: ["cash", "momo", "bank_transfer", "cheque"],
      service_request_category: [
        "housekeeping",
        "maintenance",
        "laundry",
        "food",
        "minibar",
        "billing",
        "other",
      ],
      service_request_priority: ["low", "normal", "high", "urgent"],
      service_request_source: ["guest_portal", "manager", "reception"],
      service_request_status: [
        "new",
        "acknowledged",
        "assigned",
        "in_progress",
        "completed",
        "cancelled",
      ],
      room_status: [
        "vacant",
        "occupied",
        "cleaning",
        "maintenance",
        "reserved",
      ],
      room_type: ["single", "double", "suite", "family"],
    },
  },
} as const
