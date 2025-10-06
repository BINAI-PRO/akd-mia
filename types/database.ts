// types/database.ts
// -----------------------------------------------------------------------------
// Supabase types for ATP Pilates Time (subset used by the admin panel).
// Includes instructors, class types, rooms, apparatus and related pivots.
// -----------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      // -----------------------------
      //  CLIENTES
      // -----------------------------
      clients: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          email: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          full_name?: string
          phone?: string | null
          email?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string | null
          email?: string | null
          created_at?: string | null
        }
        Relationships: []
      }

      // -----------------------------
      //  INSTRUCTORES
      // -----------------------------
      instructors: {
        Row: {
          id: string
          full_name: string
          email: string | null
          phone1: string | null
          phone2: string | null
          phone1_has_whatsapp: boolean | null
          phone2_has_whatsapp: boolean | null
          created_at: string | null
          bio: string | null
        }
        Insert: {
          id?: string
          full_name?: string
          email?: string | null
          phone1?: string | null
          phone2?: string | null
          phone1_has_whatsapp?: boolean | null
          phone2_has_whatsapp?: boolean | null
          created_at?: string | null
          bio?: string | null
        }
        Update: {
          id?: string
          full_name?: string
          email?: string | null
          phone1?: string | null
          phone2?: string | null
          phone1_has_whatsapp?: boolean | null
          phone2_has_whatsapp?: boolean | null
          created_at?: string | null
          bio?: string | null
        }
        Relationships: []
      }

      // -----------------------------
      //  TIPOS DE CLASE
      // -----------------------------
      class_types: {
        Row: {
          id: string
          name: string
          description: string | null
        }
        Insert: {
          id?: string
          name?: string
          description?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
        }
        Relationships: []
      }

      // -----------------------------
      //  TIPOS DE MEMBRESÍA
      // -----------------------------
      membership_types: {
        Row: {
          id: string
          name: string
          description: string | null
          billing_period: string
          access_type: string
          price: number
          currency: string
          class_quota: number | null
          is_active: boolean
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name?: string
          description?: string | null
          billing_period?: string
          access_type?: string
          price?: number
          currency?: string
          class_quota?: number | null
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          billing_period?: string
          access_type?: string
          price?: number
          currency?: string
          class_quota?: number | null
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }

      // ----------------------------------------------------
      //  RELACION INSTRUCTOR <-> TIPO DE CLASE (pivot)
      // ----------------------------------------------------
      instructor_class_types: {
        Row: {
          instructor_id: string
          class_type_id: string
          certified: boolean
          certified_at: string | null
          notes: string | null
        }
        Insert: {
          instructor_id: string
          class_type_id: string
          certified?: boolean
          certified_at?: string | null
          notes?: string | null
        }
        Update: {
          instructor_id?: string
          class_type_id?: string
          certified?: boolean
          certified_at?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instructor_class_types_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_class_types_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          }
        ]
      }

      // ----------------------------------------------------
      //  DISPONIBILIDAD TÍPICA DE INSTRUCTORES
      // ----------------------------------------------------
      instructor_weekly_availability: {
        Row: {
          id: string
          instructor_id: string
          weekday: number
          start_time: string
          end_time: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          instructor_id: string
          weekday: number
          start_time: string
          end_time: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          instructor_id?: string
          weekday?: number
          start_time?: string
          end_time?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instructor_weekly_availability_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          }
        ]
      }

      // ----------------------------------------------------
      //  SEMANAS ATÍPICAS (cabecera)
      // ----------------------------------------------------
      instructor_week_overrides: {
        Row: {
          id: string
          instructor_id: string
          week_start_date: string
          label: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          instructor_id: string
          week_start_date: string
          label?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          instructor_id?: string
          week_start_date?: string
          label?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instructor_week_overrides_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          }
        ]
      }

      // ----------------------------------------------------
      //  SEMANAS ATÍPICAS (rangos por día)
      // ----------------------------------------------------
      instructor_week_override_slots: {
        Row: {
          id: string
          override_id: string
          weekday: number
          start_time: string
          end_time: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          override_id: string
          weekday: number
          start_time: string
          end_time: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          override_id?: string
          weekday?: number
          start_time?: string
          end_time?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instructor_week_override_slots_override_id_fkey"
            columns: ["override_id"]
            isOneToOne: false
            referencedRelation: "instructor_week_overrides"
            referencedColumns: ["id"]
          }
        ]
      }

      courses: {
        Row: {
          id: string
          title: string
          description: string | null
          short_description: string | null
          price: number | null
          currency: string
          duration_label: string | null
          level: string | null
          category: string | null
          session_count: number
          session_duration_minutes: number
          lead_instructor_id: string | null
          class_type_id: string | null
          default_room_id: string | null
          visibility: string
          status: string
          tags: string[]
          cover_image_url: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          title?: string
          description?: string | null
          short_description?: string | null
          price?: number | null
          currency?: string
          duration_label?: string | null
          level?: string | null
          category?: string | null
          session_count?: number
          session_duration_minutes?: number
          lead_instructor_id?: string | null
          class_type_id?: string | null
          default_room_id?: string | null
          visibility?: string
          status?: string
          tags?: string[]
          cover_image_url?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          short_description?: string | null
          price?: number | null
          currency?: string
          duration_label?: string | null
          level?: string | null
          category?: string | null
          session_count?: number
          session_duration_minutes?: number
          lead_instructor_id?: string | null
          class_type_id?: string | null
          default_room_id?: string | null
          visibility?: string
          status?: string
          tags?: string[]
          cover_image_url?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_class_type_id_fkey",
            columns: ["class_type_id"],
            isOneToOne: false,
            referencedRelation: "class_types",
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_lead_instructor_id_fkey",
            columns: ["lead_instructor_id"],
            isOneToOne: false,
            referencedRelation: "instructors",
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_default_room_id_fkey",
            columns: ["default_room_id"],
            isOneToOne: false,
            referencedRelation: "rooms",
            referencedColumns: ["id"]
          }
        ]
      }

      // -----------------------------
      //  APARATOS
      // -----------------------------
      apparatus: {
        Row: {
          id: string
          name: string
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          created_at?: string | null
        }
        Relationships: []
      }

      // -----------------------------
      //  SALAS
      // -----------------------------
      rooms: {
        Row: {
          id: string
          name: string
          capacity: number
          location?: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          capacity: number
          location?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          capacity?: number
          location?: string | null
          created_at?: string | null
        }
        Relationships: []
      }

      sessions: {
        Row: {
          id: string
          course_id: string | null
          class_type_id: string
          instructor_id: string
          room_id: string
          start_time: string
          end_time: string
          capacity: number
          current_occupancy: number
          created_at: string | null
        }
        Insert: {
          id?: string
          course_id?: string | null
          class_type_id?: string
          instructor_id?: string
          room_id?: string
          start_time?: string
          end_time?: string
          capacity?: number
          current_occupancy?: number
          created_at?: string | null
        }
        Update: {
          id?: string
          course_id?: string | null
          class_type_id?: string
          instructor_id?: string
          room_id?: string
          start_time?: string
          end_time?: string
          capacity?: number
          current_occupancy?: number
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_course_id_fkey",
            columns: ["course_id"],
            isOneToOne: false,
            referencedRelation: "courses",
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_class_type_id_fkey",
            columns: ["class_type_id"],
            isOneToOne: false,
            referencedRelation: "class_types",
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_instructor_id_fkey",
            columns: ["instructor_id"],
            isOneToOne: false,
            referencedRelation: "instructors",
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_room_id_fkey",
            columns: ["room_id"],
            isOneToOne: false,
            referencedRelation: "rooms",
            referencedColumns: ["id"]
          }
        ]
      }

      // -----------------------------
      //  MEMBRESÍAS
      // -----------------------------
      memberships: {
        Row: {
          id: string
          client_id: string
          membership_type_id: string
          status: string
          start_date: string
          end_date: string
          next_billing_date: string | null
          auto_renew: boolean
          assigned_session_id: string | null
          remaining_classes: number | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          membership_type_id: string
          status?: string
          start_date?: string
          end_date?: string
          next_billing_date?: string | null
          auto_renew?: boolean
          assigned_session_id?: string | null
          remaining_classes?: number | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          membership_type_id?: string
          status?: string
          start_date?: string
          end_date?: string
          next_billing_date?: string | null
          auto_renew?: boolean
          assigned_session_id?: string | null
          remaining_classes?: number | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_client_id_fkey",
            columns: ["client_id"],
            isOneToOne: false,
            referencedRelation: "clients",
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_membership_type_id_fkey",
            columns: ["membership_type_id"],
            isOneToOne: false,
            referencedRelation: "membership_types",
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_assigned_session_id_fkey",
            columns: ["assigned_session_id"],
            isOneToOne: false,
            referencedRelation: "sessions",
            referencedColumns: ["id"]
          }
        ]
      }

      room_apparatus: {
        Row: {
          id: string
          room_id: string
          apparatus_id: string
          quantity: number
          created_at: string | null
        }
        Insert: {
          id?: string
          room_id: string
          apparatus_id: string
          quantity: number
          created_at?: string | null
        }
        Update: {
          id?: string
          room_id?: string
          apparatus_id?: string
          quantity?: number
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_apparatus_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_apparatus_apparatus_id_fkey"
            columns: ["apparatus_id"]
            isOneToOne: false
            referencedRelation: "apparatus"
            referencedColumns: ["id"]
          }
        ]
      }

      room_blocks: {
        Row: {
          id: string
          room_id: string
          starts_at: string
          ends_at: string
          reason: string | null
          note: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          room_id: string
          starts_at: string
          ends_at: string
          reason?: string | null
          note?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          room_id?: string
          starts_at?: string
          ends_at?: string
          reason?: string | null
          note?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_blocks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          }
        ]
      }

      room_recurring_blocks: {
        Row: {
          id: string
          room_id: string
          weekday: number
          start_time: string
          end_time: string
          reason: string | null
          note: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          room_id: string
          weekday: number
          start_time: string
          end_time: string
          reason?: string | null
          note?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          room_id?: string
          weekday?: number
          start_time?: string
          end_time?: string
          reason?: string | null
          note?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_recurring_blocks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          }
        ]
      }

      bookings: {
        Row: {
          id: string
          session_id: string
          client_id: string
          apparatus_id: string | null
          status: string
          reserved_at: string
        }
        Insert: {
          id?: string
          session_id: string
          client_id: string
          apparatus_id?: string | null
          status?: string
          reserved_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          client_id?: string
          apparatus_id?: string | null
          status?: string
          reserved_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_session_id_fkey",
            columns: ["session_id"],
            isOneToOne: false,
            referencedRelation: "sessions",
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_client_id_fkey",
            columns: ["client_id"],
            isOneToOne: false,
            referencedRelation: "clients",
            referencedColumns: ["id"]
          }
        ]
      }

      membership_payments: {
        Row: {
          id: string
          membership_id: string
          amount: number
          currency: string
          paid_at: string
          period_start: string
          period_end: string
          status: string
          provider_ref: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          membership_id: string
          amount: number
          currency?: string
          paid_at?: string
          period_start: string
          period_end: string
          status?: string
          provider_ref?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          membership_id?: string
          amount?: number
          currency?: string
          paid_at?: string
          period_start?: string
          period_end?: string
          status?: string
          provider_ref?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_payments_membership_id_fkey",
            columns: ["membership_id"],
            isOneToOne: false,
            referencedRelation: "memberships",
            referencedColumns: ["id"]
          }
        ]
      }

      // -----------------------------------------------------------------
      //  Respaldo: otras tablas permanecen con tipado laxo hasta definirlas
      // -----------------------------------------------------------------
      [otherTable: string]: any
    }

    Views: {
      [key: string]: any
    }

    Functions: {
      [key: string]: any
    }

    Enums: {
      [key: string]: string
    }

    CompositeTypes: {
      [key: string]: any
    }
  }
}

export type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  T extends keyof PublicSchema["Tables"] & string
> = PublicSchema["Tables"][T] extends { Row: infer R } ? R : never

export type TablesInsert<
  T extends keyof PublicSchema["Tables"] & string
> = PublicSchema["Tables"][T] extends { Insert: infer I } ? I : never

export type TablesUpdate<
  T extends keyof PublicSchema["Tables"] & string
> = PublicSchema["Tables"][T] extends { Update: infer U } ? U : never

export type Enums<
  T extends keyof PublicSchema["Enums"] & string
> = PublicSchema["Enums"][T]

