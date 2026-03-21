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
          card_uid: string
          guest_name: string | null
          id: string
          issued_by: string | null
          keycard_id: string | null
          note: string | null
          result: Database["public"]["Enums"]["access_result"]
          room_id: string | null
        }
        Insert: {
          accessed_at?: string | null
          card_uid: string
          guest_name?: string | null
          id?: string
          issued_by?: string | null
          keycard_id?: string | null
          note?: string | null
          result: Database["public"]["Enums"]["access_result"]
          room_id?: string | null
        }
        Update: {
          accessed_at?: string | null
          card_uid?: string
          guest_name?: string | null
          id?: string
          issued_by?: string | null
          keycard_id?: string | null
          note?: string | null
          result?: Database["public"]["Enums"]["access_result"]
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_log_keycard_id_fkey"
            columns: ["keycard_id"]
            isOneToOne: false
            referencedRelation: "keycards"
            referencedColumns: ["id"]
          },
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
          local_keycard_id: string | null
          note: string | null
          provider: string
          provider_device_id: string | null
          provider_reference: string | null
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
          local_keycard_id?: string | null
          note?: string | null
          provider: string
          provider_device_id?: string | null
          provider_reference?: string | null
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
          local_keycard_id?: string | null
          note?: string | null
          provider?: string
          provider_device_id?: string | null
          provider_reference?: string | null
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
            foreignKeyName: "booking_access_credentials_local_keycard_id_fkey"
            columns: ["local_keycard_id"]
            isOneToOne: false
            referencedRelation: "keycards"
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
      door_controllers: {
        Row: {
          controller_id: string
          created_at: string
          firmware_version: string | null
          heartbeat_status: string
          last_card_uid: string | null
          last_error: string | null
          last_note: string | null
          last_result: Database["public"]["Enums"]["access_result"] | null
          last_seen_at: string
          room_id: string | null
          updated_at: string
        }
        Insert: {
          controller_id: string
          created_at?: string
          firmware_version?: string | null
          heartbeat_status?: string
          last_card_uid?: string | null
          last_error?: string | null
          last_note?: string | null
          last_result?: Database["public"]["Enums"]["access_result"] | null
          last_seen_at?: string
          room_id?: string | null
          updated_at?: string
        }
        Update: {
          controller_id?: string
          created_at?: string
          firmware_version?: string | null
          heartbeat_status?: string
          last_card_uid?: string | null
          last_error?: string | null
          last_note?: string | null
          last_result?: Database["public"]["Enums"]["access_result"] | null
          last_seen_at?: string
          room_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "door_controllers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
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
      keycards: {
        Row: {
          access_count: number
          booking_id: string | null
          card_uid: string
          id: string
          issued_at: string | null
          issued_by: string
          issued_to: string
          room_id: string | null
          scope: string
          status: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          access_count?: number
          booking_id?: string | null
          card_uid: string
          id?: string
          issued_at?: string | null
          issued_by: string
          issued_to: string
          room_id?: string | null
          scope?: string
          status?: string
          valid_from: string
          valid_until: string
        }
        Update: {
          access_count?: number
          booking_id?: string | null
          card_uid?: string
          id?: string
          issued_at?: string | null
          issued_by?: string
          issued_to?: string
          room_id?: string | null
          scope?: string
          status?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "keycards_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keycards_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          booking_id: string | null
          created_at: string | null
          id: string
          keycard_id: string | null
          message: string
          read: boolean
          triggered_by: string
          type: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          keycard_id?: string | null
          message: string
          read?: boolean
          triggered_by: string
          type: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          keycard_id?: string | null
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
          },
          {
            foreignKeyName: "notifications_keycard_id_fkey"
            columns: ["keycard_id"]
            isOneToOne: false
            referencedRelation: "keycards"
            referencedColumns: ["id"]
          },
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
      pay_method: "cash" | "momo" | "bank_transfer" | "cheque"
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
      pay_method: ["cash", "momo", "bank_transfer", "cheque"],
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
